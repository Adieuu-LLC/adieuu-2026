/**
 * Group invites, preview, and former-members listing.
 *
 * @module services/conversation/invites
 */

import { ObjectId } from 'mongodb';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getConversationRepository } from '../../repositories/conversation.repository';
import { getMessageRepository } from '../../repositories/message.repository';
import { getGroupInviteRepository } from '../../repositories/group-invite.repository';
import { createNotification } from '../notification.service';
import { toPublicConversation } from '../../models/conversation';
import { toPublicIdentity } from '../../models/identity';
import {
  toPublicGroupInvite,
  type PublicGroupInvite,
  type GroupInvitePreviewMember,
  type GroupInvitePreview,
} from '../../models/group-invite';
import type {
  GroupInviteResult,
  GroupInvitePreviewResult,
  FormerMembersResult,
  FormerMember,
} from './types';
import { publishConversationEvent, publishPendingInvitesChanged } from './redis-events';
import { isGroupAdmin } from './group-permissions';

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

  await identityRepo.incrementConversationsJoinedCounts([identityObjId]);

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

    await conversationRepo.incrementMessageCount(invite.conversationId);

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

    await publishPendingInvitesChanged(invite.conversationId, conversation.participants);
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

  const conversationRepo = getConversationRepository();
  const conversationAfterDecline = await conversationRepo.findById(invite.conversationId);
  if (conversationAfterDecline) {
    await publishPendingInvitesChanged(invite.conversationId, conversationAfterDecline.participants);
  }

  const updated = await groupInviteRepo.findById(inviteObjId);
  return { success: true, invite: updated ? toPublicGroupInvite(updated) : undefined };
}

/**
 * List pending group invites for a conversation (any current member may view).
 */
export async function listPendingInvitesForConversation(
  conversationId: string | ObjectId,
  requesterIdentityId: string | ObjectId
): Promise<{
  success: boolean;
  invites?: PublicGroupInvite[];
  error?: string;
  errorCode?: 'CONVERSATION_NOT_FOUND' | 'NOT_PARTICIPANT';
}> {
  const conversationRepo = getConversationRepository();
  const groupInviteRepo = getGroupInviteRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation || conversation.type !== 'group') {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!conversation.participants.some((p) => p.equals(requesterObjId))) {
    return { success: false, error: 'Not a participant', errorCode: 'NOT_PARTICIPANT' };
  }

  const pending = await groupInviteRepo.findAllPendingForConversation(convObjId);
  return { success: true, invites: pending.map(toPublicGroupInvite) };
}

/**
 * Revoke a pending group invite (group admins only).
 */
export async function revokeGroupInvite(
  conversationId: string | ObjectId,
  inviteId: string | ObjectId,
  requesterIdentityId: string | ObjectId
): Promise<GroupInviteResult> {
  const conversationRepo = getConversationRepository();
  const groupInviteRepo = getGroupInviteRepository();

  const convObjId =
    conversationId instanceof ObjectId ? conversationId : new ObjectId(conversationId as string);
  const inviteObjId =
    inviteId instanceof ObjectId ? inviteId : new ObjectId(inviteId as string);
  const requesterObjId =
    requesterIdentityId instanceof ObjectId
      ? requesterIdentityId
      : new ObjectId(requesterIdentityId as string);

  const conversation = await conversationRepo.findById(convObjId);
  if (!conversation || conversation.type !== 'group') {
    return { success: false, error: 'Conversation not found', errorCode: 'CONVERSATION_NOT_FOUND' };
  }

  if (!isGroupAdmin(conversation, requesterObjId)) {
    return { success: false, error: 'Only group admins can revoke invites', errorCode: 'NOT_ADMIN' };
  }

  const invite = await groupInviteRepo.findById(inviteObjId);
  if (!invite || !invite.conversationId.equals(convObjId)) {
    return { success: false, error: 'Invite not found', errorCode: 'INVITE_NOT_FOUND' };
  }

  if (invite.status !== 'pending') {
    return { success: false, error: 'Invite is not pending', errorCode: 'INVITE_NOT_PENDING' };
  }

  await groupInviteRepo.updateStatus(inviteObjId, 'revoked');

  for (const pid of conversation.participants) {
    await publishConversationEvent(pid.toHexString(), {
      type: 'conversation_updated',
      data: {
        conversationId: convObjId.toHexString(),
        action: 'pending_invites_changed',
      },
    });
  }

  await publishConversationEvent(invite.invitedIdentityId.toHexString(), {
    type: 'group_invite_revoked',
    data: {
      inviteId: inviteObjId.toHexString(),
      conversationId: convObjId.toHexString(),
    },
  });

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
