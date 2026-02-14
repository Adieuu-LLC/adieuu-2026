/**
 * Rate Limiting Service
 * Redis-based sliding window rate limiting
 */

import { getRedis, isRedisConnected, RedisKeys } from '../db';

/** Rate limit configuration */
export interface RateLimitConfig {
  /** Maximum number of requests in the window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
}

/** Predefined rate limit configurations */
export const RATE_LIMITS = {
  // Auth endpoints (strict)
  'auth:request:identifier': { limit: 3, windowSeconds: 900 } as RateLimitConfig,   // 3 per 15 min
  'auth:request:ip': { limit: 10, windowSeconds: 900 } as RateLimitConfig,          // 10 per 15 min
  'auth:verify:identifier': { limit: 5, windowSeconds: 900 } as RateLimitConfig,    // 5 per 15 min
  'auth:verify:ip': { limit: 20, windowSeconds: 900 } as RateLimitConfig,           // 20 per 15 min

  // General limits
  'global:user': { limit: 100, windowSeconds: 60 } as RateLimitConfig,              // 100 per min
  'global:ip': { limit: 1000, windowSeconds: 60 } as RateLimitConfig,               // 1000 per min
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

/** Rate limit check result */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in the current window */
  remaining: number;
  /** Unix timestamp when the window resets */
  resetAt: number;
  /** Total limit for this action */
  limit: number;
}

/**
 * Check and increment rate limit for an action/identifier pair
 * Uses Redis sorted sets for sliding window implementation
 * 
 * @param action - The rate limit action (e.g., 'auth:request:identifier')
 * @param identifier - The identifier to limit (e.g., hashed email, IP)
 * @param config - Optional custom config (defaults to predefined)
 * @returns Rate limit result
 */
export async function checkRateLimit(
  action: RateLimitAction | string,
  identifier: string,
  config?: RateLimitConfig
): Promise<RateLimitResult> {
  // If Redis is not connected, allow the request (fail open for dev)
  if (!isRedisConnected()) {
    const cfg = config ?? RATE_LIMITS[action as RateLimitAction] ?? { limit: 100, windowSeconds: 60 };
    return {
      allowed: true,
      remaining: cfg.limit - 1,
      resetAt: Math.ceil(Date.now() / 1000) + cfg.windowSeconds,
      limit: cfg.limit,
    };
  }

  const cfg = config ?? RATE_LIMITS[action as RateLimitAction];
  if (!cfg) {
    throw new Error(`Unknown rate limit action: ${action}`);
  }

  const redis = getRedis();
  const key = RedisKeys.rateLimit(action, identifier);
  const now = Date.now();
  const windowStart = now - (cfg.windowSeconds * 1000);

  // Use Redis transaction for atomic operations
  const pipeline = redis.pipeline();

  // Remove entries outside the window
  pipeline.zremrangebyscore(key, '-inf', windowStart);

  // Add current request
  pipeline.zadd(key, now, `${now}-${Math.random()}`);

  // Count requests in window
  pipeline.zcard(key);

  // Set expiry on the key
  pipeline.expire(key, cfg.windowSeconds);

  const results = await pipeline.exec();

  // Get the count from zcard result
  const count = results?.[2]?.[1] as number ?? 0;
  const allowed = count <= cfg.limit;
  const remaining = Math.max(0, cfg.limit - count);
  const resetAt = Math.ceil((now + cfg.windowSeconds * 1000) / 1000);

  return {
    allowed,
    remaining,
    resetAt,
    limit: cfg.limit,
  };
}

/**
 * Get current rate limit status without incrementing
 * 
 * @param action - The rate limit action
 * @param identifier - The identifier to check
 * @returns Current count and remaining
 */
export async function getRateLimitStatus(
  action: RateLimitAction | string,
  identifier: string
): Promise<{ count: number; remaining: number; limit: number }> {
  if (!isRedisConnected()) {
    const cfg = RATE_LIMITS[action as RateLimitAction] ?? { limit: 100, windowSeconds: 60 };
    return { count: 0, remaining: cfg.limit, limit: cfg.limit };
  }

  const cfg = RATE_LIMITS[action as RateLimitAction];
  if (!cfg) {
    throw new Error(`Unknown rate limit action: ${action}`);
  }

  const redis = getRedis();
  const key = RedisKeys.rateLimit(action, identifier);
  const now = Date.now();
  const windowStart = now - (cfg.windowSeconds * 1000);

  // Remove old entries and count
  await redis.zremrangebyscore(key, '-inf', windowStart);
  const count = await redis.zcard(key);

  return {
    count,
    remaining: Math.max(0, cfg.limit - count),
    limit: cfg.limit,
  };
}

/**
 * Reset rate limit for an action/identifier pair
 * Useful for testing or admin operations
 */
export async function resetRateLimit(
  action: string,
  identifier: string
): Promise<void> {
  if (!isRedisConnected()) return;

  const redis = getRedis();
  const key = RedisKeys.rateLimit(action, identifier);
  await redis.del(key);
}

