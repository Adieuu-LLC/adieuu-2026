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

export type StripeKeyKind =
  | 'test'
  | 'live'
  | 'organization'
  | 'restricted-test'
  | 'restricted-live'
  | 'unknown';

export function stripeKeyKind(secretKey: string): StripeKeyKind {
  if (secretKey.startsWith('sk_org')) return 'organization';
  if (secretKey.startsWith('sk_live_')) return 'live';
  if (secretKey.startsWith('sk_test_')) return 'test';
  if (secretKey.startsWith('rk_live_')) return 'restricted-live';
  if (secretKey.startsWith('rk_test_')) return 'restricted-test';
  return 'unknown';
}

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
  const kind = stripeKeyKind(config.stripe.secretKey);
  return kind === 'live' || kind === 'restricted-live' ? 'live' : 'test';
}

function stripeEnvironmentLabel(keyKind: StripeKeyKind, livemode?: boolean): string {
  if (keyKind === 'organization') return 'organization';
  if (keyKind === 'live' || keyKind === 'restricted-live' || livemode === true) return 'live';
  if (keyKind === 'test' || keyKind === 'restricted-test' || livemode === false) return 'test sandbox';
  return 'unknown';
}

export function resolveStripeAccountLabel(account: Stripe.Account): string | undefined {
  return (
    account.settings?.dashboard?.display_name
    ?? account.business_profile?.name
    ?? account.company?.name
    ?? account.email
    ?? undefined
  );
}

function buildStripeVerificationMessage(params: {
  keyKind: StripeKeyKind;
  livemode?: boolean;
  account?: Stripe.Account;
}): string {
  const env = stripeEnvironmentLabel(params.keyKind, params.livemode);
  if (!params.account) {
    return `Stripe credentials verified — ${env} (balance.retrieve)`;
  }

  const label = resolveStripeAccountLabel(params.account);
  const locale = [params.account.country?.toUpperCase(), params.account.default_currency]
    .filter(Boolean)
    .join('/');

  if (label && locale) {
    return `Stripe credentials verified — ${env}, ${params.account.id} ("${label}", ${locale})`;
  }
  if (label) {
    return `Stripe credentials verified — ${env}, ${params.account.id} ("${label}")`;
  }
  if (locale) {
    return `Stripe credentials verified — ${env}, ${params.account.id} (${locale})`;
  }
  return `Stripe credentials verified — ${env}, ${params.account.id}`;
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
    const keyKind = stripeKeyKind(config.stripe.secretKey);
    stripeInstance = new Stripe(config.stripe.secretKey);
    elog.info('Stripe SDK initialised', {
      keyPrefix: redactStripeSecretKey(config.stripe.secretKey),
      keyKind,
      mode: stripeKeyMode(),
    });
  }

  return stripeInstance;
}

export type StripeCredentialVerification = {
  valid: boolean;
  mode?: 'test' | 'live';
  keyKind?: StripeKeyKind;
  accountId?: string;
  accountLabel?: string;
  country?: string;
  defaultCurrency?: string;
  error?: string;
};

/**
 * Verifies the Stripe secret key with a no-side-effect API call. Does not throw;
 * log on failure. Intended for startup diagnostics.
 */
export async function verifyStripeCredentials(): Promise<StripeCredentialVerification> {
  try {
    const stripe = getStripe();
    const keyKind = stripeKeyKind(config.stripe.secretKey);

    const [balanceResult, accountResult] = await Promise.allSettled([
      withTimeout(
        stripe.balance.retrieve(),
        STRIPE_BALANCE_STARTUP_TIMEOUT_MS,
        'Stripe balance.retrieve (startup)',
      ),
      withTimeout(
        stripe.accounts.retrieveCurrent(),
        STRIPE_BALANCE_STARTUP_TIMEOUT_MS,
        'Stripe accounts.retrieveCurrent (startup)',
      ),
    ]);

    if (balanceResult.status === 'rejected') {
      throw balanceResult.reason;
    }

    const balance = balanceResult.value;
    const mode = stripeKeyMode();
    const account = accountResult.status === 'fulfilled' ? accountResult.value : undefined;

    if (accountResult.status === 'rejected') {
      elog.warn('Stripe account metadata unavailable during startup verification', {
        error:
          accountResult.reason instanceof Error
            ? accountResult.reason.message
            : String(accountResult.reason),
      });
    }

    const message = buildStripeVerificationMessage({
      keyKind,
      livemode: balance.livemode,
      account,
    });

    elog.info(message, {
      mode,
      keyKind,
      livemode: balance.livemode,
      accountId: account?.id,
      accountLabel: account ? resolveStripeAccountLabel(account) : undefined,
      country: account?.country,
      defaultCurrency: account?.default_currency,
      keyPrefix: redactStripeSecretKey(config.stripe.secretKey),
    });

    return {
      valid: true,
      mode,
      keyKind,
      accountId: account?.id,
      accountLabel: account ? resolveStripeAccountLabel(account) : undefined,
      country: account?.country,
      defaultCurrency: account?.default_currency,
    };
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
