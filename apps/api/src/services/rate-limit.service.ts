/**
 * @fileoverview Rate Limiting Service
 *
 * Provides Redis-based sliding window rate limiting for API endpoints.
 * Uses sorted sets for efficient, accurate sliding window implementation.
 *
 * @module services/rate-limit
 *
 * @remarks
 * Sliding window rate limiting provides more accurate rate limiting than
 * fixed window approaches, preventing burst attacks at window boundaries.
 *
 * How it works:
 * 1. Each request is stored as a member in a Redis sorted set with timestamp as score
 * 2. Old entries (outside the window) are removed before counting
 * 3. If count exceeds limit, request is denied
 * 4. Keys automatically expire to prevent memory buildup
 *
 * Rate limiting can be disabled via RATE_LIMIT_ENABLED=false for development.
 *
 * @example
 * ```typescript
 * import { checkRateLimit, RATE_LIMITS } from './services/rate-limit.service';
 *
 * // Check rate limit for auth request
 * const result = await checkRateLimit('auth:request:ip', ipHash);
 * if (!result.allowed) {
 *   return new Response('Too many requests', {
 *     status: 429,
 *     headers: {
 *       'Retry-After': String(result.resetAt - Math.floor(Date.now() / 1000)),
 *       'X-RateLimit-Limit': String(result.limit),
 *       'X-RateLimit-Remaining': '0',
 *     },
 *   });
 * }
 * ```
 */

import { getRedis, isRedisConnected, RedisKeys } from '../db';
import { config } from '../config';

/**
 * Configuration for a rate limit rule
 *
 * @example
 * ```typescript
 * const strictLimit: RateLimitConfig = {
 *   limit: 3,
 *   windowSeconds: 900, // 15 minutes
 * };
 * ```
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window */
  limit: number;
  /** Sliding window size in seconds */
  windowSeconds: number;
}

/**
 * Gets rate limits from config, allowing runtime configuration via env vars.
 * This function is called at runtime to get current config values.
 */
function getRateLimits(): Record<string, RateLimitConfig> {
  return {
    /**
     * OTP request limit per identifier (email/phone)
     * 3 requests per 15 minutes prevents abuse while allowing retries
     */
    'auth:request:identifier': {
      limit: config.rateLimit.authRequestIdentifierLimit,
      windowSeconds: config.rateLimit.authRequestIdentifierWindow,
    },

    /**
     * OTP request limit per IP address
     * 10 requests per 15 minutes allows multiple users behind NAT
     */
    'auth:request:ip': {
      limit: config.rateLimit.authRequestIpLimit,
      windowSeconds: config.rateLimit.authRequestIpWindow,
    },

    /**
     * OTP verification limit per identifier
     * 5 attempts per 15 minutes (in addition to per-OTP limits)
     */
    'auth:verify:identifier': {
      limit: config.rateLimit.authVerifyIdentifierLimit,
      windowSeconds: config.rateLimit.authVerifyIdentifierWindow,
    },

    /**
     * OTP verification limit per IP address
     * 20 attempts per 15 minutes
     */
    'auth:verify:ip': {
      limit: config.rateLimit.authVerifyIpLimit,
      windowSeconds: config.rateLimit.authVerifyIpWindow,
    },

    /**
     * Global request limit per authenticated user
     * 100 requests per minute for general API usage
     */
    'global:user': {
      limit: config.rateLimit.globalUserLimit,
      windowSeconds: config.rateLimit.globalUserWindow,
    },

    /**
     * Global request limit per IP address
     * 1000 requests per minute (high to allow multiple users behind NAT)
     */
    'global:ip': {
      limit: config.rateLimit.globalIpLimit,
      windowSeconds: config.rateLimit.globalIpWindow,
    },

    /**
     * User email verification request limit per IP
     * Reuses auth request IP limits
     */
    'user:email:ip': {
      limit: config.rateLimit.authRequestIpLimit,
      windowSeconds: config.rateLimit.authRequestIpWindow,
    },

    /**
     * User email verification request limit per identifier
     * Reuses auth request identifier limits
     */
    'user:email:identifier': {
      limit: config.rateLimit.authRequestIdentifierLimit,
      windowSeconds: config.rateLimit.authRequestIdentifierWindow,
    },

    /**
     * User phone verification request limit per IP
     * Reuses auth request IP limits
     */
    'user:phone:ip': {
      limit: config.rateLimit.authRequestIpLimit,
      windowSeconds: config.rateLimit.authRequestIpWindow,
    },

    /**
     * User phone verification request limit per identifier
     * Reuses auth request identifier limits
     */
    'user:phone:identifier': {
      limit: config.rateLimit.authRequestIdentifierLimit,
      windowSeconds: config.rateLimit.authRequestIdentifierWindow,
    },

    /**
     * Klipy search per identity (base tier — progressive throttle may lower this)
     */
    'klipy:search:identity': {
      limit: config.rateLimit.klipySearchIdentityLimit,
      windowSeconds: config.rateLimit.klipySearchIdentityWindow,
    },

    /**
     * Call initiate per identity (base tier — progressive throttle may lower this)
     */
    'calls:initiate:identity': {
      limit: config.rateLimit.callsInitiateIdentityLimit,
      windowSeconds: config.rateLimit.callsInitiateIdentityWindow,
    },
  };
}

/**
 * Predefined rate limit configurations for common actions.
 * These are the default values; actual values come from config.
 *
 * @deprecated Use getRateLimits() for runtime config values
 */
export const RATE_LIMITS = {
  'auth:request:identifier': { limit: 3, windowSeconds: 900 } as RateLimitConfig,
  'auth:request:ip': { limit: 10, windowSeconds: 900 } as RateLimitConfig,
  'auth:verify:identifier': { limit: 5, windowSeconds: 900 } as RateLimitConfig,
  'auth:verify:ip': { limit: 20, windowSeconds: 900 } as RateLimitConfig,
  'global:user': { limit: 100, windowSeconds: 60 } as RateLimitConfig,
  'global:ip': { limit: 1000, windowSeconds: 60 } as RateLimitConfig,
  'user:email:ip': { limit: 10, windowSeconds: 900 } as RateLimitConfig,
  'user:email:identifier': { limit: 3, windowSeconds: 900 } as RateLimitConfig,
  'user:phone:ip': { limit: 10, windowSeconds: 900 } as RateLimitConfig,
  'user:phone:identifier': { limit: 3, windowSeconds: 900 } as RateLimitConfig,
} as const;

/**
 * Type representing valid rate limit action keys
 */
export type RateLimitAction = keyof typeof RATE_LIMITS;

/**
 * Result of a rate limit check
 *
 * @example
 * ```typescript
 * const result: RateLimitResult = {
 *   allowed: true,
 *   remaining: 5,
 *   resetAt: 1640000000,
 *   limit: 10,
 * };
 *
 * // Set rate limit headers
 * response.headers.set('X-RateLimit-Limit', String(result.limit));
 * response.headers.set('X-RateLimit-Remaining', String(result.remaining));
 * response.headers.set('X-RateLimit-Reset', String(result.resetAt));
 * ```
 */
export interface RateLimitResult {
  /** Whether the request is allowed (count <= limit) */
  allowed: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Unix timestamp (seconds) when the window resets */
  resetAt: number;
  /** Total limit for this action */
  limit: number;
}

/**
 * Checks and increments rate limit for an action/identifier pair
 *
 * Uses Redis sorted sets for accurate sliding window rate limiting.
 * The check and increment are performed atomically using a pipeline.
 *
 * @param action - The rate limit action (must be a key in RATE_LIMITS or custom)
 * @param identifier - The identifier to limit (should be hashed for privacy)
 * @param customConfig - Optional custom config (overrides predefined limits)
 * @returns Rate limit result with allow status and metadata
 *
 * @remarks
 * - If rate limiting is disabled via RATE_LIMIT_ENABLED=false, always allows
 * - If Redis is unavailable, fails open (allows the request) in development mode
 *
 * @throws Error if action is not found in RATE_LIMITS and no config provided
 *
 * @example
 * ```typescript
 * // Using predefined limits
 * const result = await checkRateLimit('auth:request:ip', hashedIp);
 *
 * // Using custom limits
 * const result = await checkRateLimit(
 *   'custom:action',
 *   userId,
 *   { limit: 5, windowSeconds: 60 }
 * );
 *
 * if (!result.allowed) {
 *   return new Response('Rate limited', { status: 429 });
 * }
 * ```
 */
export async function checkRateLimit(
  action: RateLimitAction | string,
  identifier: string,
  customConfig?: RateLimitConfig
): Promise<RateLimitResult> {
  const rateLimits = getRateLimits();
  const cfg = customConfig ?? rateLimits[action] ?? RATE_LIMITS[action as RateLimitAction];

  if (!cfg) {
    throw new Error(`Unknown rate limit action: ${action}`);
  }

  // If rate limiting is disabled, always allow
  if (!config.rateLimit.enabled) {
    return {
      allowed: true,
      remaining: cfg.limit - 1,
      resetAt: Math.ceil(Date.now() / 1000) + cfg.windowSeconds,
      limit: cfg.limit,
    };
  }

  // If Redis is not connected, allow the request (fail open for dev)
  if (!isRedisConnected()) {
    return {
      allowed: true,
      remaining: cfg.limit - 1,
      resetAt: Math.ceil(Date.now() / 1000) + cfg.windowSeconds,
      limit: cfg.limit,
    };
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
 * Gets current rate limit status without incrementing the counter
 *
 * Useful for displaying rate limit information to users without
 * counting the request itself.
 *
 * @param action - The rate limit action (must be a key in RATE_LIMITS)
 * @param identifier - The identifier to check (should be hashed for privacy)
 * @returns Current count, remaining requests, and limit
 *
 * @throws Error if action is not found in RATE_LIMITS
 *
 * @example
 * ```typescript
 * // Check how many requests a user has remaining
 * const status = await getRateLimitStatus('auth:request:identifier', hashedEmail);
 * console.log(`${status.remaining} of ${status.limit} requests remaining`);
 * ```
 */
export async function getRateLimitStatus(
  action: RateLimitAction | string,
  identifier: string
): Promise<{ count: number; remaining: number; limit: number }> {
  const rateLimits = getRateLimits();
  const cfg = rateLimits[action] ?? RATE_LIMITS[action as RateLimitAction];

  if (!cfg) {
    throw new Error(`Unknown rate limit action: ${action}`);
  }

  // If rate limiting disabled or Redis not connected, return full allowance
  if (!config.rateLimit.enabled || !isRedisConnected()) {
    return { count: 0, remaining: cfg.limit, limit: cfg.limit };
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

// ---------------------------------------------------------------------------
// Progressive throttle for Klipy search
// ---------------------------------------------------------------------------

/** Maximum penalty tier (0 = no penalty, 3 = most restrictive). */
const KLIPY_MAX_THROTTLE_TIER = 3;

/** Divisor per tier — limit is halved each tier: 30 → 15 → 8 → 4. */
const KLIPY_TIER_DIVISORS = [1, 2, 4, 8] as const;

/**
 * Reads the current progressive throttle tier for an identity's Klipy
 * search usage and returns the adjusted rate limit config.
 *
 * The tier is stored in Redis as a simple integer key with a TTL
 * equal to the configured cooldown.  Each time the identity is actually
 * rate-limited (429), the route handler should call
 * {@link escalateKlipyThrottle} to bump the tier.
 *
 * @param identityId - The identity to check
 * @returns Adjusted {@link RateLimitConfig} for `klipy:search:identity`
 */
export async function getKlipySearchConfig(identityId: string): Promise<RateLimitConfig> {
  const baseLimit = config.rateLimit.klipySearchIdentityLimit;
  const window = config.rateLimit.klipySearchIdentityWindow;

  if (!config.rateLimit.enabled || !isRedisConnected()) {
    return { limit: baseLimit, windowSeconds: window };
  }

  try {
    const redis = getRedis();
    const key = RedisKeys.klipyThrottleTier(identityId);
    const raw = await redis.get(key);
    const tier = Math.min(parseInt(raw ?? '0', 10) || 0, KLIPY_MAX_THROTTLE_TIER);
    const divisor = KLIPY_TIER_DIVISORS[tier] ?? 1;
    return { limit: Math.max(1, Math.floor(baseLimit / divisor)), windowSeconds: window };
  } catch {
    return { limit: baseLimit, windowSeconds: window };
  }
}

/**
 * Bumps the progressive throttle tier for an identity after a 429.
 * The key auto-expires after the configured cooldown, decaying back to 0.
 */
export async function escalateKlipyThrottle(identityId: string): Promise<void> {
  if (!isRedisConnected()) return;
  try {
    const redis = getRedis();
    const key = RedisKeys.klipyThrottleTier(identityId);
    const current = parseInt((await redis.get(key)) ?? '0', 10) || 0;
    const next = Math.min(current + 1, KLIPY_MAX_THROTTLE_TIER);
    await redis.set(key, String(next), 'EX', config.rateLimit.klipyThrottleCooldown);
  } catch {
    // Non-critical — fail silently
  }
}

// ---------------------------------------------------------------------------
// Progressive throttle for call initiation
// ---------------------------------------------------------------------------

const CALL_INITIATE_MAX_THROTTLE_TIER = 3;
const CALL_INITIATE_TIER_DIVISORS = [1, 2, 4, 8] as const;

/**
 * Returns adjusted rate limit config for call initiation based on throttle tier.
 */
export async function getCallInitiateConfig(identityId: string): Promise<RateLimitConfig> {
  const baseLimit = config.rateLimit.callsInitiateIdentityLimit;
  const window = config.rateLimit.callsInitiateIdentityWindow;

  if (!config.rateLimit.enabled || !isRedisConnected()) {
    return { limit: baseLimit, windowSeconds: window };
  }

  try {
    const redis = getRedis();
    const key = RedisKeys.callInitiateThrottleTier(identityId);
    const raw = await redis.get(key);
    const tier = Math.min(parseInt(raw ?? '0', 10) || 0, CALL_INITIATE_MAX_THROTTLE_TIER);
    const divisor = CALL_INITIATE_TIER_DIVISORS[tier] ?? 1;
    return { limit: Math.max(1, Math.floor(baseLimit / divisor)), windowSeconds: window };
  } catch {
    return { limit: baseLimit, windowSeconds: window };
  }
}

/**
 * Bumps the progressive throttle tier after a call-initiate 429.
 */
export async function escalateCallInitiateThrottle(identityId: string): Promise<void> {
  if (!isRedisConnected()) return;
  try {
    const redis = getRedis();
    const key = RedisKeys.callInitiateThrottleTier(identityId);
    const current = parseInt((await redis.get(key)) ?? '0', 10) || 0;
    const next = Math.min(current + 1, CALL_INITIATE_MAX_THROTTLE_TIER);
    await redis.set(key, String(next), 'EX', config.rateLimit.callsInitiateThrottleCooldown);
  } catch {
    // Non-critical — fail silently
  }
}

/**
 * Resets the rate limit counter for an action/identifier pair
 *
 * Deletes all entries in the sliding window, effectively resetting
 * the counter to zero. Use for testing or administrative actions.
 *
 * @param action - The rate limit action
 * @param identifier - The identifier to reset
 *
 * @example
 * ```typescript
 * // Reset rate limit after admin verification
 * await resetRateLimit('auth:request:identifier', hashedEmail);
 * ```
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
