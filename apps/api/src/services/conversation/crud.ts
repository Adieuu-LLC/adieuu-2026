/**
 * Conversation CRUD: create, get, list.
 *
 * @module services/conversation/crud
 */

import { ObjectId } from 'mongodb';
import { getConversationRepository } from '../../repositories/conversation.repository';
import { getFriendshipRepository } from '../../repositories/friendship.repository';
import { getBlockRepository } from '../../repositories/block.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getGroupInviteRepository } from '../../repositories/group-invite.repository';
import { createNotification } from '../notification.service';
import { checkAndAward } from '../achievement.service';
import {
  toPublicConversation,
  MAX_GROUP_PARTICIPANTS,
  newParticipantJoinMapForIds,
  type PublicConversation,
} from '../../models/conversation';
import { toPublicGroupInvite } from '../../models/group-invite';
import type { ConversationResult } from './types';
import { appendGroupInviteSystemMessageAndNotify } from './group-invite-messages';
import { publishConversationEvent } from './redis-events';

export async function createConversation(
  creatorIdentityId: string | ObjectId,
  type: 'dm' | 'group',
  participantIds: string[],
  encryptedName?: string,
  nameNonce?: string,
  forceNew?: boolean
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();
  const friendshipRepo = getFriendshipRepository();
  const blockRepo = getBlockRepository();
  const identityRepo = getIdentityRepository();

  const creatorObjId =
    creatorIdentityId instanceof ObjectId
      ? creatorIdentityId
      : new ObjectId(creatorIdentityId as string);

  const participantObjIds = participantIds.map((id) => new ObjectId(id));

  if (type === 'group' && forceNew) {
    return { success: false, error: 'forceNew applies only to direct messages', errorCode: 'INVALID_TYPE' };
  }

  // DM: exactly one other participant
  if (type === 'dm') {
    if (participantObjIds.length !== 1) {
      return { success: false, error: 'DMs require exactly one other participant', errorCode: 'INVALID_TYPE' };
    }

    const otherObjId = participantObjIds[0]!;
    if (creatorObjId.equals(otherObjId)) {
      return { success: false, error: 'Cannot start a DM with yourself', errorCode: 'CANNOT_MESSAGE_SELF' };
    }

    // Check friendship
    const areFriends = await friendshipRepo.areFriends(creatorObjId, otherObjId);
    if (!areFriends) {
      return { success: false, error: 'You can only message friends', errorCode: 'NOT_FRIENDS' };
    }

    // Check blocks
    const isBlocked = await blockRepo.isBlockedByEither(creatorObjId, otherObjId);
    if (isBlocked) {
      return { success: false, error: 'Cannot message this identity', errorCode: 'BLOCKED' };
    }

    // Deduplicate: return existing DM unless client starts a separate thread
    const existing = await conversationRepo.findByParticipants('dm', creatorObjId, otherObjId);
    if (existing && !forceNew) {
      return { success: true, conversation: toPublicConversation(existing) };
    }

    const allParticipants = [creatorObjId, otherObjId];
    const conversation = await conversationRepo.createConversation({
      type: 'dm',
      participants: allParticipants,
      createdBy: creatorObjId,
      admins: [],
      participantJoinedAtByIdentityId: newParticipantJoinMapForIds(allParticipants),
    });

    const publicConv = toPublicConversation(conversation);

    await identityRepo.incrementConversationsJoinedCounts(allParticipants);

    // Notify the other participant
    await publishConversationEvent(otherObjId.toHexString(), {
      type: 'conversation_created',
      data: { conversation: publicConv },
    });

    const creatorIdentity = await identityRepo.findByIdentityId(creatorObjId);
    if (creatorIdentity) {
      await createNotification(otherObjId, 'conversation_created', {
        conversationId: publicConv.id,
        conversationType: 'dm',
        fromIdentity: {
          id: creatorIdentity._id.toHexString(),
          username: creatorIdentity.username,
          displayName: creatorIdentity.displayName,
          avatarUrl: creatorIdentity.avatarUrl,
        },
      });
    }

    return { success: true, conversation: publicConv };
  }

  // Group: validate participants
  if (type === 'group') {
    const allParticipants = [creatorObjId, ...participantObjIds];
    const uniqueIds = [...new Set(allParticipants.map((id) => id.toHexString()))];

    if (uniqueIds.length > MAX_GROUP_PARTICIPANTS) {
      return {
        success: false,
        error: `Groups are limited to ${MAX_GROUP_PARTICIPANTS} participants`,
        errorCode: 'TOO_MANY_PARTICIPANTS',
      };
    }

    if (uniqueIds.length < 2) {
      return { success: false, error: 'Groups require at least one other participant', errorCode: 'INVALID_TYPE' };
    }

    // Validate each participant: must exist, be friends, not blocked
    for (const participantId of participantObjIds) {
      if (creatorObjId.equals(participantId)) continue;

      const identity = await identityRepo.findByIdentityId(participantId);
      if (!identity) {
        return { success: false, error: 'One or more participants not found', errorCode: 'IDENTITY_NOT_FOUND' };
      }

      const areFriends = await friendshipRepo.areFriends(creatorObjId, participantId);
      if (!areFriends) {
        return { success: false, error: 'You can only add friends to group conversations', errorCode: 'NOT_FRIENDS' };
      }

      const isBlocked = await blockRepo.isBlockedByEither(creatorObjId, participantId);
      if (isBlocked) {
        return { success: false, error: 'Cannot add this identity', errorCode: 'BLOCKED' };
      }
    }

    // Separate direct-add members from invite-required members
    const directAddIds: ObjectId[] = [];
    const inviteRequiredIds: ObjectId[] = [];
    const groupInviteRepo = getGroupInviteRepository();

    for (const participantId of participantObjIds) {
      if (creatorObjId.equals(participantId)) continue;
      const identity = await identityRepo.findByIdentityId(participantId);
      if (identity?.requireGroupApproval) {
        inviteRequiredIds.push(participantId);
      } else {
        directAddIds.push(participantId);
      }
    }

    const initialParticipants = [creatorObjId, ...directAddIds];

    const conversation = await conversationRepo.createConversation({
      type: 'group',
      participants: initialParticipants,
      createdBy: creatorObjId,
      admins: [creatorObjId],
      encryptedName,
      nameNonce,
      participantJoinedAtByIdentityId: newParticipantJoinMapForIds(initialParticipants),
    });

    const publicConv = toPublicConversation(conversation);

    await identityRepo.incrementConversationsJoinedCounts(initialParticipants);

    // Notify direct-add members
    const creatorIdentity = await identityRepo.findByIdentityId(creatorObjId);
    for (const memberId of directAddIds) {
      await publishConversationEvent(memberId.toHexString(), {
        type: 'conversation_created',
        data: { conversation: publicConv },
      });

      if (creatorIdentity) {
        await createNotification(memberId, 'conversation_created', {
          conversationId: publicConv.id,
          conversationType: 'group',
          fromIdentity: {
            id: creatorIdentity._id.toHexString(),
            username: creatorIdentity.username,
            displayName: creatorIdentity.displayName,
            avatarUrl: creatorIdentity.avatarUrl,
          },
        });
      }
    }

    // Create invites for members who require approval
    for (const inviteId of inviteRequiredIds) {
      const invite = await groupInviteRepo.createInvite({
        conversationId: conversation._id,
        invitedIdentityId: inviteId,
        invitedByIdentityId: creatorObjId,
        hasGroupName: !!(encryptedName && nameNonce),
        memberCount: initialParticipants.length,
      });

      await publishConversationEvent(inviteId.toHexString(), {
        type: 'group_invite_received',
        data: { invite: toPublicGroupInvite(invite) },
      });

      await createNotification(inviteId, 'group_invite_received', {
        inviteId: invite._id.toHexString(),
        conversationId: publicConv.id,
        invitedBy: creatorIdentity
          ? {
              id: creatorIdentity._id.toHexString(),
              username: creatorIdentity.username,
              displayName: creatorIdentity.displayName,
              avatarUrl: creatorIdentity.avatarUrl,
            }
          : undefined,
        memberCount: initialParticipants.length,
      });

      const invitedDoc = await identityRepo.findByIdentityId(inviteId);
      const inviterDoc = creatorIdentity ?? (await identityRepo.findByIdentityId(creatorObjId));
      if (invitedDoc && inviterDoc) {
        await appendGroupInviteSystemMessageAndNotify(
          conversation._id,
          invitedDoc,
          inviterDoc,
          initialParticipants
        );
      }
    }

    checkAndAward(creatorObjId, 'group_created').catch(() => {});

    return { success: true, conversation: publicConv };
  }

  return { success: false, error: 'Invalid conversation type', errorCode: 'INVALID_TYPE' };
}

/**
 * Get a conversation by ID, verifying the requester is a participant.
 */
export async function getConversation(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  const isParticipant = conversation.participants.some((p) => p.equals(requesterObjId));
  if (!isParticipant) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  return { success: true, conversation: toPublicConversation(conversation) };
}

/**
 * List conversations for an identity, sorted by most recent message.
 */
export async function listConversations(
  identityId: string | ObjectId,
  limit = 50,
  cursor?: string
): Promise<{ conversations: PublicConversation[]; cursor: string | null }> {
  const conversationRepo = getConversationRepository();

  const identityObjId =
    identityId instanceof ObjectId ? identityId : new ObjectId(identityId as string);
  const cursorObjId = cursor ? new ObjectId(cursor) : undefined;

  const conversations = await conversationRepo.findForIdentity(
    identityObjId,
    limit + 1,
    cursorObjId
  );

  const hasMore = conversations.length > limit;
  const result = hasMore ? conversations.slice(0, limit) : conversations;

  return {
    conversations: result.map(toPublicConversation),
    cursor:
      hasMore && result.length > 0
        ? result[result.length - 1]!._id.toHexString()
        : null,
  };
}
