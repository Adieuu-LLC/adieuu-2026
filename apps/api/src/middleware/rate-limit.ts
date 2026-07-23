/**
 * Global request rate limiting middleware.
 *
 * Applies the configured `global:ip` limit to every request and the
 * `global:user` limit to authenticated identity/account sessions. Health
 * endpoints are exempt so load-balancer probes are never throttled.
 *
 * Register after `enrichIdentitySession` so the per-user limit can key on
 * the resolved identity.
 *
 * @module middleware/rate-limit
 */

import type { Middleware, RouteContext } from '../router/types';
import { checkRateLimit, type RateLimitResult } from '../services/rate-limit.service';
import { getClientIp } from '../routes/auth/controller';
import { hashIp } from '../utils/crypto';

/** Paths never throttled (LB health probes must always succeed). */
const EXEMPT_PATH_PREFIXES: readonly string[] = ['/api/health'];

/**
 * Builds a 429 response from a rate-limit result, with standard
 * `Retry-After` / `X-RateLimit-*` headers.
 */
export function rateLimitedResponse(ctx: RouteContext, result: RateLimitResult): Response {
  const base = ctx.errors.rateLimited();
  const headers = new Headers(base.headers);
  headers.set('Retry-After', String(Math.max(0, result.resetAt - Math.floor(Date.now() / 1000))));
  headers.set('X-RateLimit-Limit', String(result.limit));
  headers.set('X-RateLimit-Remaining', '0');
  headers.set('X-RateLimit-Reset', String(result.resetAt));
  return new Response(base.body, { status: base.status, headers });
}

/**
 * Global sliding-window limiter: `global:ip` for every caller plus
 * `global:user` for authenticated sessions.
 */
export function globalRateLimit(): Middleware {
  return async (ctx, next) => {
    const path = ctx.url.pathname;
    if (EXEMPT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return next();
    }

    const ipResult = await checkRateLimit('global:ip', hashIp(getClientIp(ctx.request)));
    if (!ipResult.allowed) return rateLimitedResponse(ctx, ipResult);

    const userId =
      ctx.identitySession?.identity._id.toHexString() ?? ctx.accountUser?._id.toHexString();
    if (userId) {
      const userResult = await checkRateLimit('global:user', userId);
      if (!userResult.allowed) return rateLimitedResponse(ctx, userResult);
    }

    return next();
  };
}
