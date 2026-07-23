/**
 * WebSocket Connection Management
 *
 * Manages active WebSocket connections and Redis pub/sub subscriptions
 * for message routing across chat server instances.
 */

import { getPublisher, getSubscriber, isRedisConnected } from './db/redis';
import { config } from './config';
import logger from './utils/logger';
import { ChatRedisKeys, RedisChannels, type TypedWebSocket } from './types';

/**
 * Map of identity ID -> set of active WebSocket connections.
 * Multiple devices / tabs for the same identity each get their own
 * socket, and Redis messages are fanned out to every one of them.
 */
const connections = new Map<string, Set<TypedWebSocket>>();

/**
 * Map of space ID -> set of active WebSocket connections whose identity is an
 * active member of that Space. Space broadcast events (`space:{spaceId}`) are
 * fanned out to every socket in the matching set.
 */
const spaceConnections = new Map<string, Set<TypedWebSocket>>();

/**
 * Set of subscribed Redis channels (without prefix, for re-subscription tracking)
 */
const subscriptions = new Set<string>();

/**
 * Message handler for Redis pub/sub
 */
let messageHandler: ((channel: string, message: string) => void) | null = null;

/**
 * Flag to track if we've set up the reconnection handler
 */
let reconnectionHandlerInitialized = false;

/**
 * Re-subscribes to all tracked channels after Redis reconnection
 */
async function resubscribeAllChannels(): Promise<void> {
  if (subscriptions.size === 0) {
    return;
  }

  logger.info('Re-subscribing to channels after Redis reconnection', {
    channelCount: subscriptions.size,
  });

  const subscriber = getSubscriber();
  const channels = Array.from(subscriptions).map(
    (channel) => `${config.redis.keyPrefix}${channel}`
  );

  try {
    await subscriber.subscribe(...channels);
    logger.info('Re-subscribed to all channels', { channelCount: channels.length, channels });
  } catch (error) {
    logger.error('Failed to re-subscribe to channels', { error });
  }
}

/**
 * Initializes the Redis message handler
 */
/**
 * Fans a raw Redis message out to a set of local sockets.
 */
function deliverToSockets(
  sockets: Set<TypedWebSocket> | undefined,
  message: string,
  meta: { channel: string; scope: string; key: string; eventType?: string },
  audienceIdentityIds?: readonly string[] | null,
  excludeIdentityIds?: readonly string[] | null,
): void {
  if (!sockets || sockets.size === 0) {
    logger.info('Redis message received but no local connection', {
      scope: meta.scope,
      key: meta.key.substring(0, 8) + '...',
      eventType: meta.eventType,
      channel: meta.channel,
    });
    return;
  }

  // Restricted-channel events carry an explicit recipient allow-list; sockets
  // whose identity is not in it must never receive the event. An exclusion
  // list is used when those identities get a separate filtered variant.
  const audience = audienceIdentityIds ? new Set(audienceIdentityIds) : null;
  const excluded =
    excludeIdentityIds && excludeIdentityIds.length > 0
      ? new Set(excludeIdentityIds)
      : null;

  for (const ws of sockets) {
    if (audience || excluded) {
      let identityId: string | undefined;
      try {
        identityId = ws.getUserData().identityId;
      } catch {
        identityId = undefined;
      }
      if (audience && (!identityId || !audience.has(identityId))) continue;
      if (excluded && identityId && excluded.has(identityId)) continue;
    }
    try {
      const sendResult = ws.send(message);
      if (sendResult === 1) {
        logger.info('Message delivered to WebSocket', {
          scope: meta.scope,
          key: meta.key.substring(0, 8) + '...',
          eventType: meta.eventType,
          byteLength: message.length,
          socketCount: sockets.size,
        });
      } else {
        logger.warn('Message dropped by uWS', {
          scope: meta.scope,
          key: meta.key.substring(0, 8) + '...',
          eventType: meta.eventType,
          sendResult,
          byteLength: message.length,
        });
      }
    } catch (error) {
      logger.error('Failed to send message to WebSocket', {
        error,
        scope: meta.scope,
        key: meta.key.substring(0, 8) + '...',
        eventType: meta.eventType,
      });
    }
  }
}

export function initializeMessageHandler(): void {
  if (messageHandler) return;

  messageHandler = (channel: string, message: string) => {
    const unprefixed = channel.startsWith(config.redis.keyPrefix)
      ? channel.slice(config.redis.keyPrefix.length)
      : channel;

    let eventType: string | undefined;
    let memberIdentityId: string | undefined;
    let audienceIdentityIds: string[] | undefined;
    let excludeIdentityIds: string[] | undefined;
    try {
      const parsed = JSON.parse(message) as {
        type?: string;
        audienceIdentityIds?: string[];
        excludeIdentityIds?: string[];
        data?: { identityId?: string; member?: { identityId?: string } };
      };
      eventType = parsed?.type;
      memberIdentityId = parsed?.data?.member?.identityId ?? parsed?.data?.identityId;
      if (Array.isArray(parsed?.audienceIdentityIds)) {
        audienceIdentityIds = parsed.audienceIdentityIds;
      }
      if (Array.isArray(parsed?.excludeIdentityIds)) {
        excludeIdentityIds = parsed.excludeIdentityIds;
      }
    } catch {
      // Best-effort parse for logging; forward the raw message regardless
    }

    // Space broadcast channel: fan out to member sockets for the space. When the
    // event carries an audience allow-list (restricted channels), only those
    // members receive it.
    if (unprefixed.startsWith('space:')) {
      const spaceId = unprefixed.slice('space:'.length);
      // Grant joining members before fan-out so already-connected sockets receive this
      // and subsequent space: deliveries.
      if (eventType === 'space_member_joined' && memberIdentityId) {
        void grantSpaceMembership(spaceId, memberIdentityId);
      }
      deliverToSockets(
        spaceConnections.get(spaceId),
        message,
        {
          channel,
          scope: 'space',
          key: spaceId,
          eventType,
        },
        audienceIdentityIds,
        excludeIdentityIds,
      );
      // After delivery, drop revoked members so they stop receiving further broadcasts.
      if (eventType === 'space_member_left' && memberIdentityId) {
        void revokeSpaceMembership(spaceId, memberIdentityId);
      }
      return;
    }

    // Identity channel: fan out to that identity's sockets.
    const identityId = unprefixed.replace('identity:', '');
    deliverToSockets(connections.get(identityId), message, {
      channel,
      scope: 'identity',
      key: identityId,
      eventType,
    });
  };

  const subscriber = getSubscriber();
  subscriber.on('message', messageHandler);

  // Set up reconnection handler to re-subscribe after Redis reconnects
  if (!reconnectionHandlerInitialized) {
    reconnectionHandlerInitialized = true;
    subscriber.on('ready', () => {
      // Only re-subscribe if we have active subscriptions
      if (subscriptions.size > 0) {
        resubscribeAllChannels();
      }
    });
  }
}

/**
 * Subscribes to Redis channel for an identity.
 *
 * Redis SUBSCRIBE is idempotent -- calling it on an already-subscribed
 * channel is a no-op at the protocol level, so we always issue the
 * command to guarantee the subscription is active even after races
 * between close/open events.
 */
async function subscribeToIdentity(identityId: string): Promise<void> {
  const channel = RedisChannels.identity(identityId);

  if (!isRedisConnected()) {
    logger.warn('Cannot subscribe - Redis not connected', { identityId });
    return;
  }

  try {
    const subscriber = getSubscriber();
    const fullChannel = `${config.redis.keyPrefix}${channel}`;
    await subscriber.subscribe(fullChannel);
    subscriptions.add(channel);
    logger.info('Subscribed to channel', { channel: fullChannel });
  } catch (error) {
    logger.error('Failed to subscribe to channel', { error, channel });
  }
}

/**
 * Unsubscribes from Redis channel for an identity
 */
async function unsubscribeFromIdentity(identityId: string): Promise<void> {
  const channel = RedisChannels.identity(identityId);

  if (!subscriptions.has(channel)) {
    return;
  }

  if (!isRedisConnected()) {
    subscriptions.delete(channel);
    return;
  }

  try {
    const subscriber = getSubscriber();
    await subscriber.unsubscribe(`${config.redis.keyPrefix}${channel}`);
    subscriptions.delete(channel);
    logger.info('Unsubscribed from channel', { channel });
  } catch (error) {
    logger.error('Failed to unsubscribe from channel', { error, channel });
  }
}

/**
 * Subscribes to a Space broadcast channel. Idempotent at the Redis protocol
 * level; the local `spaceConnections` set is the source of truth for fan-out.
 */
async function subscribeToSpace(spaceId: string): Promise<void> {
  const channel = RedisChannels.space(spaceId);

  if (subscriptions.has(channel)) {
    return;
  }

  // Record desired subscription before the Redis guard so the ready handler
  // can restore channels for sockets opened during an outage.
  subscriptions.add(channel);

  if (!isRedisConnected()) {
    logger.warn('Cannot subscribe to space - Redis not connected', { spaceId });
    return;
  }

  try {
    const subscriber = getSubscriber();
    await subscriber.subscribe(`${config.redis.keyPrefix}${channel}`);
    logger.info('Subscribed to space channel', { channel });
  } catch (error) {
    logger.error('Failed to subscribe to space channel', { error, channel });
  }
}

/**
 * Adds an already-connected identity's sockets to a Space's local fan-out set
 * after they join. Subscribes to the Redis space channel when needed.
 */
async function grantSpaceMembership(spaceId: string, identityId: string): Promise<void> {
  const identitySockets = connections.get(identityId);
  if (!identitySockets || identitySockets.size === 0) {
    return;
  }

  let spaceSockets = spaceConnections.get(spaceId);
  if (!spaceSockets) {
    spaceSockets = new Set();
    spaceConnections.set(spaceId, spaceSockets);
  }

  for (const ws of identitySockets) {
    spaceSockets.add(ws);
    const userData = ws.getUserData();
    if (!userData.spaceIds) {
      userData.spaceIds = [];
    }
    if (!userData.spaceIds.includes(spaceId)) {
      userData.spaceIds.push(spaceId);
    }
  }

  await subscribeToSpace(spaceId);
}

/**
 * Removes an identity's sockets from a Space's local fan-out set after membership
 * is revoked (leave/kick). Unsubscribes the Redis channel when no local sockets remain.
 */
async function revokeSpaceMembership(spaceId: string, identityId: string): Promise<void> {
  const spaceSockets = spaceConnections.get(spaceId);
  if (!spaceSockets || spaceSockets.size === 0) {
    return;
  }

  const identitySockets = connections.get(identityId);
  if (!identitySockets) {
    return;
  }

  for (const ws of identitySockets) {
    if (!spaceSockets.has(ws)) continue;
    spaceSockets.delete(ws);
    const userData = ws.getUserData();
    if (userData.spaceIds?.length) {
      userData.spaceIds = userData.spaceIds.filter((id) => id !== spaceId);
    }
  }

  if (spaceSockets.size === 0) {
    spaceConnections.delete(spaceId);
    await unsubscribeFromSpace(spaceId);
  }
}

/**
 * Unsubscribes from a Space channel once no local sockets remain for it.
 */
async function unsubscribeFromSpace(spaceId: string): Promise<void> {
  const channel = RedisChannels.space(spaceId);

  if (!subscriptions.has(channel)) {
    return;
  }

  if (!isRedisConnected()) {
    subscriptions.delete(channel);
    return;
  }

  try {
    const subscriber = getSubscriber();
    await subscriber.unsubscribe(`${config.redis.keyPrefix}${channel}`);
    subscriptions.delete(channel);
    logger.info('Unsubscribed from space channel', { channel });
  } catch (error) {
    logger.error('Failed to unsubscribe from space channel', { error, channel });
  }
}

/**
 * Registers a new WebSocket connection.
 *
 * Multiple sockets per identity are supported (multi-device / multi-tab).
 * Redis subscription is idempotent, so adding a second socket for an
 * already-subscribed identity is safe. When `spaceIds` are provided (the
 * identity's active Space memberships resolved at upgrade), the socket is also
 * registered for each Space's broadcast channel.
 */
export async function registerConnection(
  identityId: string,
  ws: TypedWebSocket,
  spaceIds: string[] = []
): Promise<void> {
  let sockets = connections.get(identityId);
  if (!sockets) {
    sockets = new Set();
    connections.set(identityId, sockets);
  }

  sockets.add(ws);
  await subscribeToIdentity(identityId);

  for (const spaceId of spaceIds) {
    let spaceSockets = spaceConnections.get(spaceId);
    if (!spaceSockets) {
      spaceSockets = new Set();
      spaceConnections.set(spaceId, spaceSockets);
    }
    spaceSockets.add(ws);
    await subscribeToSpace(spaceId);
  }

  // Set online presence
  if (isRedisConnected()) {
    try {
      const publisher = getPublisher();
      await publisher.setex(
        ChatRedisKeys.online(identityId),
        config.presence.heartbeatTtlSeconds,
        Date.now().toString()
      );
    } catch (error) {
      logger.warn('Failed to set online presence', { error, identityId });
    }
  }

  logger.info('Connection registered', {
    identityId: identityId.substring(0, 8) + '...',
    socketCount: sockets.size,
    totalIdentities: connections.size,
  });
}

/**
 * Unregisters a WebSocket connection.
 *
 * Removes the specific socket from the identity's set. The Redis
 * subscription and online presence are only torn down when the
 * last socket for the identity disconnects.
 */
export async function unregisterConnection(
  identityId: string,
  ws: TypedWebSocket,
  spaceIds: string[] = []
): Promise<void> {
  const sockets = connections.get(identityId);
  if (!sockets || !sockets.has(ws)) {
    logger.debug('Skipping unregister - socket not in active set', {
      identityId: identityId.substring(0, 8) + '...',
    });
    return;
  }

  sockets.delete(ws);

  // Tear down Space channel membership for this socket; unsubscribe from any
  // Space whose last local socket just disconnected.
  for (const spaceId of spaceIds) {
    const spaceSockets = spaceConnections.get(spaceId);
    if (!spaceSockets) continue;
    spaceSockets.delete(ws);
    if (spaceSockets.size === 0) {
      spaceConnections.delete(spaceId);
      await unsubscribeFromSpace(spaceId);
    }
  }

  if (sockets.size === 0) {
    connections.delete(identityId);
    await unsubscribeFromIdentity(identityId);

    // Clear online presence and set last seen only when no sockets remain
    if (isRedisConnected()) {
      try {
        const publisher = getPublisher();
        await publisher.del(ChatRedisKeys.online(identityId));
        await publisher.set(ChatRedisKeys.lastSeen(identityId), new Date().toISOString());
      } catch (error) {
        logger.warn('Failed to update presence on disconnect', { error, identityId });
      }
    }
  }

  logger.info('Connection unregistered', {
    identityId: identityId.substring(0, 8) + '...',
    remainingSockets: sockets.size,
    totalIdentities: connections.size,
  });
}

/**
 * Updates heartbeat for an identity (refreshes online presence)
 */
export async function updateHeartbeat(identityId: string): Promise<void> {
  if (!isRedisConnected()) return;

  try {
    const publisher = getPublisher();
    await publisher.setex(
      ChatRedisKeys.online(identityId),
      config.presence.heartbeatTtlSeconds,
      Date.now().toString()
    );
  } catch (error) {
    logger.warn('Failed to update heartbeat', { error, identityId });
  }
}

/**
 * Gets the total number of active sockets across all identities.
 */
export function getConnectionCount(): number {
  let total = 0;
  for (const sockets of connections.values()) {
    total += sockets.size;
  }
  return total;
}

/**
 * Gets the number of distinct connected identities.
 */
export function getIdentityCount(): number {
  return connections.size;
}

/**
 * Gets the number of active Redis channel subscriptions
 */
export function getSubscriptionCount(): number {
  return subscriptions.size;
}

/**
 * Gets all sockets for an identity
 */
export function getConnectionsForIdentity(identityId: string): Set<TypedWebSocket> | undefined {
  return connections.get(identityId);
}

/**
 * Gets all sockets registered for a Space's broadcast channel.
 */
export function getConnectionsForSpace(spaceId: string): Set<TypedWebSocket> | undefined {
  return spaceConnections.get(spaceId);
}

/**
 * Publishes a message to an identity's channel (for cross-instance routing)
 */
export async function publishToIdentity(
  identityId: string,
  message: string
): Promise<void> {
  if (!isRedisConnected()) {
    logger.warn('Cannot publish - Redis not connected', { identityId });
    return;
  }

  try {
    const publisher = getPublisher();
    const channel = `${config.redis.keyPrefix}${RedisChannels.identity(identityId)}`;
    await publisher.publish(channel, message);
  } catch (error) {
    logger.error('Failed to publish message', { error, identityId });
  }
}
