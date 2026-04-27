/**
 * Stripe webhook route.
 *
 * Receives signed events from Stripe. Signature verification uses the
 * raw request body (available via ctx.rawBody) and the configured webhook
 * signing secret.
 *
 * @route POST /api/webhooks/stripe
 */

import { Router } from '../../router';
import { config } from '../../config';
import { getStripe } from '../../services/billing/stripe.client';
import {
  applySubscriptionChange,
  billingErrorLogFields,
} from '../../services/billing/billing.service';
import elog from '../../utils/adieuuLogger';

const router = new Router();

router.post('/webhooks/stripe', async (ctx) => {
  if (!config.stripe.enabled) {
    return new Response(JSON.stringify({ error: 'Stripe is not enabled' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sig = ctx.request.headers.get('stripe-signature');
  if (!sig) {
    return new Response(JSON.stringify({ error: 'Missing signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!ctx.rawBody) {
    return new Response(JSON.stringify({ error: 'Missing body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!config.stripe.webhookSecret) {
    elog.error('STRIPE_WEBHOOK_SECRET is empty; webhook verification will fail for all events');
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let event;
  try {
    const stripe = getStripe();
    event = await stripe.webhooks.constructEventAsync(
      ctx.rawBody,
      sig,
      config.stripe.webhookSecret,
    );
  } catch (err) {
    elog.warn('Stripe webhook signature verification failed', {
      ...billingErrorLogFields(err),
    });
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  elog.info('Stripe webhook event verified', { eventId: event.id, type: event.type });

  try {
    await applySubscriptionChange(event);
  } catch (err) {
    elog.error('Stripe webhook processing error', {
      eventId: event.id,
      type: event.type,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

export const stripeWebhookRoutes = router;
