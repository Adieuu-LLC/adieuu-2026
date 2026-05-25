/**
 * Webhooks controller — Stripe signature verification and subscription event processing.
 *
 * Route modules map structured results to HTTP responses.
 *
 * @module routes/webhooks/controller
 */

import { config } from '../../config';
import { getStripe } from '../../services/billing/stripe.client';
import {
  applySubscriptionChange,
  billingErrorLogFields,
} from '../../services/billing/billing.service';
import elog from '../../utils/adieuuLogger';

export type StripeWebhookFailureKind =
  | 'stripe_disabled'
  | 'missing_signature'
  | 'missing_body'
  | 'webhook_not_configured'
  | 'invalid_signature';

export type StripeWebhookResult =
  | { ok: true; data: { received: true } }
  | { ok: false; kind: StripeWebhookFailureKind };

export async function handleStripeWebhookResult(input: {
  rawBody: string | undefined;
  signature: string | null;
}): Promise<StripeWebhookResult> {
  if (!config.stripe.enabled) {
    return { ok: false, kind: 'stripe_disabled' };
  }

  if (!input.signature) {
    return { ok: false, kind: 'missing_signature' };
  }

  if (!input.rawBody) {
    return { ok: false, kind: 'missing_body' };
  }

  if (!config.stripe.webhookSecret) {
    elog.error('STRIPE_WEBHOOK_SECRET is empty; webhook verification will fail for all events');
    return { ok: false, kind: 'webhook_not_configured' };
  }

  let event;
  try {
    const stripe = getStripe();
    event = await stripe.webhooks.constructEventAsync(
      input.rawBody,
      input.signature,
      config.stripe.webhookSecret,
    );
  } catch (err) {
    elog.warn('Stripe webhook signature verification failed', {
      ...billingErrorLogFields(err),
    });
    return { ok: false, kind: 'invalid_signature' };
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

  return { ok: true, data: { received: true } };
}
