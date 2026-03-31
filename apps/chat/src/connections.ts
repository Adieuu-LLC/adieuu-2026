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
export function initializeMessageHandler(): void {
  if (messageHandler) return;

  messageHandler = (channel: string, message: string) => {
    const identityId = channel.replace(`${config.redis.keyPrefix}identity:`, '');
    const sockets = connections.get(identityId);

    let eventType: string | undefined;
    try {
      const parsed = JSON.parse(message);
      eventType = parsed?.type;
    } catch {
      // Best-effort parse for logging; forward the raw message regardless
    }

    if (!sockets || sockets.size === 0) {
      logger.info('Redis message received but no local connection', {
        identityId: identityId.substring(0, 8) + '...',
        eventType,
        channel,
      });
      return;
    }

    for (const ws of sockets) {
      try {
        const sendResult = ws.send(message);
        if (sendResult === 1) {
          logger.info('Message delivered to WebSocket', {
            identityId: identityId.substring(0, 8) + '...',
            eventType,
            byteLength: message.length,
            socketCount: sockets.size,
          });
        } else {
          logger.warn('Message dropped by uWS', {
            identityId: identityId.substring(0, 8) + '...',
            eventType,
            sendResult,
            byteLength: message.length,
          });
        }
      } catch (error) {
        logger.error('Failed to send message to WebSocket', {
          error,
          identityId: identityId.substring(0, 8) + '...',
          eventType,
        });
      }
    }
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
 * Registers a new WebSocket connection.
 *
 * Multiple sockets per identity are supported (multi-device / multi-tab).
 * Redis subscription is idempotent, so adding a second socket for an
 * already-subscribed identity is safe.
 */
export async function registerConnection(
  identityId: string,
  ws: TypedWebSocket
): Promise<void> {
  let sockets = connections.get(identityId);
  if (!sockets) {
    sockets = new Set();
    connections.set(identityId, sockets);
  }

  sockets.add(ws);
  await subscribeToIdentity(identityId);

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
  ws: TypedWebSocket
): Promise<void> {
  const sockets = connections.get(identityId);
  if (!sockets || !sockets.has(ws)) {
    logger.debug('Skipping unregister - socket not in active set', {
      identityId: identityId.substring(0, 8) + '...',
    });
    return;
  }

  sockets.delete(ws);

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
