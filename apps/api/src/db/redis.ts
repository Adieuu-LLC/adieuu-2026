/**
 * Redis connection utility
 * Manages connection lifecycle for sessions, rate limiting, and OTP storage
 */

import Redis from 'ioredis';
import { config } from '../config';

let redis: Redis | null = null;
let connectionFailed = false;

/**
 * Connect to Redis
 * Safe to call multiple times - will reuse existing connection
 */
export async function connectRedis(): Promise<Redis> {
  if (redis && !connectionFailed) return redis;

  return new Promise((resolve, reject) => {
    connectionFailed = false;

    const client = new Redis(config.redis.url, {
      // Key prefix for namespacing
      keyPrefix: config.redis.keyPrefix,
      // Disable retry for initial connection test
      retryStrategy: (times) => {
        if (times > 3) {
          connectionFailed = true;
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      // Connection timeout
      connectTimeout: 5000,
      // Disable offline queue for connection test
      enableOfflineQueue: false,
      // Max retries per request
      maxRetriesPerRequest: 3,
      // Don't show error messages for connection issues
      showFriendlyErrorStack: false,
    });

    const timeout = setTimeout(() => {
      connectionFailed = true;
      client.disconnect();
      reject(new Error('Redis connection timeout'));
    }, 6000);

    client.once('ready', () => {
      clearTimeout(timeout);
      redis = client;
      console.log('Connected to Redis');
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
 * Get the Redis instance
 * Throws if not connected
 */
export function getRedis(): Redis {
  if (!redis || connectionFailed) {
    throw new Error('Redis not connected. Call connectRedis() first.');
  }
  return redis;
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redis !== null && !connectionFailed;
}

/**
 * Check if Redis is connected and responsive
 */
export async function checkRedisHealth(): Promise<{
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}> {
  if (!redis || connectionFailed) {
    return { status: 'down', error: 'Not connected' };
  }

  try {
    const start = performance.now();
    await redis.ping();
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
 * Disconnect from Redis
 */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    try {
      await redis.quit();
    } catch {
      // Ignore quit errors
    }
    redis = null;
    connectionFailed = false;
    console.log('Disconnected from Redis');
  }
}

/**
 * Redis key prefixes for different data types
 * Used in addition to the global keyPrefix from config
 */
export const RedisKeys = {
  /** OTP storage: otp:{hashedIdentifier} */
  otp: (hashedIdentifier: string) => `otp:${hashedIdentifier}`,

  /** Session storage: session:{sessionId} */
  session: (sessionId: string) => `session:${sessionId}`,

  /** Rate limiting: ratelimit:{action}:{identifier} */
  rateLimit: (action: string, identifier: string) => `ratelimit:${action}:${identifier}`,

  /** User sessions index: user_sessions:{userId} */
  userSessions: (userId: string) => `user_sessions:${userId}`,
} as const;
