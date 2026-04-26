/**
 * Billing service — Stripe subscription and one-time purchase management.
 *
 * Provides checkout session creation, portal session creation,
 * customer management, and webhook event processing. Stripe is the
 * source of truth; this service keeps a denormalised summary on the
 * UserDocument so that login and JWT minting never need to call Stripe
 * synchronously.
 */

import type Stripe from 'stripe';
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

  const stripe = getStripe();
  const email = user.emailVerified ? user.email : undefined;
  const customer = await stripe.customers.create({
    email,
    metadata: { userId: user._id.toHexString() },
  });

  const userRepo = getUserRepository();
  await userRepo.updateStripeCustomerId(user._id, customer.id);

  return customer.id;
}

// ---------------------------------------------------------------------------
// Checkout + Portal
// ---------------------------------------------------------------------------

export async function createCheckoutSessionForProduct(
  user: UserDocument,
  productId: PurchasableProductId,
): Promise<{ url: string }> {
  const productMeta = PURCHASABLE_PRODUCTS[productId];
  if (!productMeta) {
    throw new Error(`Unknown product: ${productId}`);
  }

  const priceId = config.stripe.prices[productMeta.priceConfigKey];
  if (!priceId) {
    throw new Error(`No Stripe price configured for product ${productId}`);
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

  return { url: session.url };
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

/**
 * Derives the billing summary from a Stripe subscription.
 * Always re-fetches to avoid relying on stale event data.
 */
async function deriveSubscriptionBilling(
  stripe: Stripe,
  stripeSubscriptionId: string,
  existingBilling?: UserBilling,
): Promise<UserBilling> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub: any = await stripe.subscriptions.retrieve(stripeSubscriptionId);

  const priceIds = (sub.items?.data ?? []).map((item: any) => item.price?.id).filter(Boolean) as string[];
  const subTiers = tierIdsForPriceIds(priceIds);
  const subEntitlements = entitlementsForPriceIds(priceIds);

  const periodEndRaw = sub.current_period_end ?? sub.currentPeriodEnd;
  const periodEnd = typeof periodEndRaw === 'number'
    ? new Date(periodEndRaw * 1000)
    : undefined;

  const activeTiers = mergeWithExistingLifetime(subTiers, existingBilling);
  const activeEntitlements = mergeEntitlements(subEntitlements, existingBilling);
  const isLifetime = existingBilling?.isLifetime ?? false;

  return {
    activeSubscriptions: activeTiers,
    entitlements: activeEntitlements,
    isLifetime,
    status: (sub.status ?? undefined) as UserBilling['status'],
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? sub.cancelAtPeriodEnd ?? false,
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

    elog.info('Billing created from one-time purchase checkout', {
      userId,
      paymentIntentId,
      tiers: billing.activeSubscriptions,
      entitlements: billing.entitlements,
    });
  }
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
      cancelAtPeriodEnd: false,
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
    cancelAtPeriodEnd: false,
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
    elog.debug('Skipping already-processed Stripe event', { eventId: event.id });
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
      if (invoiceSub) {
        const subscriptionId = typeof invoiceSub === 'string' ? invoiceSub : invoiceSub.id;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as any;
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
