/**
 * @fileoverview Conversation Service
 *
 * Provides conversation and message management for DMs and groups.
 * Handles creation, membership, messaging, and real-time event publishing.
 *
 * PRIVACY NOTES:
 * - All operations are identity-scoped (never linked to User)
 * - Message content is E2E encrypted; server handles only ciphertext
 * - Friendship and block checks enforced before conversation/member operations
 *
 * @module services/conversation
 */

import { ObjectId } from 'mongodb';
import { getConversationRepository } from '../repositories/conversation.repository';
import { getMessageRepository } from '../repositories/message.repository';
import { getGroupInviteRepository } from '../repositories/group-invite.repository';
import { getFriendshipRepository } from '../repositories/friendship.repository';
import { getBlockRepository } from '../repositories/block.repository';
import { getIdentityRepository } from '../repositories/identity.repository';
import { getReactionRepository } from '../repositories/reaction.repository';
import { createNotification } from './notification.service';
import {
  toPublicConversation,
  type ConversationDocument,
  type PublicConversation,
  type CreateConversationInput,
  MAX_GROUP_PARTICIPANTS,
} from '../models/conversation';
import {
  toPublicMessage,
  type PublicMessage,
  type CreateMessageInput,
} from '../models/message';
import {
  toPublicGroupInvite,
  type PublicGroupInvite,
  type GroupInvitePreview,
  type GroupInvitePreviewMember,
} from '../models/group-invite';
import { toPublicIdentity } from '../models/identity';
import { getE2EMediaRepository } from '../repositories/e2e-media.repository';
import { deleteE2EMedia } from './e2e-upload.service';
import { getRedis, isRedisConnected, RedisKeys } from '../db';
import { config } from '../config';
import elog from '../utils/adieuuLogger';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ConversationResult {
  success: boolean;
  conversation?: PublicConversation;
  error?: string;
  errorCode?:
    | 'NOT_FRIENDS'
    | 'BLOCKED'
    | 'IDENTITY_NOT_FOUND'
    | 'CONVERSATION_EXISTS'
    | 'CONVERSATION_NOT_FOUND'
    | 'NOT_PARTICIPANT'
    | 'NOT_CREATOR'
    | 'NOT_ADMIN'
    | 'ALREADY_ADMIN'
    | 'TARGET_IS_ADMIN'
    | 'TOO_MANY_PARTICIPANTS'
    | 'CANNOT_MESSAGE_SELF'
    | 'INVALID_TYPE';
}

export interface MessageResult {
  success: boolean;
  message?: PublicMessage;
  error?: string;
  errorCode?:
    | 'CONVERSATION_NOT_FOUND'
    | 'NOT_PARTICIPANT'
    | 'DUPLICATE_MESSAGE'
    | 'MESSAGE_NOT_FOUND'
    | 'NOT_SENDER'
    | 'INVALID_REPLY_TARGET'
    | 'INVALID_MEDIA';
}

export interface GroupInviteResult {
  success: boolean;
  invite?: PublicGroupInvite;
  error?: string;
  errorCode?:
    | 'INVITE_NOT_FOUND'
    | 'NOT_AUTHORIZED'
    | 'ALREADY_MEMBER'
    | 'INVITE_EXISTS';
}

export interface GroupInvitePreviewResult {
  success: boolean;
  preview?: GroupInvitePreview;
  error?: string;
  errorCode?:
    | 'INVITE_NOT_FOUND'
    | 'NOT_AUTHORIZED'
    | 'CONVERSATION_NOT_FOUND';
}

// ---------------------------------------------------------------------------
// Redis event publishing
// ---------------------------------------------------------------------------

async function publishConversationEvent(
  recipientIdentityId: string,
  event: Record<string, unknown>
): Promise<void> {
  if (!isRedisConnected()) {
    elog.warn('Skipping conversation event publish: Redis not connected', {
      recipientIdentityId,
      eventType: event.type,
    });
    return;
  }

  try {
    const redis = getRedis();
    const channel = `${config.redis.keyPrefix}${RedisKeys.identityChannel(recipientIdentityId)}`;
    const receivers = await redis.publish(channel, JSON.stringify(event));
    elog.info('Published conversation event to Redis', {
      channel,
      eventType: event.type,
      recipientIdentityId,
      receivers,
    });
  } catch (error) {
    elog.warn('Failed to publish conversation event via Redis', {
      error,
      recipientIdentityId,
    });
  }
}

/**
 * Publish an event to all participants except the excluded identity.
 */
async function publishToParticipants(
  participantIds: ObjectId[],
  excludeIdentityId: ObjectId,
  event: Record<string, unknown>
): Promise<void> {
  const excludeHex = excludeIdentityId.toHexString();
  await Promise.all(
    participantIds
      .filter((id) => id.toHexString() !== excludeHex)
      .map((id) => publishConversationEvent(id.toHexString(), event))
  );
}

/**
 * Check whether an identity has admin privileges on a conversation.
 * Falls back to createdBy for legacy conversations without an admins array.
 */
function isGroupAdmin(
  conversation: ConversationDocument,
  identityId: ObjectId
): boolean {
  if (conversation.admins?.length) {
    return conversation.admins.some((a) => a.equals(identityId));
  }
  return conversation.createdBy.equals(identityId);
}

// ---------------------------------------------------------------------------
// Conversation operations
// ---------------------------------------------------------------------------

/**
 * Create a new DM or group conversation.
 * - DMs: Deduplicates by participant pair; returns existing if found.
 * - Groups: Validates all participants are friends of creator, respects
 *   requireGroupApproval preference.
 */
export async function createConversation(
  creatorIdentityId: string | ObjectId,
  type: 'dm' | 'group',
  participantIds: string[],
  encryptedName?: string,
  nameNonce?: string
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

    // Deduplicate: return existing DM if one exists
    const existing = await conversationRepo.findByParticipants('dm', creatorObjId, otherObjId);
    if (existing) {
      return { success: true, conversation: toPublicConversation(existing) };
    }

    const allParticipants = [creatorObjId, otherObjId];
    const conversation = await conversationRepo.createConversation({
      type: 'dm',
      participants: allParticipants,
      createdBy: creatorObjId,
      admins: [],
    });

    const publicConv = toPublicConversation(conversation);

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
    });

    const publicConv = toPublicConversation(conversation);

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
    }

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

// ---------------------------------------------------------------------------
// Message operations
// ---------------------------------------------------------------------------

/**
 * Send an encrypted message to a conversation.
 * Validates participant membership and deduplicates by clientMessageId.
 */
export async function sendMessage(
  conversationId: string | ObjectId,
  senderIdentityId: string | ObjectId,
  input: Omit<CreateMessageInput, 'conversationId' | 'fromIdentityId'>
): Promise<MessageResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const senderObjId =
    senderIdentityId instanceof ObjectId
      ? senderIdentityId
      : new ObjectId(senderIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  const isParticipant = conversation.participants.some((p) => p.equals(senderObjId));
  if (!isParticipant) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  // Deduplicate by clientMessageId
  const existing = await messageRepo.findByClientMessageId(convObjId, input.clientMessageId);
  if (existing) {
    return {
      success: true,
      message: toPublicMessage(existing, senderObjId),
    };
  }

  if (input.e2eMediaIds?.length) {
    const e2eRepo = getE2EMediaRepository();
    const mediaRecords = await e2eRepo.findManyByE2EMediaIds(input.e2eMediaIds);

    if (mediaRecords.length !== input.e2eMediaIds.length) {
      return { success: false, error: 'One or more E2E media references not found', errorCode: 'INVALID_MEDIA' as const };
    }

    for (const media of mediaRecords) {
      if (!media.identityId.equals(senderObjId)) {
        return { success: false, error: 'E2E media does not belong to sender', errorCode: 'INVALID_MEDIA' as const };
      }
      if (media.status === 'pending') {
        return { success: false, error: 'E2E media upload has not been completed', errorCode: 'INVALID_MEDIA' as const };
      }
    }
  }

  const { replyToMessageId: replyFromInput, ...messageFields } = input;

  let resolvedReplyId: ObjectId | undefined;
  let replyTargetAuthorId: ObjectId | undefined;
  if (replyFromInput) {
    const replyOid =
      replyFromInput instanceof ObjectId
        ? replyFromInput
        : new ObjectId(String(replyFromInput));
    const parent = await messageRepo.findByIdInConversation(convObjId, replyOid);
    if (!parent) {
      return {
        success: false,
        error: 'Reply target not found in this conversation',
        errorCode: 'INVALID_REPLY_TARGET',
      };
    }
    replyTargetAuthorId = parent.fromIdentityId;
    resolvedReplyId = replyOid;
  }

  const message = await messageRepo.createMessage({
    ...messageFields,
    ...(resolvedReplyId ? { replyToMessageId: resolvedReplyId } : {}),
    conversationId: convObjId,
    fromIdentityId: senderObjId,
  });

  if (input.e2eMediaIds?.length && message.expiresAt) {
    const e2eRepo = getE2EMediaRepository();
    await e2eRepo.setExpiresAt(input.e2eMediaIds, message.expiresAt);
  }

  // Update conversation lastMessage metadata
  await conversationRepo.updateLastMessage(convObjId, message._id, message.createdAt);

  const publicMessage = toPublicMessage(message, senderObjId);

  // Publish to all other participants (per-member fan-out)
  await publishToParticipants(conversation.participants, senderObjId, {
    type: 'conversation_message',
    data: {
      conversationId: convObjId.toHexString(),
      messageId: message._id.toHexString(),
      fromIdentityId: senderObjId.toHexString(),
      createdAt: message.createdAt.toISOString(),
      ...(resolvedReplyId && replyTargetAuthorId
        ? {
            replyToMessageId: resolvedReplyId.toHexString(),
            replyToMessageAuthorId: replyTargetAuthorId.toHexString(),
          }
        : {}),
    },
  });

  // Create persistent notifications for other participants
  for (const participantId of conversation.participants) {
    if (participantId.equals(senderObjId)) continue;
    if (replyTargetAuthorId && participantId.equals(replyTargetAuthorId)) {
      await createNotification(participantId, 'conversation_message_reply', {
        conversationId: convObjId.toHexString(),
        messageId: message._id.toHexString(),
        fromIdentityId: senderObjId.toHexString(),
        replyToMessageId: resolvedReplyId!.toHexString(),
      });
    } else {
      await createNotification(participantId, 'conversation_message', {
        conversationId: convObjId.toHexString(),
        messageId: message._id.toHexString(),
        fromIdentityId: senderObjId.toHexString(),
      });
    }
  }

  return { success: true, message: publicMessage };
}

/**
 * Get messages for a conversation with cursor-based pagination.
 */
export async function getMessages(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  limit = 50,
  cursor?: string
): Promise<{ messages: PublicMessage[]; cursor: string | null } | MessageResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();

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

  const cursorObjId = cursor ? new ObjectId(cursor) : undefined;
  const messages = await messageRepo.findByConversation(convObjId, limit + 1, cursorObjId);

  const hasMore = messages.length > limit;
  const result = hasMore ? messages.slice(0, limit) : messages;

  return {
    messages: result.map((m) => toPublicMessage(m, requesterObjId)),
    cursor:
      hasMore && result.length > 0
        ? result[result.length - 1]!._id.toHexString()
        : null,
  };
}

/**
 * Delete a message for the requesting identity only.
 * The message remains visible to other participants.
 */
export async function deleteMessageForSelf(
  conversationId: string | ObjectId,
  messageId: string | ObjectId,
  requesterIdentityId: string | ObjectId
): Promise<MessageResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const msgObjId =
    messageId instanceof ObjectId ? messageId : new ObjectId(messageId as string);
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

  const message = await messageRepo.findById(msgObjId);
  if (!message || !message.conversationId.equals(convObjId)) {
    return { success: false, error: 'Message not found', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  await messageRepo.markDeletedForIdentity(msgObjId, requesterObjId);

  return { success: true, message: toPublicMessage(message, requesterObjId) };
}

/**
 * Delete a message for all participants (sender only).
 * Replaces content with a tombstone and notifies all members.
 */
export async function deleteMessageForEveryone(
  conversationId: string | ObjectId,
  messageId: string | ObjectId,
  requesterIdentityId: string | ObjectId
): Promise<MessageResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const msgObjId =
    messageId instanceof ObjectId ? messageId : new ObjectId(messageId as string);
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

  const message = await messageRepo.findById(msgObjId);
  if (!message || !message.conversationId.equals(convObjId)) {
    return { success: false, error: 'Message not found', errorCode: 'MESSAGE_NOT_FOUND' };
  }

  if (!message.fromIdentityId.equals(requesterObjId)) {
    return { success: false, error: 'Only the sender can delete for everyone', errorCode: 'NOT_SENDER' };
  }

  await messageRepo.markDeletedForEveryone(msgObjId);

  const reactionRepo = getReactionRepository();
  await reactionRepo.deleteByMessage(msgObjId);

  if (message.e2eMediaIds?.length) {
    for (const e2eMediaId of message.e2eMediaIds) {
      await deleteE2EMedia(e2eMediaId).catch((err) => {
        elog.error('Failed to delete E2E media during message deletion', { e2eMediaId, err });
      });
    }
  }

  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_message_deleted',
    data: {
      conversationId: convObjId.toHexString(),
      messageId: msgObjId.toHexString(),
      deletedBy: requesterObjId.toHexString(),
      forEveryone: true,
    },
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Group management
// ---------------------------------------------------------------------------

/**
 * Add a member to a group conversation (admin only).
 * Respects requireGroupApproval preference -- creates an invite if needed.
 */
export async function addGroupMember(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  newMemberIdentityId: string | ObjectId
): Promise<ConversationResult | GroupInviteResult> {
  const conversationRepo = getConversationRepository();
  const friendshipRepo = getFriendshipRepository();
  const blockRepo = getBlockRepository();
  const identityRepo = getIdentityRepository();
  const groupInviteRepo = getGroupInviteRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);
  const newMemberObjId =
    newMemberIdentityId instanceof ObjectId
      ? newMemberIdentityId
      : new ObjectId(newMemberIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation || conversation.type !== 'group') {
    return { success: false, error: 'Group conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can add members', errorCode: 'NOT_ADMIN' };
  }

  if (conversation.participants.some((p) => p.equals(newMemberObjId))) {
    return { success: false, error: 'Already a member', errorCode: 'ALREADY_MEMBER' } as GroupInviteResult;
  }

  if (conversation.participants.length >= MAX_GROUP_PARTICIPANTS) {
    return { success: false, error: `Groups are limited to ${MAX_GROUP_PARTICIPANTS} participants`, errorCode: 'TOO_MANY_PARTICIPANTS' };
  }

  const newMember = await identityRepo.findByIdentityId(newMemberObjId);
  if (!newMember) {
    return { success: false, error: 'Identity not found', errorCode: 'IDENTITY_NOT_FOUND' };
  }

  const areFriends = await friendshipRepo.areFriends(requesterObjId, newMemberObjId);
  if (!areFriends) {
    return { success: false, error: 'You can only add friends', errorCode: 'NOT_FRIENDS' };
  }

  const isBlocked = await blockRepo.isBlockedByEither(requesterObjId, newMemberObjId);
  if (isBlocked) {
    return { success: false, error: 'Cannot add this identity', errorCode: 'BLOCKED' };
  }

  // Check if the new member requires approval
  if (newMember.requireGroupApproval) {
    const existingInvite = await groupInviteRepo.findPendingForConversation(convObjId, newMemberObjId);
    if (existingInvite) {
      return { success: false, error: 'Invite already pending', errorCode: 'INVITE_EXISTS' };
    }

    const invite = await groupInviteRepo.createInvite({
      conversationId: convObjId,
      invitedIdentityId: newMemberObjId,
      invitedByIdentityId: requesterObjId,
      hasGroupName: !!(conversation.encryptedName && conversation.nameNonce),
      memberCount: conversation.participants.length,
    });

    await publishConversationEvent(newMemberObjId.toHexString(), {
      type: 'group_invite_received',
      data: { invite: toPublicGroupInvite(invite) },
    });

    const requesterIdentity = await identityRepo.findByIdentityId(requesterObjId);
    await createNotification(newMemberObjId, 'group_invite_received', {
      inviteId: invite._id.toHexString(),
      conversationId: convObjId.toHexString(),
      invitedBy: requesterIdentity
        ? {
            id: requesterIdentity._id.toHexString(),
            username: requesterIdentity.username,
            displayName: requesterIdentity.displayName,
          }
        : undefined,
      memberCount: conversation.participants.length,
    });

    return { success: true, invite: toPublicGroupInvite(invite) };
  }

  // Direct add
  await conversationRepo.addParticipant(convObjId, newMemberObjId);

  const updated = await conversationRepo.findById(convObjId);
  const publicConv = updated ? toPublicConversation(updated) : undefined;

  const messageRepo = getMessageRepository();
  const newMemberPublic = toPublicIdentity(newMember);
  const requesterIdentity = await identityRepo.findByIdentityId(requesterObjId);
  const requesterPublic = requesterIdentity ? toPublicIdentity(requesterIdentity) : null;

  const systemMsg = await messageRepo.createMessage({
    conversationId: convObjId,
    fromIdentityId: requesterObjId,
    messageType: 'system',
    systemEvent: {
      type: 'member_invited',
      identityId: newMemberObjId.toHexString(),
      displayName: newMemberPublic.displayName,
      actorIdentityId: requesterObjId.toHexString(),
      actorDisplayName: requesterPublic?.displayName ?? requesterPublic?.username,
    },
    ciphertext: '',
    nonce: '',
    wrappedKeys: [],
    signature: '',
    cryptoProfile: 'default',
    clientMessageId: crypto.randomUUID(),
  });

  // Notify all existing members about the new member
  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_updated',
    data: {
      conversationId: convObjId.toHexString(),
      action: 'member_added',
      identityId: newMemberObjId.toHexString(),
    },
  });

  // Send system message event to all existing members
  for (const participantId of conversation.participants) {
    if (participantId.equals(newMemberObjId)) continue;
    await publishConversationEvent(participantId.toHexString(), {
      type: 'conversation_message',
      data: {
        conversationId: convObjId.toHexString(),
        messageId: systemMsg._id.toHexString(),
        fromIdentityId: newMemberObjId.toHexString(),
        createdAt: systemMsg.createdAt.toISOString(),
      },
    });
  }

  // Notify the new member
  if (publicConv) {
    await publishConversationEvent(newMemberObjId.toHexString(), {
      type: 'conversation_created',
      data: { conversation: publicConv },
    });
  }

  for (const participantId of conversation.participants) {
    if (participantId.equals(requesterObjId)) continue;
    await createNotification(participantId, 'group_member_added', {
      conversationId: convObjId.toHexString(),
      member: { id: newMemberPublic.id, username: newMemberPublic.username, displayName: newMemberPublic.displayName },
    });
  }

  return { success: true, conversation: publicConv };
}

/**
 * Remove a member from a group conversation (admin only).
 */
export async function removeGroupMember(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  targetIdentityId: string | ObjectId
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);
  const targetObjId =
    targetIdentityId instanceof ObjectId
      ? targetIdentityId
      : new ObjectId(targetIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation || conversation.type !== 'group') {
    return { success: false, error: 'Group conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can remove members', errorCode: 'NOT_ADMIN' };
  }

  if (requesterObjId.equals(targetObjId)) {
    return { success: false, error: 'Admins cannot remove themselves (use leave instead)', errorCode: 'INVALID_TYPE' };
  }

  if (isGroupAdmin(conversation, targetObjId)) {
    return { success: false, error: 'Cannot remove another admin', errorCode: 'TARGET_IS_ADMIN' };
  }

  const isParticipant = conversation.participants.some((p) => p.equals(targetObjId));
  if (!isParticipant) {
    return { success: false, error: 'Not a member', errorCode: 'NOT_PARTICIPANT' };
  }

  await conversationRepo.removeParticipant(convObjId, targetObjId);

  // Notify removed member
  await publishConversationEvent(targetObjId.toHexString(), {
    type: 'conversation_updated',
    data: {
      conversationId: convObjId.toHexString(),
      action: 'removed',
    },
  });

  // Create system message for the removal
  const identityRepo = getIdentityRepository();
  const messageRepo = getMessageRepository();
  const targetIdentity = await identityRepo.findByIdentityId(targetObjId);
  const targetPublic = targetIdentity ? toPublicIdentity(targetIdentity) : null;
  const requesterIdentity = await identityRepo.findByIdentityId(requesterObjId);
  const requesterPublic = requesterIdentity ? toPublicIdentity(requesterIdentity) : null;

  const systemMsg = await messageRepo.createMessage({
    conversationId: convObjId,
    fromIdentityId: requesterObjId,
    messageType: 'system',
    systemEvent: {
      type: 'member_removed',
      identityId: targetObjId.toHexString(),
      displayName: targetPublic?.displayName ?? targetPublic?.username,
      actorIdentityId: requesterObjId.toHexString(),
      actorDisplayName: requesterPublic?.displayName ?? requesterPublic?.username,
    },
    ciphertext: '',
    nonce: '',
    wrappedKeys: [],
    signature: '',
    cryptoProfile: 'default',
    clientMessageId: `sys-member-removed-${Date.now()}`,
  });

  await conversationRepo.updateLastMessage(convObjId, systemMsg._id, systemMsg.createdAt);

  // Notify remaining members
  const remaining = conversation.participants.filter(
    (p) => !p.equals(targetObjId) && !p.equals(requesterObjId)
  );
  for (const memberId of remaining) {
    await publishConversationEvent(memberId.toHexString(), {
      type: 'conversation_updated',
      data: {
        conversationId: convObjId.toHexString(),
        action: 'member_removed',
        identityId: targetObjId.toHexString(),
      },
    });

    await publishConversationEvent(memberId.toHexString(), {
      type: 'conversation_message',
      data: {
        conversationId: convObjId.toHexString(),
        messageId: systemMsg._id.toHexString(),
        fromIdentityId: requesterObjId.toHexString(),
        createdAt: systemMsg.createdAt.toISOString(),
      },
    });

    await createNotification(memberId, 'group_member_removed', {
      conversationId: convObjId.toHexString(),
      removedIdentityId: targetObjId.toHexString(),
    });
  }

  const updated = await conversationRepo.findById(convObjId);
  return { success: true, conversation: updated ? toPublicConversation(updated) : undefined };
}

/**
 * Leave a group conversation.
 * Handles admin transfer when the last admin departs and cleans up
 * the conversation (messages + invites) when the last member leaves.
 */
export async function leaveConversation(
  conversationId: string | ObjectId,
  identityId: string | ObjectId,
  options?: { transferAdminTo?: string; transferStrategy?: 'oldest' | 'most_active' }
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();
  const groupInviteRepo = getGroupInviteRepository();
  const identityRepo = getIdentityRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const identityObjId =
    identityId instanceof ObjectId ? identityId : new ObjectId(identityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation || conversation.type !== 'group') {
    return { success: false, error: 'Group conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  const isParticipant = conversation.participants.some((p) => p.equals(identityObjId));
  if (!isParticipant) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  const wasAdmin = isGroupAdmin(conversation, identityObjId);
  const remaining = conversation.participants.filter((p) => !p.equals(identityObjId));

  // Handle admin transfer if the departing member was an admin
  if (wasAdmin && remaining.length > 0) {
    await conversationRepo.removeAdmin(convObjId, identityObjId);

    const remainingAdmins = (conversation.admins ?? []).filter(
      (a) => !a.equals(identityObjId) && remaining.some((r) => r.equals(a))
    );

    if (remainingAdmins.length === 0) {
      const newAdminId = await resolveAdminTransfer(
        convObjId,
        remaining,
        options?.transferAdminTo,
        options?.transferStrategy
      );

      if (newAdminId) {
        await conversationRepo.addAdmin(convObjId, newAdminId);

        const newAdminIdentity = await identityRepo.findByIdentityId(newAdminId);
        const newAdminPublic = newAdminIdentity ? toPublicIdentity(newAdminIdentity) : null;

        const systemMsg = await messageRepo.createMessage({
          conversationId: convObjId,
          fromIdentityId: newAdminId,
          messageType: 'system',
          systemEvent: {
            type: 'admin_promoted',
            identityId: newAdminId.toHexString(),
            displayName: newAdminPublic?.displayName ?? newAdminPublic?.username,
          },
          ciphertext: '',
          nonce: '',
          wrappedKeys: [],
          signature: '',
          cryptoProfile: 'default',
          clientMessageId: `sys-admin-promoted-${Date.now()}`,
        });

        await conversationRepo.updateLastMessage(convObjId, systemMsg._id, systemMsg.createdAt);

        for (const memberId of remaining) {
          await publishConversationEvent(memberId.toHexString(), {
            type: 'conversation_updated',
            data: {
              conversationId: convObjId.toHexString(),
              action: 'admin_promoted',
              identityId: newAdminId.toHexString(),
            },
          });

          await publishConversationEvent(memberId.toHexString(), {
            type: 'conversation_message',
            data: {
              conversationId: convObjId.toHexString(),
              messageId: systemMsg._id.toHexString(),
              fromIdentityId: newAdminId.toHexString(),
              createdAt: systemMsg.createdAt.toISOString(),
            },
          });
        }
      }
    }
  }

  await conversationRepo.removeParticipant(convObjId, identityObjId);

  if (remaining.length > 0) {
    const leaverIdentity = await identityRepo.findByIdentityId(identityObjId);
    const leaverPublic = leaverIdentity ? toPublicIdentity(leaverIdentity) : null;

    const systemMsg = await messageRepo.createMessage({
      conversationId: convObjId,
      fromIdentityId: identityObjId,
      messageType: 'system',
      systemEvent: {
        type: 'member_left',
        identityId: identityObjId.toHexString(),
        displayName: leaverPublic?.displayName ?? leaverPublic?.username,
      },
      ciphertext: '',
      nonce: '',
      wrappedKeys: [],
      signature: '',
      cryptoProfile: 'default',
      clientMessageId: `sys-member-left-${Date.now()}`,
    });

    await conversationRepo.updateLastMessage(convObjId, systemMsg._id, systemMsg.createdAt);

    for (const memberId of remaining) {
      await publishConversationEvent(memberId.toHexString(), {
        type: 'conversation_updated',
        data: {
          conversationId: convObjId.toHexString(),
          action: 'member_left',
          identityId: identityObjId.toHexString(),
        },
      });

      await publishConversationEvent(memberId.toHexString(), {
        type: 'conversation_message',
        data: {
          conversationId: convObjId.toHexString(),
          messageId: systemMsg._id.toHexString(),
          fromIdentityId: identityObjId.toHexString(),
          createdAt: systemMsg.createdAt.toISOString(),
        },
      });

      await createNotification(memberId, 'group_member_left', {
        conversationId: convObjId.toHexString(),
        leftIdentityId: identityObjId.toHexString(),
      });
    }
  } else {
    const reactionRepo = getReactionRepository();
    await reactionRepo.deleteByConversation(convObjId);
    await messageRepo.deleteByConversation(convObjId);
    await groupInviteRepo.deleteByConversation(convObjId);
    await conversationRepo.deleteById(convObjId);
  }

  return { success: true };
}

/**
 * Update the encrypted group name (admin only).
 */
export async function updateGroupName(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  encryptedName: string,
  nameNonce: string
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation || conversation.type !== 'group') {
    return { success: false, error: 'Group conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can rename', errorCode: 'NOT_ADMIN' };
  }

  const updated = await conversationRepo.updateEncryptedName(convObjId, encryptedName, nameNonce);

  const identityRepo = getIdentityRepository();
  const requesterIdentity = await identityRepo.findByIdentityId(requesterObjId);
  const requesterPublic = requesterIdentity ? toPublicIdentity(requesterIdentity) : null;

  const messageRepo = getMessageRepository();
  const systemMsg = await messageRepo.createMessage({
    conversationId: convObjId,
    fromIdentityId: requesterObjId,
    messageType: 'system',
    systemEvent: {
      type: 'group_renamed',
      identityId: requesterObjId.toHexString(),
      displayName: requesterPublic?.displayName ?? requesterPublic?.username,
      actorIdentityId: requesterObjId.toHexString(),
      actorDisplayName: requesterPublic?.displayName ?? requesterPublic?.username,
    },
    ciphertext: '',
    nonce: '',
    wrappedKeys: [],
    signature: '',
    cryptoProfile: 'default',
    clientMessageId: `sys-group-renamed-${Date.now()}`,
  });

  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_updated',
    data: {
      conversationId: convObjId.toHexString(),
      action: 'renamed',
      identityId: requesterObjId.toHexString(),
    },
  });

  for (const participantId of conversation.participants) {
    if (participantId.equals(requesterObjId)) continue;
    await publishConversationEvent(participantId.toHexString(), {
      type: 'conversation_message',
      data: {
        conversationId: convObjId.toHexString(),
        messageId: systemMsg._id.toHexString(),
        fromIdentityId: requesterObjId.toHexString(),
        createdAt: systemMsg.createdAt.toISOString(),
      },
    });
    await createNotification(participantId, 'group_renamed', {
      conversationId: convObjId.toHexString(),
    });
  }

  return { success: true, conversation: updated ? toPublicConversation(updated) : undefined };
}

// ---------------------------------------------------------------------------
// Group invite operations
// ---------------------------------------------------------------------------

/**
 * Accept a group invite. Adds the identity to the conversation and
 * notifies all existing members.
 */
export async function acceptGroupInvite(
  inviteId: string | ObjectId,
  identityId: string | ObjectId
): Promise<GroupInviteResult> {
  const groupInviteRepo = getGroupInviteRepository();
  const conversationRepo = getConversationRepository();
  const identityRepo = getIdentityRepository();

  const inviteObjId =
    inviteId instanceof ObjectId ? inviteId : new ObjectId(inviteId as string);
  const identityObjId =
    identityId instanceof ObjectId ? identityId : new ObjectId(identityId as string);

  const invite = await groupInviteRepo.findById(inviteObjId);
  if (!invite || invite.status !== 'pending') {
    return { success: false, error: 'Invite not found', errorCode: 'INVITE_NOT_FOUND' };
  }

  if (!invite.invitedIdentityId.equals(identityObjId)) {
    return { success: false, error: 'Not authorized', errorCode: 'NOT_AUTHORIZED' };
  }

  // Update invite status
  await groupInviteRepo.updateStatus(inviteObjId, 'accepted');

  // Add to conversation
  await conversationRepo.addParticipant(invite.conversationId, identityObjId);

  const conversation = await conversationRepo.findById(invite.conversationId);
  if (conversation) {
    const publicConv = toPublicConversation(conversation);

    // Notify the new member with the full conversation
    await publishConversationEvent(identityObjId.toHexString(), {
      type: 'conversation_created',
      data: { conversation: publicConv },
    });

    // Notify existing members that someone joined
    const joiner = await identityRepo.findByIdentityId(identityObjId);
    const joinerPublic = joiner ? toPublicIdentity(joiner) : null;

    // Persist a system message marking where this member joined
    const messageRepo = getMessageRepository();
    const systemMsg = await messageRepo.createMessage({
      conversationId: invite.conversationId,
      fromIdentityId: identityObjId,
      messageType: 'system',
      systemEvent: {
        type: 'member_joined',
        identityId: identityObjId.toHexString(),
        displayName: joinerPublic?.displayName,
      },
      ciphertext: '',
      nonce: '',
      wrappedKeys: [],
      signature: '',
      cryptoProfile: 'default',
      clientMessageId: crypto.randomUUID(),
    });

    for (const participantId of conversation.participants) {
      if (participantId.equals(identityObjId)) continue;

      await publishConversationEvent(participantId.toHexString(), {
        type: 'group_invite_accepted',
        data: {
          conversationId: invite.conversationId.toHexString(),
          identityId: identityObjId.toHexString(),
          username: joinerPublic?.username,
          displayName: joinerPublic?.displayName,
        },
      });

      await publishConversationEvent(participantId.toHexString(), {
        type: 'conversation_message',
        data: {
          conversationId: invite.conversationId.toHexString(),
          messageId: systemMsg._id.toHexString(),
          fromIdentityId: identityObjId.toHexString(),
          createdAt: systemMsg.createdAt.toISOString(),
        },
      });

      await createNotification(participantId, 'group_invite_accepted', {
        conversationId: invite.conversationId.toHexString(),
        joinedIdentity: joinerPublic
          ? { id: joinerPublic.id, username: joinerPublic.username, displayName: joinerPublic.displayName }
          : undefined,
      });
    }
  }

  const updated = await groupInviteRepo.findById(inviteObjId);
  return { success: true, invite: updated ? toPublicGroupInvite(updated) : undefined };
}

/**
 * Decline a group invite.
 */
export async function declineGroupInvite(
  inviteId: string | ObjectId,
  identityId: string | ObjectId
): Promise<GroupInviteResult> {
  const groupInviteRepo = getGroupInviteRepository();

  const inviteObjId =
    inviteId instanceof ObjectId ? inviteId : new ObjectId(inviteId as string);
  const identityObjId =
    identityId instanceof ObjectId ? identityId : new ObjectId(identityId as string);

  const invite = await groupInviteRepo.findById(inviteObjId);
  if (!invite || invite.status !== 'pending') {
    return { success: false, error: 'Invite not found', errorCode: 'INVITE_NOT_FOUND' };
  }

  if (!invite.invitedIdentityId.equals(identityObjId)) {
    return { success: false, error: 'Not authorized', errorCode: 'NOT_AUTHORIZED' };
  }

  await groupInviteRepo.updateStatus(inviteObjId, 'declined');

  const updated = await groupInviteRepo.findById(inviteObjId);
  return { success: true, invite: updated ? toPublicGroupInvite(updated) : undefined };
}

/**
 * List pending group invites for an identity.
 */
export async function listGroupInvites(
  identityId: string | ObjectId,
  limit = 50,
  cursor?: string
): Promise<{ invites: PublicGroupInvite[]; cursor: string | null }> {
  const groupInviteRepo = getGroupInviteRepository();

  const identityObjId =
    identityId instanceof ObjectId ? identityId : new ObjectId(identityId as string);
  const cursorObjId = cursor ? new ObjectId(cursor) : undefined;

  const invites = await groupInviteRepo.findPendingForIdentity(
    identityObjId,
    limit + 1,
    cursorObjId
  );

  const hasMore = invites.length > limit;
  const result = hasMore ? invites.slice(0, limit) : invites;

  return {
    invites: result.map(toPublicGroupInvite),
    cursor:
      hasMore && result.length > 0
        ? result[result.length - 1]!._id.toHexString()
        : null,
  };
}

/**
 * Get a preview of the group for a pending invite.
 * Only the invited identity may access this while the invite is pending.
 * Returns member list with admin badges so the invitee can make an informed decision.
 */
export async function getGroupInvitePreview(
  inviteId: string | ObjectId,
  identityId: string | ObjectId
): Promise<GroupInvitePreviewResult> {
  const groupInviteRepo = getGroupInviteRepository();
  const conversationRepo = getConversationRepository();
  const identityRepo = getIdentityRepository();

  const inviteObjId =
    inviteId instanceof ObjectId ? inviteId : new ObjectId(inviteId as string);
  const identityObjId =
    identityId instanceof ObjectId ? identityId : new ObjectId(identityId as string);

  const invite = await groupInviteRepo.findById(inviteObjId);
  if (!invite || invite.status !== 'pending') {
    return { success: false, error: 'Invite not found', errorCode: 'INVITE_NOT_FOUND' };
  }

  if (!invite.invitedIdentityId.equals(identityObjId)) {
    return { success: false, error: 'Not authorized', errorCode: 'NOT_AUTHORIZED' };
  }

  const conversation = await conversationRepo.findById(invite.conversationId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  const memberDocs = await Promise.all(
    conversation.participants.map((pid) => identityRepo.findByIdentityId(pid))
  );

  const members: GroupInvitePreviewMember[] = [];
  for (let i = 0; i < conversation.participants.length; i++) {
    const pid = conversation.participants[i]!;
    const doc = memberDocs[i];
    if (!doc) continue;

    const pub = toPublicIdentity(doc);
    members.push({
      id: pub.id,
      username: pub.username,
      displayName: pub.displayName,
      avatarUrl: pub.avatarUrl,
      isAdmin: isGroupAdmin(conversation, pid),
    });
  }

  const inviterMember = members.find((m) => m.id === invite.invitedByIdentityId.toHexString());
  const invitedBy: GroupInvitePreviewMember = inviterMember ?? {
    id: invite.invitedByIdentityId.toHexString(),
    username: 'unknown',
    displayName: 'Unknown',
    isAdmin: false,
  };

  // Fetch other pending invites for this conversation (excluding the current user)
  const allPendingInvites = await groupInviteRepo.findAllPendingForConversation(invite.conversationId);
  const otherInvites = allPendingInvites.filter(
    (i) => !i.invitedIdentityId.equals(identityObjId)
  );
  const invitedDocs = await Promise.all(
    otherInvites.map((i) => identityRepo.findByIdentityId(i.invitedIdentityId))
  );
  const invitedMembers: GroupInvitePreviewMember[] = [];
  for (let i = 0; i < otherInvites.length; i++) {
    const doc = invitedDocs[i];
    if (!doc) continue;
    const pub = toPublicIdentity(doc);
    invitedMembers.push({
      id: pub.id,
      username: pub.username,
      displayName: pub.displayName,
      avatarUrl: pub.avatarUrl,
      isAdmin: false,
    });
  }

  const preview: GroupInvitePreview = {
    inviteId: inviteObjId.toHexString(),
    conversationId: invite.conversationId.toHexString(),
    groupName: invite.groupName,
    hasGroupName: invite.hasGroupName ?? !!(conversation.encryptedName && conversation.nameNonce),
    memberCount: conversation.participants.length,
    members,
    invitedMembers,
    invitedBy,
    createdAt: invite.createdAt.toISOString(),
  };

  return { success: true, preview };
}

// ---------------------------------------------------------------------------
// Admin management
// ---------------------------------------------------------------------------

/**
 * Promote a group member to admin.
 */
export async function promoteToAdmin(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  targetIdentityId: string | ObjectId
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();
  const identityRepo = getIdentityRepository();
  const messageRepo = getMessageRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);
  const targetObjId =
    targetIdentityId instanceof ObjectId
      ? targetIdentityId
      : new ObjectId(targetIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation || conversation.type !== 'group') {
    return { success: false, error: 'Group conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can promote members', errorCode: 'NOT_ADMIN' };
  }

  if (!conversation.participants.some((p) => p.equals(targetObjId))) {
    return { success: false, error: 'Not a group member', errorCode: 'NOT_PARTICIPANT' };
  }

  if (isGroupAdmin(conversation, targetObjId)) {
    return { success: false, error: 'Already an admin', errorCode: 'ALREADY_ADMIN' };
  }

  await conversationRepo.addAdmin(convObjId, targetObjId);

  const requesterIdentity = await identityRepo.findByIdentityId(requesterObjId);
  const requesterPublic = requesterIdentity ? toPublicIdentity(requesterIdentity) : null;
  const targetIdentity = await identityRepo.findByIdentityId(targetObjId);
  const targetPublic = targetIdentity ? toPublicIdentity(targetIdentity) : null;

  const systemMsg = await messageRepo.createMessage({
    conversationId: convObjId,
    fromIdentityId: requesterObjId,
    messageType: 'system',
    systemEvent: {
      type: 'admin_promoted',
      identityId: targetObjId.toHexString(),
      displayName: targetPublic?.displayName ?? targetPublic?.username,
      actorIdentityId: requesterObjId.toHexString(),
      actorDisplayName: requesterPublic?.displayName ?? requesterPublic?.username,
    },
    ciphertext: '',
    nonce: '',
    wrappedKeys: [],
    signature: '',
    cryptoProfile: 'default',
    clientMessageId: `sys-admin-promoted-${Date.now()}`,
  });

  await conversationRepo.updateLastMessage(convObjId, systemMsg._id, systemMsg.createdAt);

  for (const participantId of conversation.participants) {
    if (participantId.equals(requesterObjId)) continue;

    await publishConversationEvent(participantId.toHexString(), {
      type: 'conversation_updated',
      data: {
        conversationId: convObjId.toHexString(),
        action: 'admin_promoted',
        identityId: targetObjId.toHexString(),
      },
    });

    await publishConversationEvent(participantId.toHexString(), {
      type: 'conversation_message',
      data: {
        conversationId: convObjId.toHexString(),
        messageId: systemMsg._id.toHexString(),
        fromIdentityId: requesterObjId.toHexString(),
        createdAt: systemMsg.createdAt.toISOString(),
      },
    });

    await createNotification(participantId, 'group_admin_promoted', {
      conversationId: convObjId.toHexString(),
      promotedIdentityId: targetObjId.toHexString(),
    });
  }

  const updated = await conversationRepo.findById(convObjId);
  return { success: true, conversation: updated ? toPublicConversation(updated) : undefined };
}

/**
 * Terminate (delete) a group conversation. Admin only.
 * Notifies all members, then hard-deletes messages, invites, and the conversation.
 */
export async function terminateGroup(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId
): Promise<ConversationResult> {
  const conversationRepo = getConversationRepository();
  const messageRepo = getMessageRepository();
  const groupInviteRepo = getGroupInviteRepository();
  const identityRepo = getIdentityRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation || conversation.type !== 'group') {
    return { success: false, error: 'Group conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can delete the group', errorCode: 'NOT_ADMIN' };
  }

  const requesterIdentity = await identityRepo.findByIdentityId(requesterObjId);
  const requesterPublic = requesterIdentity ? toPublicIdentity(requesterIdentity) : null;

  for (const participantId of conversation.participants) {
    await publishConversationEvent(participantId.toHexString(), {
      type: 'group_terminated',
      data: {
        conversationId: convObjId.toHexString(),
        terminatedBy: {
          id: requesterObjId.toHexString(),
          username: requesterPublic?.username,
          displayName: requesterPublic?.displayName,
        },
        encryptedName: conversation.encryptedName,
        nameNonce: conversation.nameNonce,
      },
    });

    if (!participantId.equals(requesterObjId)) {
      await createNotification(participantId, 'group_terminated', {
        conversationId: convObjId.toHexString(),
        terminatedByIdentityId: requesterObjId.toHexString(),
      });
    }
  }

  const reactionRepo = getReactionRepository();
  await reactionRepo.deleteByConversation(convObjId);
  await messageRepo.deleteByConversation(convObjId);
  await groupInviteRepo.deleteByConversation(convObjId);
  await conversationRepo.deleteById(convObjId);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Admin transfer resolution
// ---------------------------------------------------------------------------

/**
 * Determine the new admin when the last admin leaves.
 * Supports explicit selection or automatic strategies.
 */
async function resolveAdminTransfer(
  conversationId: ObjectId,
  remainingParticipants: ObjectId[],
  transferTo?: string,
  strategy?: 'oldest' | 'most_active'
): Promise<ObjectId | null> {
  if (remainingParticipants.length === 0) return null;

  if (transferTo) {
    const targetObjId = new ObjectId(transferTo);
    if (remainingParticipants.some((p) => p.equals(targetObjId))) {
      return targetObjId;
    }
  }

  if (strategy === 'most_active') {
    const messageRepo = getMessageRepository();
    let highestCount = -1;
    let mostActive: ObjectId | null = null;

    for (const participantId of remainingParticipants) {
      const count = await messageRepo.countByParticipant(conversationId, participantId);
      if (count > highestCount) {
        highestCount = count;
        mostActive = participantId;
      }
    }

    return mostActive;
  }

  // Default: oldest member (first in participants array)
  return remainingParticipants[0] ?? null;
}

// ---------------------------------------------------------------------------
// Former members
// ---------------------------------------------------------------------------

export interface FormerMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

export interface FormerMembersResult {
  success: boolean;
  formerMembers?: FormerMember[];
  error?: string;
  errorCode?: 'CONVERSATION_NOT_FOUND' | 'NOT_AUTHORIZED' | 'NOT_GROUP';
}

/**
 * Get identities who previously accepted an invite to a group but are
 * no longer participants (i.e. they left or were removed).
 * Only group admins may call this.
 */
export async function getFormerMembers(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId
): Promise<FormerMembersResult> {
  const conversationRepo = getConversationRepository();
  const groupInviteRepo = getGroupInviteRepository();
  const identityRepo = getIdentityRepository();

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
  if (conversation.type !== 'group') {
    return { success: false, error: 'Not a group conversation', errorCode: 'NOT_GROUP' };
  }
  if (!isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Not authorized', errorCode: 'NOT_AUTHORIZED' };
  }

  const acceptedInvites = await groupInviteRepo.findAcceptedForConversation(convObjId);
  const currentParticipantSet = new Set(conversation.participants.map((p) => p.toHexString()));

  const formerIds = acceptedInvites
    .map((i) => i.invitedIdentityId)
    .filter((id) => !currentParticipantSet.has(id.toHexString()));

  const uniqueFormerIds = [...new Map(formerIds.map((id) => [id.toHexString(), id])).values()];

  const formerDocs = await Promise.all(
    uniqueFormerIds.map((id) => identityRepo.findByIdentityId(id))
  );

  const formerMembers: FormerMember[] = [];
  for (const doc of formerDocs) {
    if (!doc) continue;
    const pub = toPublicIdentity(doc);
    formerMembers.push({
      id: pub.id,
      username: pub.username,
      displayName: pub.displayName,
      avatarUrl: pub.avatarUrl,
    });
  }

  return { success: true, formerMembers };
}
