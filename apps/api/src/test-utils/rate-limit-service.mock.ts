/**
 * Full export surface for `rate-limit.service` test mocks.
 *
 * Partial mocks (e.g. only `checkRateLimit`) poison later test files that import
 * `resetRateLimit` or other exports from the real module in the same Bun process.
 */

import { mock } from 'bun:test';
import type { RateLimitConfig } from '../services/rate-limit.service';

const DEFAULT_ALLOWED = {
  allowed: true,
  remaining: 10,
  resetAt: Math.ceil(Date.now() / 1000) + 900,
  limit: 10,
};

/** Minimal stub — tests that need real limits should import from the service in isolation. */
const RATE_LIMITS_STUB = {
  'auth:request:identifier': { limit: 3, windowSeconds: 900 },
  'auth:request:ip': { limit: 10, windowSeconds: 900 },
  'auth:verify:identifier': { limit: 5, windowSeconds: 900 },
  'auth:verify:ip': { limit: 20, windowSeconds: 900 },
  'global:user': { limit: 100, windowSeconds: 60 },
  'global:ip': { limit: 1000, windowSeconds: 60 },
  'user:email:ip': { limit: 10, windowSeconds: 900 },
  'user:email:identifier': { limit: 3, windowSeconds: 900 },
  'user:phone:ip': { limit: 10, windowSeconds: 900 },
  'user:phone:identifier': { limit: 3, windowSeconds: 900 },
} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitServiceMockOverrides = {
  RATE_LIMITS?: typeof RATE_LIMITS_STUB;
  checkRateLimit?: ReturnType<typeof mock>;
  getRateLimitStatus?: ReturnType<typeof mock>;
  resetRateLimit?: ReturnType<typeof mock>;
  getKlipySearchConfig?: ReturnType<typeof mock>;
  escalateKlipyThrottle?: ReturnType<typeof mock>;
};

export function createRateLimitServiceMock(overrides: RateLimitServiceMockOverrides = {}) {
  return {
    RATE_LIMITS: overrides.RATE_LIMITS ?? RATE_LIMITS_STUB,
    checkRateLimit:
      overrides.checkRateLimit ?? mock(() => Promise.resolve({ ...DEFAULT_ALLOWED })),
    getRateLimitStatus:
      overrides.getRateLimitStatus ??
      mock(() => Promise.resolve({ count: 0, remaining: 10, limit: 10 })),
    resetRateLimit: overrides.resetRateLimit ?? mock(() => Promise.resolve()),
    getKlipySearchConfig:
      overrides.getKlipySearchConfig ??
      mock(() => Promise.resolve({ limit: 30, windowSeconds: 60 })),
    escalateKlipyThrottle: overrides.escalateKlipyThrottle ?? mock(() => Promise.resolve()),
  };
}
