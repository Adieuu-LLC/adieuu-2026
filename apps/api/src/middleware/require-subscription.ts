/**
 * Subscription enforcement middleware.
 *
 * Denies access to protected routes when the user's account lacks an active
 * subscription. Identity sessions are NOT checked here -- their subscription
 * enforcement is handled via encrypted grants on the session (see
 * subscription-grants.ts).
 *
 * @module middleware/require-subscription
 */

import { getSessionFromRequest, type AccountSessionData } from '../services/session.service';
import { getUserRepository } from '../repositories/user.repository';
import type { UserBilling } from '../models/user';
import { error } from '../utils/response';
import elog from '../utils/adieuuLogger';

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
  '/api/releases',
];

function isExemptPath(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Evaluates whether billing state permits access.
 *
 * Returns `null` when access is allowed, or a response-ready error code string
 * when access should be denied.
 */
export function evaluateBillingAccess(billing: UserBilling | undefined): 'SUBSCRIPTION_REQUIRED' | 'SUBSCRIPTION_EXPIRED' | null {
  if (!billing || billing.activeSubscriptions.length === 0) {
    return 'SUBSCRIPTION_REQUIRED';
  }

  if (billing.status && DENIED_STATUSES.has(billing.status)) {
    return 'SUBSCRIPTION_EXPIRED';
  }

  if (billing.status === 'past_due') {
    const elapsed = Date.now() - billing.updatedAt.getTime();
    if (elapsed > PAST_DUE_GRACE_MS) {
      return 'SUBSCRIPTION_EXPIRED';
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
 */
export function requireActiveSubscription() {
  return async (
    ctx: { request: Request; url: URL },
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

    const denial = evaluateBillingAccess(user.billing);
    if (denial) {
      elog.info('Subscription guard denied access', {
        userId: accountSession.userId,
        code: denial,
        billingStatus: user.billing?.status,
      });

      const message = denial === 'SUBSCRIPTION_REQUIRED'
        ? 'An active subscription is required to access this feature.'
        : 'Your subscription has expired. Please renew to continue.';

      return error(denial, message, 403);
    }

    return next();
  };
}
