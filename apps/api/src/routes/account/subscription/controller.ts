/**
 * Account subscription controller — status, checkout, and billing portal.
 *
 * @module routes/account/subscription/controller
 */

import { getUserRepository } from '../../../repositories/user.repository';
import { config } from '../../../config';
import { PURCHASABLE_PRODUCT_IDS, type PurchasableProductId, type SubscriptionTierId } from '@adieuu/shared';
import {
  BillingConfigurationError,
  billingErrorLogFields,
  createCheckoutSessionForProduct,
  createBillingPortalSession,
} from '../../../services/billing/billing.service';
import { resolveEffectiveAccess } from '../../../services/billing/resolve-access';
import { checkRateLimit, type RateLimitConfig } from '../../../services/rate-limit.service';
import { sanitizeString } from '../../../utils/sanitize';
import elog from '../../../utils/adieuuLogger';
import type { UserBilling } from '../../../models/user';

/** Stripe checkout session creation — generous window so retries, double-clicks, and config mistakes do not quickly lock users out. */
const CHECKOUT_RATE_LIMIT: RateLimitConfig = { limit: 30, windowSeconds: 3600 };
/** Billing portal sessions — same idea; users may open/close portal several times while sorting payment methods. */
const PORTAL_RATE_LIMIT: RateLimitConfig = { limit: 45, windowSeconds: 3600 };

/** Public payload for GET subscription status. */
export interface SubscriptionSummaryPayload {
  activeSubscriptions: SubscriptionTierId[];
  entitlements: string[];
  isLifetime: boolean;
  status: UserBilling['status'] | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  hasStripeCustomer: boolean;
}

export type GetSubscriptionSummaryResult =
  | { ok: true; data: SubscriptionSummaryPayload }
  | { ok: false; reason: 'stripe_disabled' | 'user_not_found' };

export type CreateSubscriptionCheckoutResult =
  | { ok: true; url: string }
  | {
      ok: false;
      reason:
        | 'stripe_disabled'
        | 'rate_limited'
        | 'validation'
        | 'user_not_found'
        | 'billing_config'
        | 'internal';
    };

export type CreateSubscriptionPortalResult =
  | { ok: true; data: { url: string } }
  | {
      ok: false;
      reason:
        | 'stripe_disabled'
        | 'rate_limited'
        | 'user_not_found'
        | 'no_stripe_customer'
        | 'internal';
    };

/**
 * Loads billing summary for an authenticated account user (session already verified by route).
 */
export async function getSubscriptionSummary(userId: string): Promise<GetSubscriptionSummaryResult> {
  if (!config.stripe.enabled) {
    return { ok: false, reason: 'stripe_disabled' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };

  elog.debug('Subscription status requested', { userId });

  const resolved = resolveEffectiveAccess(user);

  return {
    ok: true,
    data: {
      activeSubscriptions: resolved.subscriptions,
      entitlements: resolved.entitlements,
      isLifetime: resolved.isLifetime,
      status: user.billing?.status ?? null,
      currentPeriodEnd: user.billing?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: user.billing?.cancelAtPeriodEnd ?? false,
      cancelAt: user.billing?.cancelAt?.toISOString() ?? null,
      hasStripeCustomer: !!user.stripeCustomerId,
    },
  };
}

/**
 * Creates a Stripe Checkout session for a purchasable product id.
 */
export async function createSubscriptionCheckout(
  userId: string,
  rawProduct: unknown,
): Promise<CreateSubscriptionCheckoutResult> {
  if (!config.stripe.enabled) {
    return { ok: false, reason: 'stripe_disabled' };
  }

  const rl = await checkRateLimit('subscription:checkout', userId, CHECKOUT_RATE_LIMIT);
  if (!rl.allowed) return { ok: false, reason: 'rate_limited' };

  const product =
    typeof rawProduct === 'string' ? sanitizeString(rawProduct, 'alphanumdash').value : '';

  if (!product || !PURCHASABLE_PRODUCT_IDS.includes(product as PurchasableProductId)) {
    return { ok: false, reason: 'validation' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };

  try {
    const result = await createCheckoutSessionForProduct(user, product as PurchasableProductId);
    elog.info('Subscription checkout session created', {
      userId,
      product,
      sessionId: result.sessionId,
    });
    return { ok: true, url: result.url };
  } catch (err) {
    if (err instanceof BillingConfigurationError) {
      elog.error(
        'Subscription checkout: billing not fully configured',
        {
          userId,
          product,
          ...billingErrorLogFields(err),
        },
      );
      return { ok: false, reason: 'billing_config' };
    }
    elog.error(
      'Subscription checkout failed',
      {
        userId,
        product,
        ...billingErrorLogFields(err),
      },
      err instanceof Error ? err : undefined,
    );
    return { ok: false, reason: 'internal' };
  }
}

/**
 * Creates a Stripe Customer Portal session.
 */
export async function createSubscriptionPortal(userId: string): Promise<CreateSubscriptionPortalResult> {
  if (!config.stripe.enabled) {
    return { ok: false, reason: 'stripe_disabled' };
  }

  const rl = await checkRateLimit('subscription:portal', userId, PORTAL_RATE_LIMIT);
  if (!rl.allowed) return { ok: false, reason: 'rate_limited' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };

  if (!user.stripeCustomerId) {
    return { ok: false, reason: 'no_stripe_customer' };
  }

  try {
    const result = await createBillingPortalSession(user);
    elog.info('Subscription billing portal session created', { userId });
    return { ok: true, data: result };
  } catch (err) {
    elog.error(
      'Subscription portal session failed',
      {
        userId,
        ...billingErrorLogFields(err),
      },
      err instanceof Error ? err : undefined,
    );
    return { ok: false, reason: 'internal' };
  }
}
