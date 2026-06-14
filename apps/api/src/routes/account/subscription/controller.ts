/**
 * Account subscription controller — status, checkout, and billing portal.
 *
 * @module routes/account/subscription/controller
 */

import Stripe from 'stripe';
import { ObjectId } from 'mongodb';
import { getUserRepository } from '../../../repositories/user.repository';
import {
  getPromoCodeRepository,
  getPromoRedemptionRepository,
} from '../../../repositories/promo-code.repository';
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
import { resolveSubscriptionPlanDisplay, type SubscriptionPlanBadge } from '../../../services/billing/subscription-plan-display';
import {
  getCachedSubscriptionCatalogPrices,
  type SubscriptionCatalogPricesPayload,
} from '../../../services/billing/subscription-catalog-prices.service';
import { checkRateLimit, type RateLimitConfig } from '../../../services/rate-limit.service';
import { sanitizeString } from '../../../utils/sanitize';
import elog from '../../../utils/adieuuLogger';
import type { UserBilling } from '../../../models/user';
import type { UserDocument } from '../../../models/user';

/** Stripe checkout session creation — generous window so retries, double-clicks, and config mistakes do not quickly lock users out. */
const CHECKOUT_RATE_LIMIT: RateLimitConfig = { limit: 30, windowSeconds: 3600 };
/** Billing portal sessions — same idea; users may open/close portal several times while sorting payment methods. */
const PORTAL_RATE_LIMIT: RateLimitConfig = { limit: 45, windowSeconds: 3600 };
/** Public catalog prices — bounded per IP to limit Stripe reads while cache warms. */
const CATALOG_PRICES_RATE_LIMIT: RateLimitConfig = { limit: 120, windowSeconds: 3600 };
/** Billing details — Stripe invoice/payment method reads per authenticated user. */
const BILLING_DETAILS_RATE_LIMIT: RateLimitConfig = { limit: 60, windowSeconds: 3600 };

/** Public payload for GET subscription status. */
export interface SubscriptionSummaryPayload {
  activeSubscriptions: SubscriptionTierId[];
  entitlements: string[];
  isLifetime: boolean;
  planBadge: SubscriptionPlanBadge;
  planExpiresAt: string | null;
  status: UserBilling['status'] | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  hasStripeCustomer: boolean;
  sponsoredExpiry: string | null;
}

export function buildSubscriptionSummaryFromUser(user: UserDocument): SubscriptionSummaryPayload {
  const resolved = resolveEffectiveAccess(user);
  const plan = resolveSubscriptionPlanDisplay(user);

  const hasGifted = resolved.entitlements.includes('gifted');
  let sponsoredExpiry: string | null = null;
  if (hasGifted && user.subscriptionOverrides?.length) {
    const now = new Date();
    const activeOverrides = user.subscriptionOverrides
      .filter((o) => o.expiresAt && o.expiresAt > now)
      .sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime());
    if (activeOverrides.length > 0) {
      sponsoredExpiry = activeOverrides[0]!.expiresAt!.toISOString();
    }
  }

  return {
    activeSubscriptions: resolved.subscriptions,
    entitlements: resolved.entitlements,
    isLifetime: plan.isLifetime,
    planBadge: plan.planBadge,
    planExpiresAt: plan.planExpiresAt?.toISOString() ?? null,
    status: user.billing?.status ?? null,
    currentPeriodEnd: user.billing?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: user.billing?.cancelAtPeriodEnd ?? false,
    cancelAt: user.billing?.cancelAt?.toISOString() ?? null,
    hasStripeCustomer: !!user.stripeCustomerId,
    sponsoredExpiry,
  };
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

  return {
    ok: true,
    data: buildSubscriptionSummaryFromUser(user),
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

// ---------------------------------------------------------------------------
// Billing details (invoices, payment method, promo history, renewal)
// ---------------------------------------------------------------------------

export interface BillingInvoiceEntry {
  id: string;
  number: string | null;
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  created: string;
  periodStart: string;
  periodEnd: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

export interface BillingPaymentMethod {
  type: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface BillingPromoRedemptionEntry {
  shortcode: string;
  description: string | null;
  redeemedAt: string;
  subscriptionOverride: { tier: string; expiresAt: string } | null;
  entitlements: string[];
}

export interface BillingRenewalInfo {
  status: UserBilling['status'] | null;
  isLifetime: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  autoRenew: boolean;
}

export interface BillingDetailsPayload {
  invoices: BillingInvoiceEntry[];
  paymentMethod: BillingPaymentMethod | null;
  promoRedemptions: BillingPromoRedemptionEntry[];
  renewal: BillingRenewalInfo;
}

export type GetBillingDetailsResult =
  | { ok: true; data: BillingDetailsPayload }
  | {
      ok: false;
      reason: 'stripe_disabled' | 'rate_limited' | 'user_not_found' | 'internal';
    };

function mapStripeInvoice(invoice: Stripe.Invoice): BillingInvoiceEntry {
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status ?? 'unknown',
    amountDue: invoice.amount_due,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    created: new Date(invoice.created * 1000).toISOString(),
    periodStart: new Date(invoice.period_start * 1000).toISOString(),
    periodEnd: new Date(invoice.period_end * 1000).toISOString(),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdf: invoice.invoice_pdf ?? null,
  };
}

function mapStripePaymentMethod(
  paymentMethod: Stripe.PaymentMethod | null | undefined,
): BillingPaymentMethod | null {
  if (!paymentMethod || paymentMethod.type !== 'card' || !paymentMethod.card) {
    return null;
  }

  return {
    type: paymentMethod.type,
    brand: paymentMethod.card.brand,
    last4: paymentMethod.card.last4,
    expMonth: paymentMethod.card.exp_month,
    expYear: paymentMethod.card.exp_year,
  };
}

function buildRenewalInfo(user: UserDocument): BillingRenewalInfo {
  const plan = resolveSubscriptionPlanDisplay(user);
  const billing = user.billing;
  const status = billing?.status ?? null;
  const cancelAtPeriodEnd = billing?.cancelAtPeriodEnd ?? false;
  const isLifetime = plan.isLifetime;
  const autoRenew =
    !isLifetime &&
    (status === 'active' || status === 'trialing') &&
    !cancelAtPeriodEnd &&
    !billing?.cancelAt;

  return {
    status,
    isLifetime,
    currentPeriodEnd: billing?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd,
    cancelAt: billing?.cancelAt?.toISOString() ?? null,
    autoRenew,
  };
}

async function fetchStripeInvoices(customerId: string): Promise<BillingInvoiceEntry[]> {
  const stripe = getStripe();
  try {
    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 24,
    });
    return invoices.data.map(mapStripeInvoice);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError) {
      return [];
    }
    throw err;
  }
}

async function fetchStripePaymentMethod(customerId: string): Promise<BillingPaymentMethod | null> {
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ['invoice_settings.default_payment_method'],
  });

  if (customer.deleted) {
    return null;
  }

  const defaultPm = customer.invoice_settings?.default_payment_method;
  if (!defaultPm) {
    return null;
  }

  let paymentMethod: Stripe.PaymentMethod;
  if (typeof defaultPm === 'string') {
    try {
      paymentMethod = await stripe.paymentMethods.retrieve(defaultPm);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeInvalidRequestError) {
        return null;
      }
      throw err;
    }
  } else {
    paymentMethod = defaultPm;
  }

  return mapStripePaymentMethod(paymentMethod);
}

async function fetchPromoRedemptions(userId: ObjectId): Promise<BillingPromoRedemptionEntry[]> {
  const redemptionRepo = getPromoRedemptionRepository();
  const promoRepo = getPromoCodeRepository();
  const redemptions = await redemptionRepo.findAllByUser(userId);

  const descriptions = new Map<string, string | null>();
  await Promise.all(
    redemptions.map(async (redemption) => {
      if (descriptions.has(redemption.shortcode)) return;
      const promo = await promoRepo.findByShortcode(redemption.shortcode);
      descriptions.set(redemption.shortcode, promo?.description ?? null);
    }),
  );

  return redemptions.map((redemption) => ({
    shortcode: redemption.shortcode,
    description: descriptions.get(redemption.shortcode) ?? null,
    redeemedAt: redemption.redeemedAt.toISOString(),
    subscriptionOverride: redemption.subscriptionOverrideApplied
      ? {
          tier: redemption.subscriptionOverrideApplied.tier,
          expiresAt: redemption.subscriptionOverrideApplied.expiresAt.toISOString(),
        }
      : null,
    entitlements: redemption.entitlementsApplied ?? [],
  }));
}

/**
 * Loads invoice history, payment method, promo redemptions, and renewal info.
 */
export async function getBillingDetails(userId: string): Promise<GetBillingDetailsResult> {
  if (!config.stripe.enabled) {
    return { ok: false, reason: 'stripe_disabled' };
  }

  const rl = await checkRateLimit('subscription:billing-details', userId, BILLING_DETAILS_RATE_LIMIT);
  if (!rl.allowed) return { ok: false, reason: 'rate_limited' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };

  try {
    const [invoices, paymentMethod, promoRedemptions] = await Promise.all([
      user.stripeCustomerId
        ? fetchStripeInvoices(user.stripeCustomerId)
        : Promise.resolve([]),
      user.stripeCustomerId
        ? fetchStripePaymentMethod(user.stripeCustomerId)
        : Promise.resolve(null),
      fetchPromoRedemptions(user._id),
    ]);

    elog.debug('Billing details requested', {
      userId,
      invoiceCount: invoices.length,
      hasPaymentMethod: paymentMethod != null,
      promoRedemptionCount: promoRedemptions.length,
    });

    return {
      ok: true,
      data: {
        invoices,
        paymentMethod,
        promoRedemptions,
        renewal: buildRenewalInfo(user),
      },
    };
  } catch (err) {
    elog.error(
      'Billing details failed',
      {
        userId,
        ...billingErrorLogFields(err),
      },
      err instanceof Error ? err : undefined,
    );
    return { ok: false, reason: 'internal' };
  }
}
