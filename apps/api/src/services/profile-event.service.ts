/**
 * Profile Event Service
 *
 * Publishes real-time profile-update events to all conversation partners
 * of a given identity via Redis, so that connected clients can invalidate
 * cached profile data and re-fetch through the privacy filter.
 *
 * @module services/profile-event
 */

import { ObjectId } from 'mongodb';
import { getConversationRepository } from '../repositories/conversation.repository';
import { getRedis, isRedisConnected, RedisKeys } from '../db';
import { config } from '../config';
import elog from '../utils/adieuuLogger';

/**
 * Notify all conversation partners that this identity's profile has changed.
 *
 * Collects every unique participant across all conversations the identity
 * belongs to, then publishes a lightweight `identity_profile_updated` event
 * to each (excluding the identity itself). The event carries only the
 * identity ID — clients re-fetch the profile through the server's privacy
 * filter so no private data is sent over the wire.
 */
export async function publishProfileUpdated(identityId: string): Promise<void> {
  if (!isRedisConnected()) {
    elog.warn('Skipping profile update broadcast: Redis not connected', { identityId });
    return;
  }

  const conversationRepo = getConversationRepository();
  const identityObjId = new ObjectId(identityId);

  const conversations = await conversationRepo.findForIdentity(identityObjId, 10_000);

  const recipientIds = new Set<string>();
  for (const conv of conversations) {
    for (const pid of conv.participants) {
      const hex = pid.toHexString();
      if (hex !== identityId) {
        recipientIds.add(hex);
      }
    }
  }

  if (recipientIds.size === 0) return;

  const event = JSON.stringify({
    type: 'identity_profile_updated',
    data: { identityId },
  });

  const redis = getRedis();
  const prefix = config.redis.keyPrefix;

  await Promise.all(
    [...recipientIds].map(async (recipientId) => {
      try {
        const channel = `${prefix}${RedisKeys.identityChannel(recipientId)}`;
        await redis.publish(channel, event);
      } catch (error) {
        elog.warn('Failed to publish profile update event', {
          error,
          identityId,
          recipientId,
        });
      }
    })
  );

  elog.info('Published profile update to conversation partners', {
    identityId,
    recipientCount: recipientIds.size,
  });
}
