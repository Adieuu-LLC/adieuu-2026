/**
 * Resolves the effective request body size limit for a single request.
 *
 * - Authenticated (`adieuu_session` resolves in Redis/Mongo) uses the same cap
 *   as the ALB WAF / `MAX_REQUEST_BODY_BYTES`.
 * - Unauthenticated use a much smaller default to reduce per-request work from abuse.
 * - Specific paths (e.g. signed Stripe webhooks) use the full cap without a session.
 *
 * @module router/resolve-body-limit
 */

import { getSessionFromRequest } from '../services/session.service';

const METHODS_WITH_BODY: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Unauthenticated body limit uses the same cap as the known Stripe webhook route
 * (raw JSON must be verified with `Stripe-Signature`).
 */
export const STRIPE_WEBHOOK_PATH = '/api/webhooks/stripe';

export function pathAllowsFullBodyWithoutSession(pathname: string): boolean {
  return pathname === STRIPE_WEBHOOK_PATH;
}

/**
 * @param pathname - `URL.pathname` (e.g. `/api/identity/...`)
 * @param method - HTTP method in uppercase
 */
export async function resolveRequestBodyByteLimit(
  request: Request,
  pathname: string,
  method: string,
  limits: { authenticated: number; anonymous: number },
): Promise<number> {
  if (!METHODS_WITH_BODY.has(method)) {
    return limits.authenticated;
  }

  if (pathAllowsFullBodyWithoutSession(pathname)) {
    return limits.authenticated;
  }

  const session = await getSessionFromRequest(request);
  if (session) {
    return limits.authenticated;
  }

  return limits.anonymous;
}
