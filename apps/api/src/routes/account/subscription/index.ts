/**
 * Account subscription routes.
 *
 * All routes require an account session (identity sessions are rejected).
 * Stripe must be enabled or all routes return 503.
 *
 * @module routes/account/subscription
 */

import { Router } from '../../../router';
import { success, error } from '../../../utils/response';
import { requireAccountSession } from '../../../services/session.service';
import { getUserRepository } from '../../../repositories/user.repository';
import { config } from '../../../config';
import { PURCHASABLE_PRODUCT_IDS, type PurchasableProductId } from '@adieuu/shared';
import {
  BillingConfigurationError,
  billingErrorLogFields,
  createCheckoutSessionForProduct,
  createBillingPortalSession,
} from '../../../services/billing/billing.service';
import { checkRateLimit, type RateLimitConfig } from '../../../services/rate-limit.service';
import elog from '../../../utils/adieuuLogger';

const router = new Router();

/** Stripe checkout session creation — generous window so retries, double-clicks, and config mistakes do not quickly lock users out. */
const CHECKOUT_RATE_LIMIT: RateLimitConfig = { limit: 30, windowSeconds: 3600 };
/** Billing portal sessions — same idea; users may open/close portal several times while sorting payment methods. */
const PORTAL_RATE_LIMIT: RateLimitConfig = { limit: 45, windowSeconds: 3600 };

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
    entitlements: user.billing?.entitlements ?? [],
    isLifetime: user.billing?.isLifetime ?? false,
    status: user.billing?.status ?? null,
    currentPeriodEnd: user.billing?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: user.billing?.cancelAtPeriodEnd ?? false,
    hasStripeCustomer: !!user.stripeCustomerId,
  });
});

/**
 * POST /account/subscription/checkout
 *
 * Creates a Stripe Checkout Session for the given product and returns the URL
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

  const body = ctx.body as { product?: string } | undefined;
  const product = body?.product;

  if (!product || !PURCHASABLE_PRODUCT_IDS.includes(product as PurchasableProductId)) {
    return ctx.errors.validationFailed();
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(session.userId);
  if (!user) return ctx.errors.notFound();

  try {
    const result = await createCheckoutSessionForProduct(user, product as PurchasableProductId);
    return success(result);
  } catch (err) {
    if (err instanceof BillingConfigurationError) {
      elog.error('Subscription checkout: billing not fully configured', {
        userId: session.userId,
        product,
        ...billingErrorLogFields(err),
      });
      return error(
        'SERVICE_UNAVAILABLE',
        'Subscriptions are temporarily unavailable. Please try again later.',
        503,
      );
    }
    elog.error('Subscription checkout failed', {
      userId: session.userId,
      product,
      ...billingErrorLogFields(err),
    }, err instanceof Error ? err : undefined);
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
    elog.error('Subscription portal session failed', {
      userId: session.userId,
      ...billingErrorLogFields(err),
    }, err instanceof Error ? err : undefined);
    return ctx.errors.internal();
  }
});

export const subscriptionRoutes = router;
