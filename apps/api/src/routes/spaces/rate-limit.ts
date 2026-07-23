/**
 * Per-endpoint rate limits for Space routes.
 *
 * Every Space endpoint is metered per identity on top of the global
 * per-IP/per-user limiter. Actions group endpoints by abuse profile:
 * creation is tight, messaging/reactions allow conversational bursts, and
 * reads are generous.
 *
 * Unauthenticated requests are not metered here — the controllers reject
 * them with 401 before doing any work, and the global IP limiter still
 * applies.
 *
 * @module routes/spaces/rate-limit
 */

import type { RouteHandler } from '../../router/types';
import { checkRateLimit, type RateLimitConfig } from '../../services/rate-limit.service';
import { rateLimitedResponse } from '../../middleware/rate-limit';

export const SPACE_RATE_LIMITS = {
  /** Space creation — expensive (seeds roles/channels) and spam-prone. */
  'spaces:create': { limit: 5, windowSeconds: 3600 },
  /** Join/leave/invite responses — membership churn. */
  'spaces:join': { limit: 20, windowSeconds: 600 },
  /** Invite creation — notification spam vector. */
  'spaces:invite': { limit: 30, windowSeconds: 3600 },
  /** Message send/edit/delete. */
  'spaces:message': { limit: 30, windowSeconds: 60 },
  /** Reaction add/remove. */
  'spaces:reaction': { limit: 60, windowSeconds: 60 },
  /** Voice join/leave/media state. */
  'spaces:voice': { limit: 60, windowSeconds: 60 },
  /** Other mutations (roles, channels, categories, members, pins, ...). */
  'spaces:write': { limit: 45, windowSeconds: 60 },
  /** Read endpoints. */
  'spaces:read': { limit: 240, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitConfig>;

export type SpaceRateLimitAction = keyof typeof SPACE_RATE_LIMITS;

/**
 * Wraps a Space route handler with a per-identity sliding-window limit.
 */
export function withSpaceRateLimit(
  action: SpaceRateLimitAction,
  handler: RouteHandler,
): RouteHandler {
  return async (ctx) => {
    const identityId = ctx.identitySession?.identity._id.toHexString();
    if (identityId) {
      const result = await checkRateLimit(action, identityId, SPACE_RATE_LIMITS[action]);
      if (!result.allowed) return rateLimitedResponse(ctx, result);
    }
    return handler(ctx);
  };
}
