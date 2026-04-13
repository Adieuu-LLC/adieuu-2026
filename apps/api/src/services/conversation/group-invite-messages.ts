/**
 * System messages for pending group invites (member_invited).
 *
 * @module services/conversation/group-invite-messages
 */

import { ObjectId } from 'mongodb';
import { getConversationRepository } from '../../repositories/conversation.repository';
import { getMessageRepository } from '../../repositories/message.repository';
import type { IdentityDocument } from '../../models/identity';
import { toPublicIdentity } from '../../models/identity';
import { publishConversationEvent } from './redis-events';

/**
 * Persist a member_invited system line and notify current participants (invitees are not members yet).
 */
export async function appendGroupInviteSystemMessageAndNotify(
  convObjId: ObjectId,
  invitedMember: IdentityDocument,
  inviter: IdentityDocument,
  participantIds: ObjectId[]
): Promise<void> {
  const messageRepo = getMessageRepository();
  const conversationRepo = getConversationRepository();
  const invitedPublic = toPublicIdentity(invitedMember);
  const inviterPublic = toPublicIdentity(inviter);

  const systemMsg = await messageRepo.createMessage({
    conversationId: convObjId,
    fromIdentityId: inviter._id,
    messageType: 'system',
    systemEvent: {
      type: 'member_invited',
      identityId: invitedPublic.id,
      displayName: invitedPublic.displayName,
      username: invitedPublic.username,
      actorIdentityId: inviterPublic.id,
      actorDisplayName: inviterPublic.displayName,
      actorUsername: inviterPublic.username,
    },
    ciphertext: '',
    nonce: '',
    wrappedKeys: [],
    signature: '',
    cryptoProfile: 'default',
    clientMessageId: crypto.randomUUID(),
  });

  await conversationRepo.updateLastMessage(convObjId, systemMsg._id, systemMsg.createdAt);

  for (const participantId of participantIds) {
    await publishConversationEvent(participantId.toHexString(), {
      type: 'conversation_message',
      data: {
        conversationId: convObjId.toHexString(),
        messageId: systemMsg._id.toHexString(),
        fromIdentityId: inviterPublic.id,
        createdAt: systemMsg.createdAt.toISOString(),
      },
    });
  }

  for (const participantId of participantIds) {
    await publishConversationEvent(participantId.toHexString(), {
      type: 'conversation_updated',
      data: {
        conversationId: convObjId.toHexString(),
        action: 'pending_invites_changed',
      },
    });
  }
}
