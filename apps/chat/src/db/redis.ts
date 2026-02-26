/**
 * Redis Connection Module for Chat Service
 *
 * Provides Redis connections for pub/sub messaging between chat server instances.
 * Uses two separate connections: one for publishing, one for subscribing.
 */

import Redis from 'ioredis';
import { config } from '../config';
import logger from '../utils/logger';

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let publisherConnected = false;
let subscriberConnected = false;

/**
 * Creates a Redis client with standard configuration and persistent reconnection
 */
function createClient(name: string, onConnectionChange: (connected: boolean) => void): Promise<Redis> {
  return new Promise((resolve, reject) => {
    const client = new Redis(config.redis.url, {
      keyPrefix: config.redis.keyPrefix,
      retryStrategy: (times) => {
        // Exponential backoff with max 30 second delay, retry indefinitely
        const delay = Math.min(times * 500, 30000);
        logger.warn(`Redis ${name} reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
      },
      connectTimeout: 10000,
      enableOfflineQueue: true,
      maxRetriesPerRequest: null, // Retry indefinitely for pub/sub
      showFriendlyErrorStack: false,
      lazyConnect: false,
    });

    let initialConnectionResolved = false;
    const timeout = setTimeout(() => {
      if (!initialConnectionResolved) {
        initialConnectionResolved = true;
        client.disconnect();
        reject(new Error(`Redis ${name} initial connection timeout`));
      }
    }, 15000);

    client.on('ready', () => {
      if (!initialConnectionResolved) {
        clearTimeout(timeout);
        initialConnectionResolved = true;
        logger.info(`Redis ${name} connected`);
        onConnectionChange(true);
        resolve(client);
      } else {
        // Reconnected after initial connection
        logger.info(`Redis ${name} reconnected`);
        onConnectionChange(true);
      }
    });

    client.on('error', (err) => {
      if (!initialConnectionResolved) {
        clearTimeout(timeout);
        initialConnectionResolved = true;
        reject(err);
      } else {
        // Log but don't crash - ioredis will retry
        logger.error(`Redis ${name} error`, { error: err.message });
      }
    });

    client.on('close', () => {
      logger.warn(`Redis ${name} connection closed`);
      onConnectionChange(false);
    });

    client.on('reconnecting', () => {
      logger.debug(`Redis ${name} reconnecting...`);
    });
  });
}

/**
 * Connects to Redis and creates publisher/subscriber clients
 */
export async function connectRedis(): Promise<void> {
  if (publisher && subscriber) {
    return;
  }

  const [pub, sub] = await Promise.all([
    createClient('publisher', (connected) => {
      publisherConnected = connected;
    }),
    createClient('subscriber', (connected) => {
      subscriberConnected = connected;
    }),
  ]);

  publisher = pub;
  subscriber = sub;
  publisherConnected = true;
  subscriberConnected = true;
}

/**
 * Gets the Redis publisher client
 */
export function getPublisher(): Redis {
  if (!publisher) {
    throw new Error('Redis publisher not initialized. Call connectRedis() first.');
  }
  return publisher;
}

/**
 * Gets the Redis subscriber client
 */
export function getSubscriber(): Redis {
  if (!subscriber) {
    throw new Error('Redis subscriber not initialized. Call connectRedis() first.');
  }
  return subscriber;
}

/**
 * Checks if Redis is connected (both publisher and subscriber are ready)
 */
export function isRedisConnected(): boolean {
  return publisherConnected && subscriberConnected;
}

/**
 * Health check for Redis connections
 */
export interface RedisHealthResult {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

export async function checkRedisHealth(): Promise<RedisHealthResult> {
  if (!publisher || !publisherConnected) {
    return { status: 'down', error: 'Not connected' };
  }

  try {
    const start = performance.now();
    await publisher.ping();
    const latencyMs = Math.round(performance.now() - start);
    return { status: 'up', latencyMs };
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gracefully disconnects from Redis
 */
export async function disconnectRedis(): Promise<void> {
  const promises: Promise<void>[] = [];

  if (subscriber) {
    promises.push(
      subscriber.quit().then(() => {
        subscriber = null;
        subscriberConnected = false;
      }).catch(() => {
        subscriber = null;
        subscriberConnected = false;
      })
    );
  }

  if (publisher) {
    promises.push(
      publisher.quit().then(() => {
        publisher = null;
        publisherConnected = false;
      }).catch(() => {
        publisher = null;
        publisherConnected = false;
      })
    );
  }

  await Promise.all(promises);
  logger.info('Disconnected from Redis');
}
