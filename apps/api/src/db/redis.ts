/**
 * Redis Connection Module
 * 
 * Provides connection management, health checking, and key generation utilities
 * for Redis. Used for sessions, OTP storage, rate limiting, and caching.
 * 
 * Features:
 * - Singleton connection pattern (safe to call connect multiple times)
 * - Automatic key prefixing for namespace isolation
 * - Connection failure resilience (tracks connection state)
 * - Health check endpoint support
 * - Graceful disconnection
 * 
 * @module db/redis
 * 
 * @example
 * ```typescript
 * import { connectRedis, getRedis, RedisKeys } from './db';
 * 
 * // Connect at startup
 * await connectRedis();
 * 
 * // Store an OTP
 * const redis = getRedis();
 * const key = RedisKeys.otp(hashedEmail);
 * await redis.set(key, JSON.stringify(otpData), 'EX', 600);
 * 
 * // Check connection status
 * if (isRedisConnected()) {
 *   // Redis operations are safe
 * }
 * ```
 */

import Redis from 'ioredis';
import { config } from '../config';
import elog from '../utils/adieuuLogger';

/** Singleton Redis client instance */
let redis: Redis | null = null;

/** Tracks whether the last connection attempt failed */
let connectionFailed = false;

/**
 * Establishes a connection to Redis.
 * 
 * Safe to call multiple times - will reuse the existing connection if already
 * connected. Implements retry logic with exponential backoff and timeout.
 * 
 * Connection options:
 * - Key prefix from config for namespace isolation
 * - 3 retry attempts with exponential backoff
 * - 5 second connection timeout
 * - 6 second overall timeout
 * 
 * @returns The Redis client instance
 * @throws Error if connection fails after retries or timeout
 * 
 * @example
 * ```typescript
 * // Connect at application startup
 * try {
 *   const redis = await connectRedis();
 *   console.log('Connected to Redis');
 * } catch (error) {
 *   console.error('Failed to connect:', error);
 *   // Application can continue without Redis in dev mode
 * }
 * ```
 */
export async function connectRedis(): Promise<Redis> {
  if (redis && !connectionFailed) return redis;

  return new Promise((resolve, reject) => {
    connectionFailed = false;

    const client = new Redis(config.redis.url, {
      // Key prefix for namespacing all keys
      keyPrefix: config.redis.keyPrefix,
      // Retry strategy with exponential backoff
      retryStrategy: (times) => {
        if (times > 3) {
          connectionFailed = true;
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      // Connection timeout in milliseconds
      connectTimeout: 5000,
      // Disable offline queue during connection test
      enableOfflineQueue: false,
      // Maximum retries per individual request
      maxRetriesPerRequest: 3,
      // Disable verbose error stack traces
      showFriendlyErrorStack: false,
    });

    // Overall connection timeout
    const timeout = setTimeout(() => {
      connectionFailed = true;
      client.disconnect();
      reject(new Error('Redis connection timeout'));
    }, 6000);

    client.once('ready', () => {
      clearTimeout(timeout);
      redis = client;
      elog.info('Connected to Redis');
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
 * Gets the Redis client instance.
 * 
 * Returns the connected Redis client for direct operations.
 * Must call `connectRedis()` first or this will throw.
 * 
 * @returns The ioredis client instance
 * @throws Error if not connected to Redis
 * 
 * @example
 * ```typescript
 * const redis = getRedis();
 * 
 * // String operations
 * await redis.set('key', 'value', 'EX', 3600);
 * const value = await redis.get('key');
 * 
 * // Hash operations
 * await redis.hset('user:123', 'name', 'John');
 * const name = await redis.hget('user:123', 'name');
 * 
 * // List operations
 * await redis.lpush('queue', 'item1', 'item2');
 * const item = await redis.rpop('queue');
 * ```
 */
export function getRedis(): Redis {
  if (!redis || connectionFailed) {
    throw new Error('Redis not connected. Call connectRedis() first.');
  }
  return redis;
}

/**
 * Checks if Redis is currently connected.
 * 
 * Returns true only if there is an active connection that hasn't failed.
 * Useful for conditional logic that should only run when Redis is available.
 * 
 * @returns true if connected, false otherwise
 * 
 * @example
 * ```typescript
 * // Skip Redis-dependent operations if not connected
 * if (isRedisConnected()) {
 *   await cacheUserData(userId, userData);
 * } else {
 *   logger.warn('Redis unavailable, skipping cache');
 * }
 * 
 * // Use in conditional feature flags
 * const features = {
 *   rateLimiting: isRedisConnected(),
 *   sessionCache: isRedisConnected(),
 * };
 * ```
 */
export function isRedisConnected(): boolean {
  return redis !== null && !connectionFailed;
}

/**
 * Health check result for Redis.
 */
export interface RedisHealthResult {
  /** Connection status: 'up' if connected and responsive, 'down' otherwise */
  status: 'up' | 'down';
  /** Round-trip latency in milliseconds (only present when status is 'up') */
  latencyMs?: number;
  /** Error message (only present when status is 'down') */
  error?: string;
}

/**
 * Checks if Redis is connected and responsive.
 * 
 * Performs a PING command to verify the connection is alive and measures
 * the round-trip latency. Useful for health check endpoints and monitoring.
 * 
 * @returns Health check result with status and latency
 * 
 * @example
 * ```typescript
 * // Health check endpoint
 * app.get('/health', async (ctx) => {
 *   const [mongo, redis] = await Promise.all([
 *     checkMongoHealth(),
 *     checkRedisHealth(),
 *   ]);
 *   
 *   const allHealthy = mongo.status === 'up' && redis.status === 'up';
 *   return success({
 *     status: allHealthy ? 'healthy' : 'degraded',
 *     services: { mongo, redis }
 *   });
 * });
 * ```
 */
export async function checkRedisHealth(): Promise<RedisHealthResult> {
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
 * Gracefully disconnects from Redis.
 * 
 * Sends a QUIT command and waits for acknowledgment before closing.
 * Safe to call even if not connected (will be a no-op). Should be called
 * during graceful shutdown.
 * 
 * @example
 * ```typescript
 * // Graceful shutdown handler
 * process.on('SIGTERM', async () => {
 *   console.log('Shutting down...');
 *   await disconnectMongo();
 *   await disconnectRedis();
 *   process.exit(0);
 * });
 * ```
 */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    try {
      await redis.quit();
    } catch {
      // Ignore quit errors (connection might already be closed)
    }
    redis = null;
    connectionFailed = false;
    elog.info('Disconnected from Redis');
  }
}

/**
 * Redis key generator functions.
 * 
 * Provides consistent key naming conventions for different data types.
 * All keys are automatically prefixed with the global key prefix from config.
 * 
 * Key format: `{globalPrefix}{typePrefix}:{identifier}`
 * Example: `adieuu:otp:abc123...` (where `adieuu:` is the global prefix)
 * 
 * @example
 * ```typescript
 * import { getRedis, RedisKeys } from './db';
 * 
 * const redis = getRedis();
 * 
 * // OTP storage
 * const otpKey = RedisKeys.otp(hashedEmail);
 * await redis.set(otpKey, JSON.stringify(otpData), 'EX', 600);
 * 
 * // Session storage
 * const sessionKey = RedisKeys.session(sessionId);
 * await redis.set(sessionKey, JSON.stringify(sessionData), 'EX', 86400);
 * 
 * // Rate limiting
 * const rateLimitKey = RedisKeys.rateLimit('login', hashedIp);
 * await redis.incr(rateLimitKey);
 * await redis.expire(rateLimitKey, 60);
 * 
 * // User sessions index (for "logout all" functionality)
 * const userSessionsKey = RedisKeys.userSessions(userId);
 * await redis.sadd(userSessionsKey, sessionId);
 * ```
 */
export const RedisKeys = {
  /**
   * Generates a key for OTP storage.
   * 
   * @param hashedIdentifier - Hashed email or phone number
   * @returns Key in format `otp:{hashedIdentifier}`
   * 
   * @example
   * ```typescript
   * const key = RedisKeys.otp('abc123def456...');
   * // Result: 'otp:abc123def456...'
   * // With prefix: 'adieuu:otp:abc123def456...'
   * ```
   */
  otp: (hashedIdentifier: string) => `otp:${hashedIdentifier}`,

  /**
   * Generates a key for session storage.
   * 
   * @param sessionId - The session identifier
   * @returns Key in format `session:{sessionId}`
   * 
   * @example
   * ```typescript
   * const key = RedisKeys.session('ses_abc123...');
   * // Result: 'session:ses_abc123...'
   * ```
   */
  session: (sessionId: string) => `session:${sessionId}`,

  /**
   * Generates a key for rate limiting.
   * 
   * @param action - The action being rate limited (e.g., 'login', 'otp_request')
   * @param identifier - Hashed identifier (IP, user ID, etc.)
   * @returns Key in format `ratelimit:{action}:{identifier}`
   * 
   * @example
   * ```typescript
   * const key = RedisKeys.rateLimit('login', hashedIp);
   * // Result: 'ratelimit:login:abc123...'
   * ```
   */
  rateLimit: (action: string, identifier: string) => `ratelimit:${action}:${identifier}`,

  /**
   * Generates a key for user sessions index.
   * 
   * Used to track all active sessions for a user, enabling "logout all devices".
   * 
   * @param userId - The user's ID
   * @returns Key in format `user_sessions:{userId}`
   * 
   * @example
   * ```typescript
   * const key = RedisKeys.userSessions('user_123');
   * // Result: 'user_sessions:user_123'
   * 
   * // Add session to user's set
   * await redis.sadd(key, sessionId);
   * 
   * // Get all user sessions
   * const sessions = await redis.smembers(key);
   * 
   * // Logout all - delete all session keys
   * for (const sid of sessions) {
   *   await redis.del(RedisKeys.session(sid));
   * }
   * await redis.del(key);
   * ```
   */
  userSessions: (userId: string) => `user_sessions:${userId}`,

  /**
   * Generates a Redis pub/sub channel name for an identity.
   * Used for real-time message delivery via the chat service.
   * 
   * @param identityId - The identity's ID
   * @returns Channel name in format `identity:{identityId}`
   * 
   * @example
   * ```typescript
   * const channel = RedisKeys.identityChannel('abc123...');
   * await redis.publish(channel, JSON.stringify(event));
   * ```
   */
  identityChannel: (identityId: string) => `identity:${identityId}`,

  /**
   * Identity login rate-limiting counter keyed by accountHash.
   * Stores the current attempt count with a TTL window.
   */
  identityLoginAttempts: (accountHash: string) => `ratelimit:identity_login:${accountHash}`,

  /**
   * Pending lockout notifications keyed by accountHash.
   * Checked and drained on next account login.
   */
  lockoutPending: (accountHash: string) => `lockout_pending:${accountHash}`,

  /**
   * Cached JSON blob for auth allowlist state (enforced + email/phone sets).
   * Invalidated on any platform_settings write.
   */
  platformAuthAllowlistCache: () => 'platform_setting_cache:auth_allowlist',

  /** Klipy search result cache. */
  klipyCache: (type: string, query: string, page: number, perPage: number) =>
    `klipy:cache:${type}:${query}:${page}:${perPage}`,

  /** Klipy trending result cache. */
  klipyTrendingCache: (type: string, page: number) =>
    `klipy:cache:trending:${type}:${page}`,

  /** Progressive throttle tier for Klipy search (0-3). */
  klipyThrottleTier: (identityId: string) =>
    `klipy:throttle:${identityId}`,
} as const;

/**
 * Type representing the RedisKeys object structure.
 * 
 * @example
 * ```typescript
 * // Type-safe key generation
 * function generateKey<K extends keyof typeof RedisKeys>(
 *   type: K,
 *   ...args: Parameters<typeof RedisKeys[K]>
 * ): string {
 *   return (RedisKeys[type] as Function)(...args);
 * }
 * ```
 */
export type RedisKeyGenerators = typeof RedisKeys;
