/**
 * Subscription enforcement middleware.
 *
 * Denies access to protected routes when the user's account lacks an active
 * subscription. Identity sessions are NOT checked here -- their subscription
 * enforcement is handled via encrypted grants on the session (see
 * subscription-grants.ts).
 *
 * On success, attaches `ctx.accountUser` and `ctx.resolvedAccess` so
 * downstream route handlers can reuse them without a duplicate Mongo fetch.
 *
 * @module middleware/require-subscription
 */

import { getSessionFromRequest, type AccountSessionData } from '../services/session.service';
import { getUserRepository } from '../repositories/user.repository';
import type { UserDocument, UserBilling } from '../models/user';
import type { ResolvedAccess } from '../services/billing/resolve-access';
import { resolveEffectiveAccess } from '../services/billing/resolve-access';
import { error } from '../utils/response';
import elog from '../utils/adieuuLogger';
import { sanitizePathForLog } from '../utils/sanitize';
import { getClientIp } from '../routes/auth/controller';
import { hasPendingVpnAttestation } from '../services/compliance/compliance-enforcement.service';

/** How long (ms) a past_due status is tolerated before cutting access. */
export const PAST_DUE_GRACE_MS = 48 * 60 * 60 * 1000; // 48 hours

/** Billing statuses that immediately deny access. */
const DENIED_STATUSES: ReadonlySet<string> = new Set([
  'canceled',
  'unpaid',
  'incomplete_expired',
]);

/**
 * Route path prefixes that do NOT require an active subscription.
 * Matched against the pathname portion of the URL.
 */
const EXEMPT_PREFIXES: readonly string[] = [
  '/api/auth',
  '/api/health',
  '/api/webhooks',
  '/api/account/subscription',
  '/api/sponsorship',
  '/api/v1/releases',
  '/api/users/me',
  '/api/geo/requirements',
  '/api/age-verification',
  '/api/compliance',
];

function isExemptPath(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Evaluates whether the resolved access (billing + overrides) permits access.
 *
 * Returns `null` when access is allowed, or a response-ready error code string
 * when access should be denied.
 *
 * When overrides alone provide subscriptions the user is granted access
 * regardless of Stripe `billing.status`.
 */
export function evaluateBillingAccess(
  resolved: ResolvedAccess,
  billing: UserBilling | undefined,
): 'SUBSCRIPTION_REQUIRED' | 'SUBSCRIPTION_EXPIRED' | null {
  if (resolved.isLifetime) return null;

  if (resolved.subscriptions.length === 0) {
    return 'SUBSCRIPTION_REQUIRED';
  }

  if (!billing) return null;

  if (billing.status && DENIED_STATUSES.has(billing.status)) {
    const hasOverrideSubs = resolved.subscriptions.length > (billing.activeSubscriptions?.length ?? 0);
    if (!hasOverrideSubs) return 'SUBSCRIPTION_EXPIRED';
  }

  if (billing.status === 'past_due') {
    const elapsed = Date.now() - billing.updatedAt.getTime();
    if (elapsed > PAST_DUE_GRACE_MS) {
      const hasOverrideSubs = resolved.subscriptions.length > (billing.activeSubscriptions?.length ?? 0);
      if (!hasOverrideSubs) return 'SUBSCRIPTION_EXPIRED';
    }
  }

  return null;
}

/**
 * Middleware that enforces an active subscription on account-session routes.
 *
 * Exempt paths (auth, subscription management, webhooks, health) are
 * passed through without checking. Identity sessions are also passed
 * through -- their access is governed by encrypted grants elsewhere.
 *
 * On success, populates `ctx.accountUser` and `ctx.resolvedAccess`.
 */
export function requireActiveSubscription() {
  return async (
    ctx: { request: Request; url: URL; accountUser?: UserDocument; resolvedAccess?: ResolvedAccess },
    next: () => Promise<Response>,
  ): Promise<Response> => {
    if (isExemptPath(ctx.url.pathname)) {
      return next();
    }

    const session = await getSessionFromRequest(ctx.request);

    if (!session || session.type !== 'account') {
      return next();
    }

    const accountSession = session as AccountSessionData;

    const userRepo = getUserRepository();
    const user = await userRepo.findById(accountSession.userId);
    if (!user) {
      return next();
    }

    // Account-level ban/suspension enforcement
    if (user.isBanned) {
      return error('ACCOUNT_BANNED', 'This account has been permanently banned.', 403);
    }
    if (user.suspendedUntil && user.suspendedUntil > new Date()) {
      return error('ACCOUNT_SUSPENDED', 'This account is currently suspended.', 403);
    }

    const clientIp = getClientIp(ctx.request);
    if (hasPendingVpnAttestation(user, clientIp)) {
      return error(
        'COMPLIANCE_ATTESTATION_REQUIRED',
        'VPN attestation is required before continuing.',
        403,
      );
    }

    const resolved = resolveEffectiveAccess(user);
    ctx.accountUser = user;
    ctx.resolvedAccess = resolved;

    const denial = evaluateBillingAccess(resolved, user.billing);
    if (denial) {
      elog.info('Subscription guard denied access', {
        userId: accountSession.userId,
        code: denial,
        billingStatus: user.billing?.status,
        method: ctx.request.method,
        route: sanitizePathForLog(ctx.url.pathname),
      });

      const message = denial === 'SUBSCRIPTION_REQUIRED'
        ? 'An active subscription is required to access this feature.'
        : 'Your subscription has expired. Please renew to continue.';

      return error(denial, message, 403);
    }

    return next();
  };
}
