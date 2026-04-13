/**
 * Redis pub/sub helpers for conversation real-time events.
 *
 * @module services/conversation/redis-events
 */

import { ObjectId } from 'mongodb';
import { getRedis, isRedisConnected, RedisKeys } from '../../db';
import { config } from '../../config';
import elog from '../../utils/adieuuLogger';

export async function publishConversationEvent(
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
export async function publishToParticipants(
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

export async function publishPendingInvitesChanged(
  convObjId: ObjectId,
  participantIds: ObjectId[]
): Promise<void> {
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
