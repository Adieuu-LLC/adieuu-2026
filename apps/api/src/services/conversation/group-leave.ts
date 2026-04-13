/**
 * Leave group, optional admin transfer, and last-admin resolution helper.
 *
 * @module services/conversation/group-leave
 */

import { ObjectId } from 'mongodb';
import { getConversationRepository } from '../../repositories/conversation.repository';
import { getMessageRepository } from '../../repositories/message.repository';
import { getGroupInviteRepository } from '../../repositories/group-invite.repository';
import { getReactionRepository } from '../../repositories/reaction.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { createNotification } from '../notification.service';
import { toPublicIdentity } from '../../models/identity';
import type { ConversationResult } from './types';
import { publishConversationEvent } from './redis-events';
import { isGroupAdmin } from './group-permissions';

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
