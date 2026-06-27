/**
 * Terminate (delete) a group or topical DM conversation.
 *
 * @module services/conversation/group-terminate
 */

import { ObjectId } from 'mongodb';
import { getConversationRepository } from '../../repositories/conversation.repository';
import { getMessageRepository } from '../../repositories/message.repository';
import { getGroupInviteRepository } from '../../repositories/group-invite.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getReactionRepository } from '../../repositories/reaction.repository';
import { createNotification } from '../notification.service';
import { toPublicIdentity } from '../../models/identity';
import type { ConversationResult } from './types';
import { publishConversationEvent } from './redis-events';
import { isGroupAdmin } from './group-permissions';

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
