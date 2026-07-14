/**
 * Redis pub/sub helpers for Space real-time events.
 *
 * Two delivery targets:
 * - {@link publishSpaceEvent} broadcasts on the `space:{spaceId}` channel. The
 *   chat service subscribes each connected member to this channel (resolved at
 *   WS upgrade), so this fans out to every active member in O(1) publishes.
 * - {@link publishSpaceEventToIdentity} targets a single member's
 *   `identity:{id}` channel (used for invites, which must reach a specific
 *   identity that may not be a Space member yet).
 *
 * Publishing is best-effort: a disconnected Redis logs a warning and no-ops so
 * that the originating request still succeeds.
 *
 * @module services/space/redis-events
 */

import { getRedis, isRedisConnected, RedisKeys } from '../../db';
import { config } from '../../config';
import elog from '../../utils/adieuuLogger';

async function publish(channelKey: string, event: Record<string, unknown>): Promise<void> {
  if (!isRedisConnected()) {
    elog.warn('Skipping Space event publish: Redis not connected', {
      channelKey,
      eventType: event.type,
    });
    return;
  }

  try {
    const redis = getRedis();
    const channel = `${config.redis.keyPrefix}${channelKey}`;
    const receivers = await redis.publish(channel, JSON.stringify(event));
    elog.info('Published Space event to Redis', {
      channel,
      eventType: event.type,
      receivers,
    });
  } catch (error) {
    elog.warn('Failed to publish Space event via Redis', { error, channelKey });
  }
}

/** Broadcast an event to all active members via the `space:{spaceId}` channel. */
export async function publishSpaceEvent(
  spaceId: string,
  event: Record<string, unknown>,
): Promise<void> {
  await publish(RedisKeys.spaceChannel(spaceId), event);
}

/** Deliver an event to a single identity's `identity:{id}` channel. */
export async function publishSpaceEventToIdentity(
  identityId: string,
  event: Record<string, unknown>,
): Promise<void> {
  await publish(RedisKeys.identityChannel(identityId), event);
}
