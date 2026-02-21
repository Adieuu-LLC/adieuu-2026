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
let connectionFailed = false;

/**
 * Creates a Redis client with standard configuration
 */
function createClient(name: string): Promise<Redis> {
  return new Promise((resolve, reject) => {
    const client = new Redis(config.redis.url, {
      keyPrefix: config.redis.keyPrefix,
      retryStrategy: (times) => {
        if (times > 3) {
          connectionFailed = true;
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      connectTimeout: 5000,
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3,
      showFriendlyErrorStack: false,
    });

    const timeout = setTimeout(() => {
      connectionFailed = true;
      client.disconnect();
      reject(new Error(`Redis ${name} connection timeout`));
    }, 6000);

    client.once('ready', () => {
      clearTimeout(timeout);
      logger.info(`Redis ${name} connected`);
      resolve(client);
    });

    client.once('error', (err) => {
      clearTimeout(timeout);
      connectionFailed = true;
      client.disconnect();
      reject(err);
    });
  });
}

/**
 * Connects to Redis and creates publisher/subscriber clients
 */
export async function connectRedis(): Promise<void> {
  if (publisher && subscriber && !connectionFailed) {
    return;
  }

  connectionFailed = false;

  const [pub, sub] = await Promise.all([
    createClient('publisher'),
    createClient('subscriber'),
  ]);

  publisher = pub;
  subscriber = sub;
}

/**
 * Gets the Redis publisher client
 */
export function getPublisher(): Redis {
  if (!publisher || connectionFailed) {
    throw new Error('Redis publisher not connected. Call connectRedis() first.');
  }
  return publisher;
}

/**
 * Gets the Redis subscriber client
 */
export function getSubscriber(): Redis {
  if (!subscriber || connectionFailed) {
    throw new Error('Redis subscriber not connected. Call connectRedis() first.');
  }
  return subscriber;
}

/**
 * Checks if Redis is connected
 */
export function isRedisConnected(): boolean {
  return publisher !== null && subscriber !== null && !connectionFailed;
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
  if (!publisher || connectionFailed) {
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
      }).catch(() => {
        subscriber = null;
      })
    );
  }

  if (publisher) {
    promises.push(
      publisher.quit().then(() => {
        publisher = null;
      }).catch(() => {
        publisher = null;
      })
    );
  }

  await Promise.all(promises);
  connectionFailed = false;
  logger.info('Disconnected from Redis');
}
