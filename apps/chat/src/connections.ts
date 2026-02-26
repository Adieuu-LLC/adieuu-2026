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
 * Map of identity ID -> WebSocket connection
 * Note: For multi-device support, this would need to be Map<string, Set<TypedWebSocket>>
 */
const connections = new Map<string, TypedWebSocket>();

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
    logger.info('Re-subscribed to all channels', { channelCount: channels.length });
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
    const ws = connections.get(identityId);

    if (ws) {
      try {
        ws.send(message);
      } catch (error) {
        logger.warn('Failed to send message to WebSocket', { error, identityId });
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
 * Subscribes to Redis channel for an identity
 */
async function subscribeToIdentity(identityId: string): Promise<void> {
  const channel = RedisChannels.identity(identityId);

  if (subscriptions.has(channel)) {
    return;
  }

  if (!isRedisConnected()) {
    logger.warn('Cannot subscribe - Redis not connected', { identityId });
    return;
  }

  try {
    const subscriber = getSubscriber();
    await subscriber.subscribe(`${config.redis.keyPrefix}${channel}`);
    subscriptions.add(channel);
    logger.debug('Subscribed to channel', { channel });
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
    logger.debug('Unsubscribed from channel', { channel });
  } catch (error) {
    logger.error('Failed to unsubscribe from channel', { error, channel });
  }
}

/**
 * Registers a new WebSocket connection
 */
export async function registerConnection(
  identityId: string,
  ws: TypedWebSocket
): Promise<void> {
  connections.set(identityId, ws);
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
    totalConnections: connections.size,
  });
}

/**
 * Unregisters a WebSocket connection
 */
export async function unregisterConnection(identityId: string): Promise<void> {
  connections.delete(identityId);
  await unsubscribeFromIdentity(identityId);

  // Clear online presence and set last seen
  if (isRedisConnected()) {
    try {
      const publisher = getPublisher();
      await publisher.del(ChatRedisKeys.online(identityId));
      await publisher.set(ChatRedisKeys.lastSeen(identityId), new Date().toISOString());
    } catch (error) {
      logger.warn('Failed to update presence on disconnect', { error, identityId });
    }
  }

  logger.info('Connection unregistered', {
    identityId: identityId.substring(0, 8) + '...',
    totalConnections: connections.size,
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
 * Gets the number of active connections
 */
export function getConnectionCount(): number {
  return connections.size;
}

/**
 * Gets a connection by identity ID
 */
export function getConnection(identityId: string): TypedWebSocket | undefined {
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
