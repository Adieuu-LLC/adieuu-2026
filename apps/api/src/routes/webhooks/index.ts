/**
 * Webhooks routes module.
 *
 * Receives signed events from external providers. Stripe webhooks use the
 * raw request body (available via ctx.rawBody) and the configured webhook
 * signing secret for verification.
 *
 * @module routes/webhooks
 */

import { Router } from '../../router';
import {
  handleStripeWebhookResult,
  type StripeWebhookResult,
} from './controller';

const router = new Router();

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mapStripeWebhookFailure(
  result: Extract<StripeWebhookResult, { ok: false }>,
): Response {
  switch (result.kind) {
    case 'stripe_disabled':
      return jsonResponse({ error: 'Stripe is not enabled' }, 503);
    case 'missing_signature':
      return jsonResponse({ error: 'Missing signature' }, 400);
    case 'missing_body':
      return jsonResponse({ error: 'Missing body' }, 400);
    case 'webhook_not_configured':
      return jsonResponse({ error: 'Webhook not configured' }, 503);
    case 'invalid_signature':
      return jsonResponse({ error: 'Invalid signature' }, 400);
  }
}

/**
 * POST /webhooks/stripe
 *
 * Receives signed Stripe events and applies subscription changes.
 *
 * @route POST /api/webhooks/stripe
 */
router.post('/webhooks/stripe', async (ctx) => {
  const result = await handleStripeWebhookResult({
    rawBody: ctx.rawBody,
    signature: ctx.request.headers.get('stripe-signature'),
  });

  if (!result.ok) return mapStripeWebhookFailure(result);

  return jsonResponse({ received: true }, 200);
});

export const webhookRoutes = router;
