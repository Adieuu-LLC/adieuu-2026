/**
 * DM Events Service
 *
 * Handles real-time event publishing for direct messages.
 * Publishes events to Redis for delivery to connected WebSocket clients
 * via the chat service.
 *
 * @module services/dm-events
 */

import { getRedis, isRedisConnected, RedisKeys } from '../db/redis';
import type { PublicDmMessage } from '../models/dm-message';
import type { PublicDmReaction } from '../models/dm-reaction';
import elog from '../utils/adieuuLogger';
import { config } from '../config';

/**
 * DM event types for WebSocket communication
 */
export type DmEventType = 'dm:new' | 'dm:deleted' | 'dm:read' | 'dm:typing' | 'dm:reaction:new' | 'dm:reaction:removed';

/**
 * Base structure for DM events
 */
export interface DmEventBase {
  type: DmEventType;
}

/**
 * New DM message event
 */
export interface DmNewMessageEvent extends DmEventBase {
  type: 'dm:new';
  payload: {
    message: PublicDmMessage;
  };
}

/**
 * Read state update event
 */
export interface DmReadStateEvent extends DmEventBase {
  type: 'dm:read';
  payload: {
    conversationId: string;
    identityId: string;
    encryptedLastReadId: string;
  };
}

/**
 * Typing indicator event
 */
export interface DmTypingEvent extends DmEventBase {
  type: 'dm:typing';
  payload: {
    conversationId: string;
    identityId: string;
    isTyping: boolean;
  };
}

/**
 * Deletion reason for dm:deleted events
 */
export type DmDeletionReason = 'deleted_for_everyone' | 'deleted_for_self' | 'expired';

/**
 * Message deleted event
 */
export interface DmDeletedEvent extends DmEventBase {
  type: 'dm:deleted';
  payload: {
    messageId: string;
    conversationId: string;
    reason: DmDeletionReason;
  };
}

/**
 * Reaction added event
 */
export interface DmReactionAddedEvent extends DmEventBase {
  type: 'dm:reaction:new';
  payload: {
    reaction: PublicDmReaction;
  };
}

/**
 * Reaction removed event
 */
export interface DmReactionRemovedEvent extends DmEventBase {
  type: 'dm:reaction:removed';
  payload: {
    reactionId: string;
    messageId: string;
    conversationId: string;
  };
}

/**
 * Union of all DM event types
 */
export type DmEvent =
  | DmNewMessageEvent
  | DmDeletedEvent
  | DmReadStateEvent
  | DmTypingEvent
  | DmReactionAddedEvent
  | DmReactionRemovedEvent;

/**
 * Publishes a DM event to Redis for delivery to a specific identity.
 * The chat service subscribes to these channels and forwards to WebSocket clients.
 *
 * @param identityId - The recipient identity ID
 * @param event - The event to publish
 */
async function publishToIdentity(identityId: string, event: DmEvent): Promise<void> {
  if (!isRedisConnected()) {
    elog.warn('Cannot publish DM event - Redis not connected', {
      identityId: identityId.substring(0, 8) + '...',
      eventType: event.type,
    });
    return;
  }

  try {
    const redis = getRedis();
    // Pub/sub channels don't use ioredis keyPrefix, so we add it manually
    const channel = `${config.redis.keyPrefix}${RedisKeys.identityChannel(identityId)}`;
    const message = JSON.stringify(event);

    await redis.publish(channel, message);

    elog.debug('Published DM event', {
      identityId: identityId.substring(0, 8) + '...',
      eventType: event.type,
    });
  } catch (error) {
    elog.error('Failed to publish DM event', {
      error,
      identityId: identityId.substring(0, 8) + '...',
      eventType: event.type,
    });
  }
}

/**
 * Publishes a new message event to the recipient.
 *
 * @param recipientIdentityId - The message recipient's identity ID
 * @param message - The public message representation
 */
export async function publishNewMessage(
  recipientIdentityId: string,
  message: PublicDmMessage
): Promise<void> {
  const event: DmNewMessageEvent = {
    type: 'dm:new',
    payload: { message },
  };

  await publishToIdentity(recipientIdentityId, event);
}

/**
 * Publishes a read state update event to the other participant.
 * Used so they can update "read" indicators in real-time.
 *
 * @param otherParticipantId - The other participant's identity ID
 * @param conversationId - The conversation ID
 * @param readerIdentityId - The identity who read the messages
 * @param encryptedLastReadId - The encrypted last read message ID
 */
export async function publishReadStateUpdate(
  otherParticipantId: string,
  conversationId: string,
  readerIdentityId: string,
  encryptedLastReadId: string
): Promise<void> {
  const event: DmReadStateEvent = {
    type: 'dm:read',
    payload: {
      conversationId,
      identityId: readerIdentityId,
      encryptedLastReadId,
    },
  };

  await publishToIdentity(otherParticipantId, event);
}

/**
 * Publishes a typing indicator event to the other participant.
 *
 * @param otherParticipantId - The other participant's identity ID
 * @param conversationId - The conversation ID
 * @param typingIdentityId - The identity who is typing
 * @param isTyping - Whether they are currently typing
 */
export async function publishTypingIndicator(
  otherParticipantId: string,
  conversationId: string,
  typingIdentityId: string,
  isTyping: boolean
): Promise<void> {
  const event: DmTypingEvent = {
    type: 'dm:typing',
    payload: {
      conversationId,
      identityId: typingIdentityId,
      isTyping,
    },
  };

  await publishToIdentity(otherParticipantId, event);
}

/**
 * Publishes a message deleted event to the recipient.
 * Used for delete-for-everyone and TTL expiration events.
 *
 * @param recipientIdentityId - The identity to notify
 * @param messageId - The deleted message ID
 * @param conversationId - The conversation ID
 * @param reason - Why the message was deleted
 */
export async function publishMessageDeleted(
  recipientIdentityId: string,
  messageId: string,
  conversationId: string,
  reason: DmDeletionReason
): Promise<void> {
  const event: DmDeletedEvent = {
    type: 'dm:deleted',
    payload: {
      messageId,
      conversationId,
      reason,
    },
  };

  await publishToIdentity(recipientIdentityId, event);
}

/**
 * Publishes a reaction added event to the recipient.
 *
 * @param recipientIdentityId - The identity to notify
 * @param reaction - The public reaction representation
 */
export async function publishReactionAdded(
  recipientIdentityId: string,
  reaction: PublicDmReaction
): Promise<void> {
  const event: DmReactionAddedEvent = {
    type: 'dm:reaction:new',
    payload: { reaction },
  };

  await publishToIdentity(recipientIdentityId, event);
}

/**
 * Publishes a reaction removed event to the recipient.
 *
 * @param recipientIdentityId - The identity to notify
 * @param reactionId - The removed reaction ID
 * @param messageId - The message the reaction was on
 * @param conversationId - The conversation ID
 */
export async function publishReactionRemoved(
  recipientIdentityId: string,
  reactionId: string,
  messageId: string,
  conversationId: string
): Promise<void> {
  const event: DmReactionRemovedEvent = {
    type: 'dm:reaction:removed',
    payload: {
      reactionId,
      messageId,
      conversationId,
    },
  };

  await publishToIdentity(recipientIdentityId, event);
}
