/**
 * Add and remove group members.
 *
 * @module services/conversation/group-members
 */

import { ObjectId } from 'mongodb';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getConversationRepository } from '../../repositories/conversation.repository';
import { getMessageRepository } from '../../repositories/message.repository';
import { getGroupInviteRepository } from '../../repositories/group-invite.repository';
import { getFriendshipRepository } from '../../repositories/friendship.repository';
import { getBlockRepository } from '../../repositories/block.repository';
import { getCallRepository } from '../../repositories/call.repository';
import { createNotification } from '../notification.service';
import { removeParticipant as livekitRemoveParticipant } from '../livekit-room.service';
import { toPublicConversation, MAX_GROUP_PARTICIPANTS } from '../../models/conversation';
import { toPublicIdentity } from '../../models/identity';
import { toPublicGroupInvite } from '../../models/group-invite';
import type { ConversationResult, GroupInviteResult } from './types';
import { publishConversationEvent, publishToParticipants } from './redis-events';
import { appendGroupInviteSystemMessageAndNotify } from './group-invite-messages';
import { isGroupAdmin } from './group-permissions';

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

    const inviterForMsg = requesterIdentity ?? (await identityRepo.findByIdentityId(requesterObjId));
    if (inviterForMsg) {
      await appendGroupInviteSystemMessageAndNotify(
        convObjId,
        newMember,
        inviterForMsg,
        conversation.participants
      );
    }

    return { success: true, invite: toPublicGroupInvite(invite) };
  }

  // Direct add
  await conversationRepo.addParticipant(convObjId, newMemberObjId);

  await identityRepo.incrementConversationsJoinedCounts([newMemberObjId]);

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
      username: newMemberPublic.username,
      actorIdentityId: requesterObjId.toHexString(),
      actorDisplayName: requesterPublic?.displayName ?? requesterPublic?.username,
      actorUsername: requesterPublic?.username,
    },
    ciphertext: '',
    nonce: '',
    wrappedKeys: [],
    signature: '',
    cryptoProfile: 'default',
    clientMessageId: crypto.randomUUID(),
  });

  await conversationRepo.updateLastMessage(convObjId, systemMsg._id, systemMsg.createdAt);
  await conversationRepo.incrementMessageCount(convObjId);

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

  // If the removed member is in an active call, force-disconnect them from LiveKit
  const callRepo = getCallRepository();
  const activeCall = await callRepo.findActiveForConversation(convObjId);
  if (activeCall) {
    const inCall = activeCall.participants.some(
      (p) => p.identityId.equals(targetObjId) && !p.leftAt
    );
    if (inCall) {
      await callRepo.updateParticipantLeft(activeCall._id, targetObjId);
      void livekitRemoveParticipant(activeCall.roomName, targetObjId.toHexString());
    }
  }

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
  await conversationRepo.incrementMessageCount(convObjId);

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
