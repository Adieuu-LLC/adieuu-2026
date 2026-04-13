/**
 * Promote a group member to admin.
 *
 * @module services/conversation/group-promote
 */

import { ObjectId } from 'mongodb';
import { getConversationRepository } from '../../repositories/conversation.repository';
import { getMessageRepository } from '../../repositories/message.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { createNotification } from '../notification.service';
import { toPublicConversation } from '../../models/conversation';
import { toPublicIdentity } from '../../models/identity';
import type { ConversationResult } from './types';
import { publishConversationEvent } from './redis-events';
import { isGroupAdmin } from './group-permissions';

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
