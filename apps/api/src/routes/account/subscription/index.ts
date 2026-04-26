/**
 * Account subscription routes.
 *
 * All routes require an account session (identity sessions are rejected).
 * Stripe must be enabled or all routes return 503.
 *
 * @module routes/account/subscription
 */

import { Router } from '../../../router';
import { success } from '../../../utils/response';
import { requireAccountSession } from '../../../services/session.service';
import { getUserRepository } from '../../../repositories/user.repository';
import { config } from '../../../config';
import { SUBSCRIPTION_TIER_IDS, type SubscriptionTierId } from '@adieuu/shared';
import {
  createCheckoutSessionForTier,
  createBillingPortalSession,
} from '../../../services/billing/billing.service';
import { checkRateLimit, type RateLimitConfig } from '../../../services/rate-limit.service';

const router = new Router();

const CHECKOUT_RATE_LIMIT: RateLimitConfig = { limit: 5, windowSeconds: 300 };
const PORTAL_RATE_LIMIT: RateLimitConfig = { limit: 10, windowSeconds: 300 };

/**
 * GET /account/subscription
 *
 * Returns the current user's billing summary and tier metadata.
 * Never exposes stripeCustomerId or other Stripe internals.
 *
 * @route GET /api/account/subscription
 */
router.get('/account/subscription', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  if (!config.stripe.enabled) {
    return new Response(
      JSON.stringify({ error: 'Subscriptions are temporarily unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(session.userId);
  if (!user) return ctx.errors.notFound();

  return success({
    activeSubscriptions: user.billing?.activeSubscriptions ?? [],
    status: user.billing?.status ?? null,
    currentPeriodEnd: user.billing?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: user.billing?.cancelAtPeriodEnd ?? false,
    hasStripeCustomer: !!user.stripeCustomerId,
  });
});

/**
 * POST /account/subscription/checkout
 *
 * Creates a Stripe Checkout Session for the given tier and returns the URL
 * for the client to redirect to.
 *
 * @route POST /api/account/subscription/checkout
 */
router.post('/account/subscription/checkout', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  if (!config.stripe.enabled) {
    return new Response(
      JSON.stringify({ error: 'Subscriptions are temporarily unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const rl = await checkRateLimit('subscription:checkout', session.userId, CHECKOUT_RATE_LIMIT);
  if (!rl.allowed) return ctx.errors.rateLimited();

  const body = ctx.body as { tier?: string } | undefined;
  const tier = body?.tier;

  if (!tier || !SUBSCRIPTION_TIER_IDS.includes(tier as SubscriptionTierId)) {
    return ctx.errors.validationFailed();
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(session.userId);
  if (!user) return ctx.errors.notFound();

  try {
    const result = await createCheckoutSessionForTier(user, tier as SubscriptionTierId);
    return success(result);
  } catch (err) {
    return ctx.errors.internal();
  }
});

/**
 * POST /account/subscription/portal
 *
 * Creates a Stripe Billing Portal session and returns the URL.
 *
 * @route POST /api/account/subscription/portal
 */
router.post('/account/subscription/portal', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  if (!config.stripe.enabled) {
    return new Response(
      JSON.stringify({ error: 'Subscriptions are temporarily unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const rl = await checkRateLimit('subscription:portal', session.userId, PORTAL_RATE_LIMIT);
  if (!rl.allowed) return ctx.errors.rateLimited();

  const userRepo = getUserRepository();
  const user = await userRepo.findById(session.userId);
  if (!user) return ctx.errors.notFound();

  if (!user.stripeCustomerId) {
    return ctx.errors.notFound();
  }

  try {
    const result = await createBillingPortalSession(user);
    return success(result);
  } catch (err) {
    return ctx.errors.internal();
  }
});

export const subscriptionRoutes = router;
