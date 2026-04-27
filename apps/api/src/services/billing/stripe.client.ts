/**
 * Thin wrapper around the Stripe SDK.
 *
 * Lazily constructs a singleton Stripe instance and fails closed when the
 * integration is disabled, preventing accidental calls in environments
 * without valid credentials.
 */

import Stripe from 'stripe';
import { config } from '../../config';
import elog from '../../utils/adieuuLogger';

let stripeInstance: Stripe | null = null;

const STRIPE_BALANCE_STARTUP_TIMEOUT_MS = 8000;
const STRIPE_BALANCE_HEALTH_TIMEOUT_MS = 5000;

/**
 * Redacts a Stripe API key for logs (e.g. `sk_live_****9abc`).
 */
export function redactStripeSecretKey(secretKey: string): string {
  if (secretKey.length <= 12) {
    return '****';
  }
  // `sk_test_` and `sk_live_` are each 8 characters; keep them visible for mode.
  const prefix = secretKey.slice(0, 8);
  const tail = secretKey.slice(-4);
  return `${prefix}****${tail}`;
}

function stripeKeyMode(): 'test' | 'live' {
  return config.stripe.secretKey.startsWith('sk_live_') ? 'live' : 'test';
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${label} timed out after ${ms}ms`));
      }, ms);
    }),
  ]);
}

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
    elog.info('Stripe SDK initialised', {
      keyPrefix: redactStripeSecretKey(config.stripe.secretKey),
      mode: stripeKeyMode(),
    });
  }

  return stripeInstance;
}

export type StripeCredentialVerification = {
  valid: boolean;
  mode?: 'test' | 'live';
  error?: string;
};

/**
 * Verifies the Stripe secret key with a no-side-effect API call. Does not throw;
 * log on failure. Intended for startup diagnostics.
 */
export async function verifyStripeCredentials(): Promise<StripeCredentialVerification> {
  try {
    const stripe = getStripe();
    await withTimeout(
      stripe.balance.retrieve(),
      STRIPE_BALANCE_STARTUP_TIMEOUT_MS,
      'Stripe balance.retrieve (startup)',
    );
    const mode = stripeKeyMode();
    elog.info('Stripe credentials verified (balance.retrieve)', { mode });
    return { valid: true, mode };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    elog.error('Stripe startup credential verification failed; billing may be broken until fixed', {
      error,
    });
    return { valid: false, error };
  }
}

/**
 * Liveness of Stripe for /api/health. Uses balance.retrieve with a short timeout.
 */
export async function checkStripeServiceHealth(): Promise<{
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const stripe = getStripe();
    await withTimeout(
      stripe.balance.retrieve(),
      STRIPE_BALANCE_HEALTH_TIMEOUT_MS,
      'Stripe balance.retrieve (health)',
    );
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
