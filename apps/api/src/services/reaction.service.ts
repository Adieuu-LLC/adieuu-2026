/**
 * @fileoverview Reaction Service
 *
 * Provides reaction management for conversations.
 * Handles adding, removing, and fetching reactions with limit enforcement
 * and real-time event publishing.
 *
 * PRIVACY NOTES:
 * - Reaction content is E2E encrypted; server handles only ciphertext
 * - Server sees fromIdentityId and messageId (needed for limit enforcement)
 * - Notifications created only for message author, not all participants
 *
 * @module services/reaction
 */

import { ObjectId } from 'mongodb';
import { getReactionRepository } from '../repositories/reaction.repository';
import { getConversationRepository } from '../repositories/conversation.repository';
import { getMessageRepository } from '../repositories/message.repository';
import { createNotification } from './notification.service';
import { checkAndAward } from './achievement.service';
import {
  toPublicReaction,
  type PublicReaction,
  type CreateReactionInput,
  MAX_REACTIONS_PER_USER_PER_MESSAGE,
  MAX_REACTIONS_PER_MESSAGE,
} from '../models/reaction';
import { getRedis, isRedisConnected, RedisKeys } from '../db';
import { config } from '../config';
import elog from '../utils/adieuuLogger';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ReactionResult {
  success: boolean;
  error?: string;
  reaction?: PublicReaction;
}

export interface ReactionsListResult {
  success: boolean;
  error?: string;
  reactions?: PublicReaction[];
}

// ---------------------------------------------------------------------------
// Redis event publishing
// ---------------------------------------------------------------------------

async function publishReactionEvent(
  recipientIdentityId: string,
  event: Record<string, unknown>
): Promise<void> {
  if (!isRedisConnected()) {
    elog.warn('Skipping reaction event publish: Redis not connected', {
      recipientIdentityId,
      eventType: event.type,
    });
    return;
  }

  try {
    const redis = getRedis();
    const channel = `${config.redis.keyPrefix}${RedisKeys.identityChannel(recipientIdentityId)}`;
    await redis.publish(channel, JSON.stringify(event));
  } catch (error) {
    elog.warn('Failed to publish reaction event via Redis', {
      error,
      recipientIdentityId,
    });
  }
}

async function publishToParticipants(
  participantIds: ObjectId[],
  excludeIdentityId: ObjectId,
  event: Record<string, unknown>
): Promise<void> {
  const excludeHex = excludeIdentityId.toHexString();
  await Promise.all(
    participantIds
      .filter((id) => id.toHexString() !== excludeHex)
      .map((id) => publishReactionEvent(id.toHexString(), event))
  );
}

// ---------------------------------------------------------------------------
// Add reaction
// ---------------------------------------------------------------------------

export async function addReaction(
  identityId: string,
  conversationId: string,
  messageId: string,
  reactionData: {
    ciphertext: string;
    nonce: string;
    wrappedKeys: CreateReactionInput['wrappedKeys'];
    signature: string;
    cryptoProfile: CreateReactionInput['cryptoProfile'];
    clientReactionId: string;
  }
): Promise<ReactionResult> {
  const identityObjId = new ObjectId(identityId);
  const convObjId = new ObjectId(conversationId);
  const msgObjId = new ObjectId(messageId);

  const convRepo = getConversationRepository();
  const conversation = await convRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found.' };
  }

  const isParticipant = conversation.participants.some((p) =>
    p.equals(identityObjId)
  );
  if (!isParticipant) {
    return { success: false, error: 'Not a participant in this conversation.' };
  }

  const msgRepo = getMessageRepository();
  const message = await msgRepo.findById(msgObjId);
  if (!message || !message.conversationId.equals(convObjId)) {
    return { success: false, error: 'Message not found in this conversation.' };
  }

  const reactionRepo = getReactionRepository();

  const [userCount, totalCount] = await Promise.all([
    reactionRepo.countByIdentityAndMessage(identityObjId, msgObjId),
    reactionRepo.countByMessage(msgObjId),
  ]);

  if (userCount >= MAX_REACTIONS_PER_USER_PER_MESSAGE) {
    return {
      success: false,
      error: `Maximum of ${MAX_REACTIONS_PER_USER_PER_MESSAGE} reactions per message reached.`,
    };
  }

  if (totalCount >= MAX_REACTIONS_PER_MESSAGE) {
    return {
      success: false,
      error: `Maximum of ${MAX_REACTIONS_PER_MESSAGE} total reactions on this message reached.`,
    };
  }

  const input: CreateReactionInput = {
    messageId: msgObjId,
    conversationId: convObjId,
    fromIdentityId: identityObjId,
    ciphertext: reactionData.ciphertext,
    nonce: reactionData.nonce,
    wrappedKeys: reactionData.wrappedKeys,
    signature: reactionData.signature,
    cryptoProfile: reactionData.cryptoProfile,
    clientReactionId: reactionData.clientReactionId,
    ...(message.expiresAt ? { expiresAt: message.expiresAt } : {}),
  };

  const reaction = await reactionRepo.createReaction(input);
  const publicReaction = toPublicReaction(reaction);

  await publishToParticipants(conversation.participants, identityObjId, {
    type: 'reaction_added',
    data: {
      reaction: publicReaction,
      /** Lets clients notify the message author without local message cache (pagination / other tab). */
      messageAuthorId: message.fromIdentityId.toHexString(),
    },
  });

  if (!message.fromIdentityId.equals(identityObjId)) {
    try {
      await createNotification(message.fromIdentityId, 'message_reaction', {
        conversationId: convObjId.toHexString(),
        messageId: msgObjId.toHexString(),
        reactionId: reaction._id.toHexString(),
        fromIdentityId: identityId,
      });
    } catch (error) {
      elog.error('Failed to create reaction notification', {
        error,
        conversationId: convObjId.toHexString(),
        messageId: msgObjId.toHexString(),
        reactionId: reaction._id.toHexString(),
        fromIdentityId: identityId,
        recipientIdentityId: message.fromIdentityId.toHexString(),
      });
    }
  }

  checkAndAward(identityObjId, 'reaction_added').catch(() => {});

  return { success: true, reaction: publicReaction };
}

// ---------------------------------------------------------------------------
// Remove reaction
// ---------------------------------------------------------------------------

export async function removeReaction(
  identityId: string,
  conversationId: string,
  reactionId: string
): Promise<ReactionResult> {
  const identityObjId = new ObjectId(identityId);
  const convObjId = new ObjectId(conversationId);

  const reactionRepo = getReactionRepository();
  const reaction = await reactionRepo.findById(reactionId);

  if (!reaction || !reaction.conversationId.equals(convObjId)) {
    return { success: false, error: 'Reaction not found.' };
  }

  if (!reaction.fromIdentityId.equals(identityObjId)) {
    return { success: false, error: 'You can only remove your own reactions.' };
  }

  const deleted = await reactionRepo.deleteById(reactionId);
  if (!deleted) {
    return { success: false, error: 'Failed to remove reaction.' };
  }

  const convRepo = getConversationRepository();
  const conversation = await convRepo.findById(convObjId);
  if (conversation) {
    await publishToParticipants(conversation.participants, identityObjId, {
      type: 'reaction_removed',
      data: {
        reactionId: reaction._id.toHexString(),
        messageId: reaction.messageId.toHexString(),
        conversationId: convObjId.toHexString(),
      },
    });
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Fetch reactions
// ---------------------------------------------------------------------------

export async function getReactionsForMessages(
  identityId: string,
  conversationId: string,
  messageIds: string[]
): Promise<ReactionsListResult> {
  const identityObjId = new ObjectId(identityId);
  const convObjId = new ObjectId(conversationId);

  const convRepo = getConversationRepository();
  const conversation = await convRepo.findById(convObjId);
  if (!conversation) {
    return { success: false, error: 'Conversation not found.' };
  }

  const isParticipant = conversation.participants.some((p) =>
    p.equals(identityObjId)
  );
  if (!isParticipant) {
    return { success: false, error: 'Not a participant in this conversation.' };
  }

  const reactionRepo = getReactionRepository();
  const msgObjIds = messageIds.map((id) => new ObjectId(id));
  const reactions = await reactionRepo.findByMessageIds(convObjId, msgObjIds);

  return {
    success: true,
    reactions: reactions.map(toPublicReaction),
  };
}
