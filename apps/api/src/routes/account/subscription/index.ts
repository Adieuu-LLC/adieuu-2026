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
import {
  getSubscriptionSummary,
  createSubscriptionCheckout,
  createSubscriptionPortal,
  confirmCheckoutSession,
} from './controller';
import { getClientIp } from '../../auth/controller';

const router = new Router();

const STRIPE_UNAVAILABLE_RESPONSE = new Response(
  JSON.stringify({ error: 'Subscriptions are temporarily unavailable' }),
  { status: 503, headers: { 'Content-Type': 'application/json' } },
);

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

  const result = await getSubscriptionSummary(session.userId);
  if (!result.ok) {
    if (result.reason === 'stripe_disabled') return STRIPE_UNAVAILABLE_RESPONSE;
    return ctx.errors.notFound();
  }

  return success(result.data);
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

  const body = ctx.body as { product?: unknown } | undefined;
  const result = await createSubscriptionCheckout(session.userId, body?.product);

  if (!result.ok) {
    if (result.reason === 'stripe_disabled') return STRIPE_UNAVAILABLE_RESPONSE;
    if (result.reason === 'rate_limited') return ctx.errors.rateLimited();
    if (result.reason === 'validation') return ctx.errors.validationFailed();
    if (result.reason === 'user_not_found') return ctx.errors.notFound();
    if (result.reason === 'billing_config') {
      return error(
        'SERVICE_UNAVAILABLE',
        'Subscriptions are temporarily unavailable. Please try again later.',
        503,
      );
    }
    return ctx.errors.internal();
  }

  return success({ url: result.url });
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

  const result = await createSubscriptionPortal(session.userId);

  if (!result.ok) {
    if (result.reason === 'stripe_disabled') return STRIPE_UNAVAILABLE_RESPONSE;
    if (result.reason === 'rate_limited') return ctx.errors.rateLimited();
    if (result.reason === 'user_not_found' || result.reason === 'no_stripe_customer') {
      return ctx.errors.notFound();
    }
    return ctx.errors.internal();
  }

  return success(result.data);
});

/**
 * POST /account/subscription/confirm
 *
 * Public endpoint (no auth required). Accepts a Stripe checkout session_id,
 * verifies it with Stripe, resolves the user by customer ID, and reconciles
 * their billing to the latest Stripe state.
 *
 * @route POST /api/account/subscription/confirm
 */
router.post('/account/subscription/confirm', async (ctx) => {
  const body = ctx.body as { sessionId?: unknown } | undefined;
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  const clientIp = getClientIp(ctx.request);

  const result = await confirmCheckoutSession(sessionId, clientIp);

  if (!result.ok) {
    if (result.reason === 'stripe_disabled') return STRIPE_UNAVAILABLE_RESPONSE;
    if (result.reason === 'rate_limited') return ctx.errors.rateLimited();
    if (result.reason === 'validation') return ctx.errors.validationFailed();
    if (result.reason === 'session_not_found') return ctx.errors.notFound();
    if (result.reason === 'user_not_found') return ctx.errors.notFound();
    if (result.reason === 'payment_incomplete') {
      return error('PAYMENT_INCOMPLETE', 'Checkout has not been completed.', 402);
    }
    return ctx.errors.internal();
  }

  return success({ confirmed: result.confirmed });
});

export const subscriptionRoutes = router;
