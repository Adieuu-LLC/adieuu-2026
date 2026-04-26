/**
 * Thin wrapper around the Stripe SDK.
 *
 * Lazily constructs a singleton Stripe instance and fails closed when the
 * integration is disabled, preventing accidental calls in environments
 * without valid credentials.
 */

import Stripe from 'stripe';
import { config } from '../../config';

let stripeInstance: Stripe | null = null;

/**
 * Returns the shared Stripe SDK instance.
 *
 * @throws Error if Stripe is not enabled or the secret key is missing.
 */
export function getStripe(): Stripe {
  if (!config.stripe.enabled) {
    throw new Error('Stripe is not enabled (STRIPE_ENABLED=false)');
  }

  if (!config.stripe.secretKey) {
    throw new Error('STRIPE_SECRET_KEY is required when Stripe is enabled');
  }

  if (!stripeInstance) {
    stripeInstance = new Stripe(config.stripe.secretKey);
  }

  return stripeInstance;
}
