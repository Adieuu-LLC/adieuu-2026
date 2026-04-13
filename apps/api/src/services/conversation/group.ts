/**
 * Group membership, settings, admin actions, and termination.
 *
 * @module services/conversation/group
 */

import { ObjectId } from 'mongodb';
import { getConversationRepository } from '../../repositories/conversation.repository';
import { getMessageRepository } from '../../repositories/message.repository';
import { getGroupInviteRepository } from '../../repositories/group-invite.repository';
import { getFriendshipRepository } from '../../repositories/friendship.repository';
import { getBlockRepository } from '../../repositories/block.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getReactionRepository } from '../../repositories/reaction.repository';
import { createNotification } from '../notification.service';
import { checkAndAward } from '../achievement.service';
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
 * Update the encrypted conversation topic or name (group: admin only; DM: any participant).
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
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (conversation.type === 'dm') {
    const isParticipant = conversation.participants.some((p) => p.equals(requesterObjId));
    if (!isParticipant) {
      return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
    }

    const updated = await conversationRepo.updateEncryptedName(convObjId, encryptedName, nameNonce);

    await publishToParticipants(conversation.participants, requesterObjId, {
      type: 'conversation_updated',
      data: {
        conversationId: convObjId.toHexString(),
        action: 'renamed',
        identityId: requesterObjId.toHexString(),
        conversationType: 'dm',
      },
    });

    return { success: true, conversation: updated ? toPublicConversation(updated) : undefined };
  }

  if (conversation.type !== 'group') {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
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
      conversationType: 'group',
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

/**
 * Update encrypted member settings (nicknames/colours).
 * DMs: any participant. Groups: admin only.
 */
export async function updateMemberSettings(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  encryptedMemberSettings: string,
  memberSettingsNonce: string
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

  if (!conversation.participants.some((p) => p.equals(requesterObjId))) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  if (conversation.type === 'group' && !isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can update member settings', errorCode: 'NOT_ADMIN' };
  }

  const updated = await conversationRepo.updateMemberSettings(
    convObjId,
    encryptedMemberSettings,
    memberSettingsNonce
  );

  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_updated',
    data: {
      conversationId: convObjId.toHexString(),
      action: 'member_settings_updated',
      identityId: requesterObjId.toHexString(),
    },
  });

  return { success: true, conversation: updated ? toPublicConversation(updated) : undefined };
}

// ---------------------------------------------------------------------------
// GIF settings
// ---------------------------------------------------------------------------

/**
 * Toggle whether GIFs are disabled for a conversation.
 * In groups only admins may call this; in DMs either participant may.
 */
export async function updateGifsDisabled(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId,
  gifsDisabled: boolean
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

  if (!conversation.participants.some((p) => p.equals(requesterObjId))) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  if (conversation.type === 'group' && !isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can toggle GIF settings', errorCode: 'NOT_ADMIN' };
  }

  const updated = await conversationRepo.updateGifsDisabled(convObjId, gifsDisabled);

  await publishToParticipants(conversation.participants, requesterObjId, {
    type: 'conversation_updated',
    data: {
      conversationId: convObjId.toHexString(),
      action: 'gifs_disabled_updated',
      identityId: requesterObjId.toHexString(),
      gifsDisabled,
    },
  });

  return { success: true, conversation: updated ? toPublicConversation(updated) : undefined };
}
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
 * Terminate (delete) a group conversation (admin only) or a **topical** DM
 * (both participants; requires encrypted conversation topic/name on the document).
 * Notifies all members/participants, then hard-deletes messages, invites (groups), and the conversation.
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
  if (!conversation) {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (conversation.type === 'group') {
    if (!isGroupAdmin(conversation, requesterObjId)) {
      return { success: false, error: 'Only group admins can delete the group', errorCode: 'NOT_ADMIN' };
    }
  } else if (conversation.type === 'dm') {
    const isParticipant = conversation.participants.some((p) => p.equals(requesterObjId));
    if (!isParticipant) {
      return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
    }
    const hasTopic = !!(conversation.encryptedName && conversation.nameNonce);
    if (!hasTopic) {
      return {
        success: false,
        error: 'Only direct conversations with a topic can be deleted for both participants',
        errorCode: 'INVALID_TYPE',
      };
    }
  } else {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
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
