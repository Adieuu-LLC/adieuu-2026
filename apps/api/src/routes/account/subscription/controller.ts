/**
 * Account subscription controller — status, checkout, and billing portal.
 *
 * @module routes/account/subscription/controller
 */

import Stripe from 'stripe';
import { getUserRepository } from '../../../repositories/user.repository';
import { config } from '../../../config';
import { PURCHASABLE_PRODUCT_IDS, type PurchasableProductId, type SubscriptionTierId } from '@adieuu/shared';
import { getStripe } from '../../../services/billing/stripe.client';
import {
  BillingConfigurationError,
  billingErrorLogFields,
  createCheckoutSessionForProduct,
  createBillingPortalSession,
  reconcileBillingFromCustomer,
} from '../../../services/billing/billing.service';
import { resolveEffectiveAccess } from '../../../services/billing/resolve-access';
import {
  getCachedSubscriptionCatalogPrices,
  type SubscriptionCatalogPricesPayload,
} from '../../../services/billing/subscription-catalog-prices.service';
import { checkRateLimit, type RateLimitConfig } from '../../../services/rate-limit.service';
import { sanitizeString } from '../../../utils/sanitize';
import elog from '../../../utils/adieuuLogger';
import type { UserBilling } from '../../../models/user';

/** Stripe checkout session creation — generous window so retries, double-clicks, and config mistakes do not quickly lock users out. */
const CHECKOUT_RATE_LIMIT: RateLimitConfig = { limit: 30, windowSeconds: 3600 };
/** Billing portal sessions — same idea; users may open/close portal several times while sorting payment methods. */
const PORTAL_RATE_LIMIT: RateLimitConfig = { limit: 45, windowSeconds: 3600 };
/** Public catalog prices — bounded per IP to limit Stripe reads while cache warms. */
const CATALOG_PRICES_RATE_LIMIT: RateLimitConfig = { limit: 120, windowSeconds: 3600 };

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

export type GetSubscriptionCatalogPricesResult =
  | { ok: true; data: SubscriptionCatalogPricesPayload }
  | { ok: false; reason: 'stripe_disabled' | 'rate_limited' | 'internal' };

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
 * Stripe USD list prices for comparison UI (cached server-side). No authentication required.
 */
export async function getSubscriptionCatalogPrices(
  clientIp: string,
): Promise<GetSubscriptionCatalogPricesResult> {
  if (!config.stripe.enabled) {
    return { ok: false, reason: 'stripe_disabled' };
  }

  const rl = await checkRateLimit('subscription:catalog-prices', clientIp, CATALOG_PRICES_RATE_LIMIT);
  if (!rl.allowed) return { ok: false, reason: 'rate_limited' };

  try {
    const data = await getCachedSubscriptionCatalogPrices();
    return { ok: true, data };
  } catch (err) {
    elog.error(
      'Subscription catalog prices failed',
      billingErrorLogFields(err),
      err instanceof Error ? err : undefined,
    );
    return { ok: false, reason: 'internal' };
  }
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

// ---------------------------------------------------------------------------
// Checkout session confirmation (public, no auth required)
// ---------------------------------------------------------------------------

/** Rate limit for the public confirm endpoint — IP-based. */
const CONFIRM_RATE_LIMIT: RateLimitConfig = { limit: 10, windowSeconds: 60 };

export type ConfirmCheckoutResult =
  | { ok: true; confirmed: boolean }
  | {
      ok: false;
      reason:
        | 'stripe_disabled'
        | 'rate_limited'
        | 'validation'
        | 'session_not_found'
        | 'payment_incomplete'
        | 'user_not_found'
        | 'internal';
    };

/**
 * Confirms a Stripe checkout session and reconciles the user's billing state.
 *
 * This endpoint is public — the session_id itself is the proof of authenticity
 * (retrieved server-side from Stripe's API). The customer on the Stripe session
 * determines which user gets updated.
 */
export async function confirmCheckoutSession(
  sessionId: string,
  clientIp: string,
): Promise<ConfirmCheckoutResult> {
  if (!config.stripe.enabled) {
    return { ok: false, reason: 'stripe_disabled' };
  }

  const rl = await checkRateLimit(`subscription:confirm:${clientIp}`, clientIp, CONFIRM_RATE_LIMIT);
  if (!rl.allowed) return { ok: false, reason: 'rate_limited' };

  if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
    return { ok: false, reason: 'validation' };
  }

  const stripe = getStripe();

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError) {
      return { ok: false, reason: 'session_not_found' };
    }
    elog.error('Failed to retrieve checkout session from Stripe', {
      sessionId,
      ...billingErrorLogFields(err),
    });
    return { ok: false, reason: 'internal' };
  }

  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    return { ok: false, reason: 'payment_incomplete' };
  }

  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id;

  if (!customerId) {
    elog.warn('Checkout session has no customer', { sessionId });
    return { ok: false, reason: 'session_not_found' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findByStripeCustomerId(customerId);
  if (!user) {
    elog.warn('No user found for Stripe customer from confirm', { customerId, sessionId });
    return { ok: false, reason: 'user_not_found' };
  }

  try {
    const billing = await reconcileBillingFromCustomer(stripe, user);
    if (billing) {
      await userRepo.updateBilling(user._id, billing);
      elog.info('Billing reconciled from checkout confirm', {
        userId: user._id.toHexString(),
        customerId,
        tiers: billing.activeSubscriptions,
      });
    }
    return { ok: true, confirmed: true };
  } catch (err) {
    elog.error('Billing reconciliation failed during checkout confirm', {
      userId: user._id.toHexString(),
      customerId,
      ...billingErrorLogFields(err),
    });
    return { ok: false, reason: 'internal' };
  }
}
