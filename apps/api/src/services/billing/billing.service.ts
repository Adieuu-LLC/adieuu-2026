/**
 * Billing service — Stripe subscription management.
 *
 * Provides checkout session creation, portal session creation,
 * customer management, and webhook event processing. Stripe is the
 * source of truth; this service keeps a denormalised summary on the
 * UserDocument so that login and JWT minting never need to call Stripe
 * synchronously.
 */

import type Stripe from 'stripe';
import type { SubscriptionTierId } from '@adieuu/shared';
import { getStripe } from './stripe.client';
import { config } from '../../config';
import { SUBSCRIPTION_TIERS } from '../../constants/subscription-tiers';
import { getUserRepository } from '../../repositories/user.repository';
import { getCollection, Collections } from '../../db';
import type { UserDocument, UserBilling } from '../../models/user';
import elog from '../../utils/adieuuLogger';

// ---------------------------------------------------------------------------
// Price ↔ tier mapping
// ---------------------------------------------------------------------------

function buildPriceToTierMap(): Map<string, SubscriptionTierId> {
  const map = new Map<string, SubscriptionTierId>();
  for (const [tierId, meta] of Object.entries(SUBSCRIPTION_TIERS)) {
    const priceId = config.stripe.prices[meta.priceConfigKey];
    if (priceId) {
      map.set(priceId, tierId as SubscriptionTierId);
    }
  }
  return map;
}

let priceToTierCache: Map<string, SubscriptionTierId> | null = null;

function getPriceToTierMap(): Map<string, SubscriptionTierId> {
  if (!priceToTierCache) {
    priceToTierCache = buildPriceToTierMap();
  }
  return priceToTierCache;
}

export function tierIdsForPriceIds(priceIds: string[]): SubscriptionTierId[] {
  const map = getPriceToTierMap();
  const tiers: SubscriptionTierId[] = [];
  for (const pid of priceIds) {
    const tid = map.get(pid);
    if (tid) tiers.push(tid);
  }
  return tiers;
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

export async function createCheckoutSessionForTier(
  user: UserDocument,
  tierId: SubscriptionTierId,
): Promise<{ url: string }> {
  const tierMeta = SUBSCRIPTION_TIERS[tierId];
  if (!tierMeta) {
    throw new Error(`Unknown subscription tier: ${tierId}`);
  }

  const priceId = config.stripe.prices[tierMeta.priceConfigKey];
  if (!priceId) {
    throw new Error(`No Stripe price configured for tier ${tierId}`);
  }

  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(user);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user._id.toHexString(),
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { userId: user._id.toHexString() },
    },
    success_url: config.stripe.successUrl,
    cancel_url: config.stripe.cancelUrl,
  });

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
 * Derives the billing summary from the current Stripe subscription state.
 * Always re-fetches the subscription to avoid relying on stale event data.
 */
async function deriveUserBilling(
  stripe: Stripe,
  stripeSubscriptionId: string,
): Promise<UserBilling> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub: any = await stripe.subscriptions.retrieve(stripeSubscriptionId);

  const priceIds = (sub.items?.data ?? []).map((item: any) => item.price?.id).filter(Boolean) as string[];
  const activeSubscriptions = tierIdsForPriceIds(priceIds);

  const periodEndRaw = sub.current_period_end ?? sub.currentPeriodEnd;
  const periodEnd = typeof periodEndRaw === 'number'
    ? new Date(periodEndRaw * 1000)
    : undefined;

  return {
    activeSubscriptions,
    status: (sub.status ?? undefined) as UserBilling['status'],
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? sub.cancelAtPeriodEnd ?? false,
    stripeSubscriptionId: sub.id,
    updatedAt: new Date(),
  };
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

  const billing = await deriveUserBilling(stripe, subscription.id);
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
  if (session.mode !== 'subscription' || !session.subscription) return;

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

  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription.id;

  const billing = await deriveUserBilling(stripe, subscriptionId);
  await userRepo.updateBilling(user._id, billing);

  elog.info('Billing created from checkout completion', {
    userId,
    subscriptionId,
    tiers: billing.activeSubscriptions,
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

  const billing: UserBilling = {
    activeSubscriptions: [],
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
