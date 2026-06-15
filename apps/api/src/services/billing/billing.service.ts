/**
 * Billing service — Stripe subscription and one-time purchase management.
 *
 * Provides checkout session creation, portal session creation,
 * customer management, and webhook event processing. Stripe is the
 * source of truth; this service keeps a denormalised summary on the
 * UserDocument so that login and JWT minting never need to call Stripe
 * synchronously.
 */

import Stripe from 'stripe';
import type { SubscriptionTierId, PurchasableProductId } from '@adieuu/shared';
import { getStripe } from './stripe.client';
import { config } from '../../config';
import {
  PURCHASABLE_PRODUCTS,
  type ProductMeta,
  type StripePriceConfigKey,
} from '../../constants/subscription-tiers';
import { getUserRepository } from '../../repositories/user.repository';
import { getCollection, Collections } from '../../db';
import type { UserDocument, UserBilling } from '../../models/user';
import elog from '../../utils/adieuuLogger';
import { initiateBackgroundCheck } from '../age-verification/background-check.service';
import { emitSubscriptionUpgradedEvent } from '../pending-account-event.service';

/** Thrown when Stripe is enabled but a required price id env var is missing (ops misconfiguration). */
export class BillingConfigurationError extends Error {
  constructor(
    message: string,
    public readonly productId?: PurchasableProductId,
  ) {
    super(message);
    this.name = 'BillingConfigurationError';
  }
}

/**
 * Structured fields for logging billing/Stripe failures (safe for log aggregation).
 */
export function billingErrorLogFields(err: unknown): Record<string, unknown> {
  if (err instanceof Stripe.errors.StripeError) {
    return {
      stripeType: err.type,
      stripeCode: err.code,
      stripeParam: err.param,
      stripeMessage: err.message,
      stripeStatusCode: err.statusCode,
    };
  }
  if (err instanceof Error) {
    return { errorName: err.name, errorMessage: err.message };
  }
  return { error: String(err) };
}

// ---------------------------------------------------------------------------
// Price <-> product mapping
// ---------------------------------------------------------------------------

function buildPriceToProductMap(): Map<string, ProductMeta> {
  const map = new Map<string, ProductMeta>();
  for (const meta of Object.values(PURCHASABLE_PRODUCTS)) {
    const priceId = config.stripe.prices[meta.priceConfigKey];
    if (priceId) {
      map.set(priceId, meta);
    }
  }
  return map;
}

let priceToProductCache: Map<string, ProductMeta> | null = null;

function getPriceToProductMap(): Map<string, ProductMeta> {
  if (!priceToProductCache) {
    priceToProductCache = buildPriceToProductMap();
  }
  return priceToProductCache;
}

/**
 * Maps Stripe Price IDs to the effective subscription tier ids they grant.
 * Exposed for tests and internal use.
 */
export function tierIdsForPriceIds(priceIds: string[]): SubscriptionTierId[] {
  const map = getPriceToProductMap();
  const tiers = new Set<SubscriptionTierId>();
  for (const pid of priceIds) {
    const meta = map.get(pid);
    if (meta) {
      for (const t of meta.grantsTiers) tiers.add(t);
    }
  }
  return [...tiers];
}

/**
 * Resolves entitlements from Stripe Price IDs.
 */
export function entitlementsForPriceIds(priceIds: string[]): string[] {
  const map = getPriceToProductMap();
  const ents = new Set<string>();
  for (const pid of priceIds) {
    const meta = map.get(pid);
    if (meta) {
      for (const e of meta.grantsEntitlements) ents.add(e);
    }
  }
  return [...ents];
}

/**
 * Returns whether any of the given price IDs map to a lifetime product.
 */
function isLifetimeForPriceIds(priceIds: string[]): boolean {
  const map = getPriceToProductMap();
  for (const pid of priceIds) {
    const meta = map.get(pid);
    if (meta?.isLifetime) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Customer management
// ---------------------------------------------------------------------------

export async function getOrCreateStripeCustomer(user: UserDocument): Promise<string> {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const userRepo = getUserRepository();
  const userId = user._id.toHexString();

  const freshUser = await userRepo.findById(userId);
  if (freshUser?.stripeCustomerId) {
    return freshUser.stripeCustomerId;
  }

  const stripe = getStripe();
  const email = user.emailVerified ? user.email : undefined;
  const idempotencyKey = `create_customer_${userId}`;
  const customer = await stripe.customers.create(
    {
      email,
      metadata: { userId },
    },
    { idempotencyKey },
  );

  const persisted = await userRepo.setStripeCustomerIdIfAbsent(user._id, customer.id);

  elog.info('Stripe customer created', {
    userId,
    customerId: customer.id,
    persisted,
  });

  if (persisted) {
    return customer.id;
  }

  const updated = await userRepo.findById(userId);
  return updated?.stripeCustomerId ?? customer.id;
}

// ---------------------------------------------------------------------------
// Checkout + Portal
// ---------------------------------------------------------------------------

export async function createCheckoutSessionForProduct(
  user: UserDocument,
  productId: PurchasableProductId,
): Promise<{ url: string; sessionId: string }> {
  const productMeta = PURCHASABLE_PRODUCTS[productId];
  if (!productMeta) {
    throw new Error(`Unknown product: ${productId}`);
  }

  const priceId = config.stripe.prices[productMeta.priceConfigKey];
  if (!priceId) {
    throw new BillingConfigurationError(
      `No Stripe price configured for product ${productId} (check env for ${productMeta.priceConfigKey})`,
      productId,
    );
  }

  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(user);

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: productMeta.checkoutMode,
    customer: customerId,
    client_reference_id: user._id.toHexString(),
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: config.stripe.successUrl,
    cancel_url: config.stripe.cancelUrl,
    metadata: { userId: user._id.toHexString(), productId },
  };

  if (productMeta.checkoutMode === 'subscription') {
    sessionParams.subscription_data = {
      metadata: { userId: user._id.toHexString(), productId },
    };
  }

  if (productMeta.checkoutMode === 'payment') {
    sessionParams.payment_intent_data = {
      metadata: { userId: user._id.toHexString(), productId },
    };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL');
  }

  return { url: session.url, sessionId: session.id };
}

export async function createBillingPortalSession(
  user: UserDocument,
): Promise<{ url: string }> {
  if (!user.stripeCustomerId) {
    throw new Error('User has no Stripe customer');
  }

  const stripe = getStripe();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: config.stripe.portalReturnUrl,
  });

  return { url: portalSession.url };
}

// ---------------------------------------------------------------------------
// Customer-based billing reconciliation
// ---------------------------------------------------------------------------

/**
 * Reconciles billing state by fetching the latest subscriptions directly from
 * Stripe for the given customer. This is the authoritative sync — it always
 * converges to whatever Stripe currently reports, making it safe to call
 * repeatedly (idempotent).
 *
 * Used by the checkout callback confirm endpoint and the session-load
 * reconciliation path.
 */
export async function reconcileBillingFromCustomer(
  stripe: Stripe,
  user: UserDocument,
): Promise<UserBilling | null> {
  if (!user.stripeCustomerId) return null;

  const [activeSubs, trialingSubs] = await Promise.all([
    stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'active', limit: 10 }),
    stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'trialing', limit: 10 }),
  ]);

  const allSubs = [...activeSubs.data, ...trialingSubs.data];

  if (allSubs.length > 0) {
    const primarySub = allSubs[0]!;
    return deriveSubscriptionBilling(stripe, primarySub.id, user.billing);
  }

  if (user.billing?.isLifetime) {
    return user.billing;
  }

  return {
    activeSubscriptions: [],
    entitlements: [],
    isLifetime: false,
    status: 'canceled',
    currentPeriodEnd: user.billing?.currentPeriodEnd,
    cancelAtPeriodEnd: false,
    cancelAt: undefined,
    stripeSubscriptionId: undefined,
    stripePaymentIntentId: user.billing?.stripePaymentIntentId,
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Webhook event processing
// ---------------------------------------------------------------------------

interface StripeProcessedEvent {
  eventId: string;
  processedAt: Date;
}

async function isEventAlreadyProcessed(eventId: string): Promise<boolean> {
  const col = getCollection<StripeProcessedEvent>(Collections.STRIPE_PROCESSED_EVENTS);
  const existing = await col.findOne({ eventId });
  return !!existing;
}

async function markEventProcessed(eventId: string): Promise<boolean> {
  const col = getCollection<StripeProcessedEvent>(Collections.STRIPE_PROCESSED_EVENTS);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await col.insertOne({ eventId, processedAt: new Date() } as any);
    return true;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      return false;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Stripe field extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the latest `current_period_end` across all subscription items.
 *
 * Since Stripe API `2025-03-31.basil`, `current_period_end` lives on each
 * SubscriptionItem rather than the top-level Subscription object. For
 * multi-item subscriptions we take the latest end date.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractItemPeriodEnd(sub: any, subscriptionId?: string): Date | undefined {
  const items = sub.items?.data;
  if (!Array.isArray(items) || items.length === 0) {
    elog.warn('Subscription has no items.data; cannot determine period end', {
      subscriptionId: subscriptionId ?? sub.id,
    });
    return undefined;
  }

  let latest: number | undefined;
  for (const item of items) {
    const raw = item.current_period_end;
    if (typeof raw === 'number') {
      if (latest === undefined || raw > latest) {
        latest = raw;
      }
    } else if (raw !== undefined && raw !== null) {
      elog.warn('Subscription item current_period_end is not a number', {
        subscriptionId: subscriptionId ?? sub.id,
        itemId: item.id,
        typeFound: typeof raw,
      });
    }
  }

  if (latest === undefined) {
    elog.warn('No valid current_period_end found on any subscription item', {
      subscriptionId: subscriptionId ?? sub.id,
      itemCount: items.length,
    });
    return undefined;
  }

  return new Date(latest * 1000);
}

/**
 * Extracts cancellation intent from a Stripe Subscription.
 *
 * Prefers the newer `cancel_at` (Unix timestamp or null) over the deprecated
 * `cancel_at_period_end` boolean. Returns both a precise `cancelAt` Date and
 * a backward-compatible `cancelAtPeriodEnd` boolean.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractCancelIntent(sub: any): {
  cancelAt: Date | undefined;
  cancelAtPeriodEnd: boolean;
} {
  const cancelAtRaw = sub.cancel_at;

  if (typeof cancelAtRaw === 'number') {
    return {
      cancelAt: new Date(cancelAtRaw * 1000),
      cancelAtPeriodEnd: true,
    };
  }

  // Fallback to deprecated boolean for backward compat with older API shapes
  const legacyFlag = sub.cancel_at_period_end ?? sub.cancelAtPeriodEnd;
  if (legacyFlag === true) {
    return { cancelAt: undefined, cancelAtPeriodEnd: true };
  }

  return { cancelAt: undefined, cancelAtPeriodEnd: false };
}

/**
 * Safely extracts subscription status, logging if the value is unexpected.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractSubscriptionStatus(sub: any): UserBilling['status'] {
  const status = sub.status;
  if (typeof status !== 'string') {
    elog.warn('Subscription status is not a string', {
      subscriptionId: sub.id,
      typeFound: typeof status,
    });
    return undefined;
  }

  const known: ReadonlySet<string> = new Set([
    'active', 'trialing', 'past_due', 'canceled', 'unpaid',
    'incomplete', 'incomplete_expired', 'paused',
  ]);

  if (!known.has(status)) {
    elog.warn('Subscription has unrecognised status; storing as-is', {
      subscriptionId: sub.id,
      status,
    });
  }

  return status as UserBilling['status'];
}

// ---------------------------------------------------------------------------
// Billing derivation
// ---------------------------------------------------------------------------

/**
 * Derives the billing summary from a Stripe subscription.
 * Always re-fetches to avoid relying on stale event data.
 */
export async function deriveSubscriptionBilling(
  stripe: Stripe,
  stripeSubscriptionId: string,
  existingBilling?: UserBilling,
): Promise<UserBilling> {
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);

  const priceIds = (sub.items?.data ?? []).map((item) => {
    const price = item.price;
    return typeof price === 'string' ? price : price?.id;
  }).filter(Boolean) as string[];
  const subTiers = tierIdsForPriceIds(priceIds);
  const subEntitlements = entitlementsForPriceIds(priceIds);

  const periodEnd = extractItemPeriodEnd(sub, stripeSubscriptionId);
  const { cancelAt, cancelAtPeriodEnd } = extractCancelIntent(sub);
  const status = extractSubscriptionStatus(sub);

  const activeTiers = mergeWithExistingLifetime(subTiers, existingBilling);
  const activeEntitlements = mergeEntitlements(subEntitlements, existingBilling);
  const isLifetime = existingBilling?.isLifetime ?? false;

  return {
    activeSubscriptions: activeTiers,
    entitlements: activeEntitlements,
    isLifetime,
    status,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd,
    cancelAt,
    stripeSubscriptionId: sub.id,
    stripePaymentIntentId: existingBilling?.stripePaymentIntentId,
    updatedAt: new Date(),
  };
}

/**
 * Builds billing state for a one-time lifetime purchase.
 */
function deriveLifetimeBilling(
  priceIds: string[],
  paymentIntentId: string | undefined,
  existingBilling?: UserBilling,
): UserBilling {
  const purchaseTiers = tierIdsForPriceIds(priceIds);
  const purchaseEntitlements = entitlementsForPriceIds(priceIds);

  const mergedTiers = new Set<SubscriptionTierId>([
    ...purchaseTiers,
    ...(existingBilling?.activeSubscriptions ?? []),
  ]);
  const mergedEntitlements = new Set<string>([
    ...purchaseEntitlements,
    ...(existingBilling?.entitlements ?? []),
  ]);

  return {
    activeSubscriptions: [...mergedTiers],
    entitlements: [...mergedEntitlements],
    isLifetime: true,
    status: 'active',
    currentPeriodEnd: existingBilling?.currentPeriodEnd,
    cancelAtPeriodEnd: existingBilling?.cancelAtPeriodEnd ?? false,
    cancelAt: existingBilling?.cancelAt,
    stripeSubscriptionId: existingBilling?.stripeSubscriptionId,
    stripePaymentIntentId: paymentIntentId ?? existingBilling?.stripePaymentIntentId,
    updatedAt: new Date(),
  };
}

/** Preserves lifetime tiers when updating from a subscription event. */
function mergeWithExistingLifetime(
  newTiers: SubscriptionTierId[],
  existing?: UserBilling,
): SubscriptionTierId[] {
  if (!existing?.isLifetime) return newTiers;
  const merged = new Set<SubscriptionTierId>([
    ...newTiers,
    ...existing.activeSubscriptions,
  ]);
  return [...merged];
}

/** Preserves existing entitlements when updating from a subscription event. */
function mergeEntitlements(
  newEntitlements: string[],
  existing?: UserBilling,
): string[] {
  if (!existing?.entitlements?.length) return newEntitlements;
  const merged = new Set<string>([
    ...newEntitlements,
    ...existing.entitlements,
  ]);
  return [...merged];
}

async function handleSubscriptionEvent(
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<void> {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    elog.warn('Stripe subscription event missing userId metadata', {
      subscriptionId: subscription.id,
    });
    return;
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) {
    elog.warn('Stripe subscription event for unknown user', { userId });
    return;
  }

  const billing = await deriveSubscriptionBilling(stripe, subscription.id, user.billing);
  await userRepo.updateBilling(user._id, billing);

  void initiateBackgroundCheck(user);

  elog.info('Billing updated from Stripe subscription event', {
    userId,
    subscriptionId: subscription.id,
    status: billing.status,
    tiers: billing.activeSubscriptions,
  });
}

async function handleCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  // Sponsorship checkout: apply billing to the beneficiary, not the payer
  if (session.metadata?.sponsorship === 'true') {
    await handleSponsorshipCheckoutCompleted(stripe, session);
    return;
  }

  const userId = session.client_reference_id ?? session.metadata?.userId;
  if (!userId) {
    elog.warn('Checkout session missing userId', { sessionId: session.id });
    return;
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) {
    elog.warn('Checkout completed for unknown user', { userId });
    return;
  }

  if (!user.stripeCustomerId && typeof session.customer === 'string') {
    await userRepo.updateStripeCustomerId(user._id, session.customer);
  }

  if (session.mode === 'subscription' && session.subscription) {
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;

    const billing = await deriveSubscriptionBilling(stripe, subscriptionId, user.billing);
    await userRepo.updateBilling(user._id, billing);

    void initiateBackgroundCheck(user);

    elog.info('Billing created from subscription checkout', {
      userId,
      subscriptionId,
      tiers: billing.activeSubscriptions,
    });
    return;
  }

  if (session.mode === 'payment') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullSession: any = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items'],
    });

    const priceIds: string[] = (fullSession.line_items?.data ?? [])
      .map((li: any) => li.price?.id)
      .filter(Boolean);

    if (!priceIds.length) {
      elog.warn('One-time checkout had no resolvable price IDs', { sessionId: session.id });
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;

    const billing = deriveLifetimeBilling(priceIds, paymentIntentId, user.billing);
    await userRepo.updateBilling(user._id, billing);

    void initiateBackgroundCheck(user);

    elog.info('Billing created from one-time purchase checkout', {
      userId,
      paymentIntentId,
      tiers: billing.activeSubscriptions,
      entitlements: billing.entitlements,
    });
    return;
  }

  elog.warn('Checkout session completed with unexpected or incomplete mode', {
    sessionId: session.id,
    mode: session.mode,
  });
}

// ---------------------------------------------------------------------------
// Sponsorship checkout fulfillment
// ---------------------------------------------------------------------------

async function handleSponsorshipCheckoutCompleted(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const meta = session.metadata ?? {};
  const beneficiaryUserId = meta.beneficiaryUserId;
  const sponsorUserId = meta.sponsorUserId;
  const requestId = meta.sponsorshipRequestId;
  const productId = meta.productId as PurchasableProductId | undefined;
  const revealIdentity = meta.revealIdentity === 'true';

  if (!beneficiaryUserId || !sponsorUserId || !requestId || !productId) {
    elog.warn('Sponsorship checkout missing required metadata', {
      sessionId: session.id,
      beneficiaryUserId,
      sponsorUserId,
      requestId,
      productId,
    });
    return;
  }

  const productMeta = PURCHASABLE_PRODUCTS[productId];
  if (!productMeta) {
    elog.warn('Sponsorship checkout has unknown productId', { sessionId: session.id, productId });
    return;
  }

  const userRepo = getUserRepository();
  const beneficiary = await userRepo.findById(beneficiaryUserId);
  if (!beneficiary) {
    elog.warn('Sponsorship checkout beneficiary not found', { beneficiaryUserId, sessionId: session.id });
    return;
  }

  const { ObjectId } = await import('mongodb');
  const sponsorshipRequestRepo = (await import('../../repositories/sponsorship.repository')).getSponsorshipRequestRepository();
  const sponsorshipLogRepo = (await import('../../repositories/sponsorship.repository')).getSponsorshipLogRepository();

  if (productMeta.isLifetime) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullSession: any = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items'],
    });
    const priceIds: string[] = (fullSession.line_items?.data ?? [])
      .map((li: any) => li.price?.id) // eslint-disable-line @typescript-eslint/no-explicit-any
      .filter(Boolean);

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;

    const billing = deriveLifetimeBilling(priceIds, paymentIntentId, beneficiary.billing);
    await userRepo.updateBilling(beneficiary._id, billing);
  } else {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const tier = productMeta.grantsTiers[0]!;
    await userRepo.addSubscriptionOverride(beneficiary._id, { tier, expiresAt });
  }

  await userRepo.addEntitlementOverride(beneficiary._id, 'gifted');
  await userRepo.incrementSponsorshipCount(beneficiary._id);

  await sponsorshipRequestRepo.fulfill(
    new ObjectId(requestId),
    {
      sponsorUserId: new ObjectId(sponsorUserId),
      sponsorRevealed: revealIdentity,
      sponsorFirstName: revealIdentity ? (meta.sponsorFirstName || undefined) : undefined,
      sponsorLastInitial: revealIdentity ? (meta.sponsorLastInitial || undefined) : undefined,
      fulfilledProduct: productId,
      stripeSessionId: session.id,
    },
  );

  const grantedTier = productMeta.grantsTiers[0]!;
  const expiresAt = productMeta.isLifetime ? undefined : (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  })();

  await sponsorshipLogRepo.createLog({
    recipientUserId: new ObjectId(beneficiaryUserId),
    sponsorUserId: new ObjectId(sponsorUserId),
    sponsorStripeSessionId: session.id,
    product: productId,
    tier: grantedTier,
    grantedAt: new Date(),
    expiresAt,
    requestId: new ObjectId(requestId),
  });

  void initiateBackgroundCheck(beneficiary);

  void emitSubscriptionUpgradedEvent(beneficiary._id, {
    tier: grantedTier,
    source: 'sponsorship',
    sponsorFirstName: revealIdentity ? (meta.sponsorFirstName || undefined) : undefined,
    sponsorLastInitial: revealIdentity ? (meta.sponsorLastInitial || undefined) : undefined,
    isLifetime: productMeta.isLifetime,
  }).catch((err) => {
    elog.warn('Failed to emit sponsorship subscription upgrade event', {
      beneficiaryUserId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  void (async () => {
    const { sendSponsorshipFulfilledNotification } = await import('../sponsorship-notification');
    await sendSponsorshipFulfilledNotification(beneficiary, {
      productId,
      isLifetime: productMeta.isLifetime,
      sponsorRevealed: revealIdentity,
      sponsorFirstName: revealIdentity ? (meta.sponsorFirstName || undefined) : undefined,
      sponsorLastInitial: revealIdentity ? (meta.sponsorLastInitial || undefined) : undefined,
    });
  })().catch((err) => {
    elog.warn('Failed to send sponsorship fulfilled notification', {
      beneficiaryUserId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  elog.info('Sponsorship fulfilled', {
    beneficiaryUserId,
    sponsorUserId,
    requestId,
    productId,
    tier: grantedTier,
    isLifetime: productMeta.isLifetime,
    sessionId: session.id,
  });
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    elog.warn('Subscription deleted event missing userId metadata', {
      subscriptionId: subscription.id,
    });
    return;
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return;

  if (user.billing?.isLifetime) {
    const billing: UserBilling = {
      activeSubscriptions: user.billing.activeSubscriptions,
      entitlements: user.billing.entitlements,
      isLifetime: true,
      status: 'active',
      currentPeriodEnd: undefined,
      cancelAtPeriodEnd: false,
      cancelAt: undefined,
      stripeSubscriptionId: subscription.id,
      stripePaymentIntentId: user.billing.stripePaymentIntentId,
      updatedAt: new Date(),
    };
    await userRepo.updateBilling(user._id, billing);

    elog.info('Recurring subscription deleted; lifetime access preserved', {
      userId,
      subscriptionId: subscription.id,
    });
    return;
  }

  const billing: UserBilling = {
    activeSubscriptions: [],
    entitlements: [],
    isLifetime: false,
    status: 'canceled',
    currentPeriodEnd: undefined,
    cancelAtPeriodEnd: false,
    cancelAt: undefined,
    stripeSubscriptionId: subscription.id,
    updatedAt: new Date(),
  };

  await userRepo.updateBilling(user._id, billing);

  elog.info('Billing cleared after subscription deletion', {
    userId,
    subscriptionId: subscription.id,
  });
}

/**
 * Idempotently processes a verified Stripe webhook event.
 */
export async function applySubscriptionChange(event: Stripe.Event): Promise<void> {
  if (await isEventAlreadyProcessed(event.id)) {
    elog.info('Skipping already-processed Stripe event', { eventId: event.id, type: event.type });
    return;
  }

  const stripe = getStripe();

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(stripe, event.data.object as Stripe.Checkout.Session);
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionEvent(stripe, event.data.object as Stripe.Subscription);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    case 'invoice.payment_succeeded':
    case 'invoice.payment_failed': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice = event.data.object as any;
      const invoiceSub = invoice.subscription;
      if (event.type === 'invoice.payment_succeeded') {
        const amountPaid = typeof invoice.amount_paid === 'number' ? invoice.amount_paid : 0;
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (amountPaid > 0 && customerId) {
          const userRepo = getUserRepository();
          const referredUser = await userRepo.findByStripeCustomerId(customerId);
          if (referredUser) {
            const { grantReferralCreditForPayment } = await import('../../services/referral.service');
            await grantReferralCreditForPayment(referredUser._id.toHexString(), amountPaid);
          }
        }
      }
      if (invoiceSub) {
        const subscriptionId = typeof invoiceSub === 'string' ? invoiceSub : invoiceSub.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as any;
        elog.info('Invoice event triggered subscription re-fetch', {
          eventId: event.id,
          type: event.type,
          subscriptionId,
        });
        await handleSubscriptionEvent(stripe, sub);
      }
      break;
    }

    default:
      elog.debug('Ignoring unhandled Stripe event type', { type: event.type });
      return;
  }

  await markEventProcessed(event.id);
}
