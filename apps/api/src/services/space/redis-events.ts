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
import { hashIdentifier } from '../../utils/crypto';
import elog from '../../utils/adieuuLogger';

/**
 * Channel key with any embedded ObjectId replaced by a short keyed hash.
 * Identity channels carry the member's identity id, which must not appear in
 * logs (alias privacy); hashing keeps log lines correlatable without it.
 */
function logSafeChannel(channelKey: string): string {
  return channelKey.replace(/[0-9a-f]{24}/gi, (id) => hashIdentifier(id).slice(0, 12));
}

async function publish(channelKey: string, event: Record<string, unknown>): Promise<void> {
  if (!isRedisConnected()) {
    elog.warn('Skipping Space event publish: Redis not connected', {
      channel: logSafeChannel(channelKey),
      eventType: event.type,
    });
    return;
  }

  try {
    const redis = getRedis();
    const channel = `${config.redis.keyPrefix}${channelKey}`;
    const receivers = await redis.publish(channel, JSON.stringify(event));
    elog.info('Published Space event to Redis', {
      channel: logSafeChannel(channelKey),
      eventType: event.type,
      receivers,
    });
  } catch (error) {
    elog.warn('Failed to publish Space event via Redis', {
      error,
      channel: logSafeChannel(channelKey),
    });
  }
}

/** Options controlling Space broadcast delivery. */
export interface PublishSpaceEventOptions {
  /**
   * When provided (an array), the chat service delivers the event only to
   * sockets whose identity is in this list — used to scope restricted-channel
   * events to members who may view the channel. When `null`/omitted, the event
   * is broadcast to every active member (open channels / space-wide events).
   */
  audienceIdentityIds?: readonly string[] | null;
  /**
   * Identities that must NOT receive this broadcast. Used when a filtered
   * variant of the same event is delivered to them separately (e.g. layout
   * updates where privileged members get a fuller channel list).
   */
  excludeIdentityIds?: readonly string[] | null;
}

/**
 * Broadcast an event to active members via the `space:{spaceId}` channel.
 *
 * When `options.audienceIdentityIds` is a non-null array, the recipient set is
 * carried in the envelope so the chat fan-out delivers only to those members
 * (restricted-channel scoping). Otherwise the event reaches all members.
 */
export async function publishSpaceEvent(
  spaceId: string,
  event: Record<string, unknown>,
  options?: PublishSpaceEventOptions,
): Promise<void> {
  const audience = options?.audienceIdentityIds;
  const exclude = options?.excludeIdentityIds;
  const payload = {
    ...event,
    ...(audience == null ? {} : { audienceIdentityIds: [...audience] }),
    ...(exclude == null || exclude.length === 0
      ? {}
      : { excludeIdentityIds: [...exclude] }),
  };
  await publish(RedisKeys.spaceChannel(spaceId), payload);
}

/** Deliver an event to a single identity's `identity:{id}` channel. */
export async function publishSpaceEventToIdentity(
  identityId: string,
  event: Record<string, unknown>,
): Promise<void> {
  await publish(RedisKeys.identityChannel(identityId), event);
}
