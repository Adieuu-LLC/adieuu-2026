/**
 * Cached Stripe catalog prices for subscription comparison UI (USD only).
 *
 * Price IDs come from config; amounts are fetched via Stripe API and cached in memory
 * to avoid repeated network calls on page loads.
 */

import type { PurchasableProductId } from '@adieuu/shared';
import { config } from '../../config';
import { PURCHASABLE_PRODUCTS } from '../../constants/subscription-tiers';
import elog from '../../utils/adieuuLogger';
import { billingErrorLogFields } from './billing.service';
import { getStripe } from './stripe.client';

/** In-memory cache TTL (10 minutes). */
export const SUBSCRIPTION_CATALOG_PRICES_CACHE_TTL_MS = 10 * 60 * 1_000;

export interface SubscriptionCatalogPriceEntry {
  unitAmountUsdCents: number;
  billing: 'annual' | 'one_time';
}

export interface SubscriptionCatalogPricesPayload {
  prices: Partial<Record<PurchasableProductId, SubscriptionCatalogPriceEntry>>;
}

let cache:
  | {
      expiresAt: number;
      payload: SubscriptionCatalogPricesPayload;
    }
  | undefined;

let inFlight: Promise<SubscriptionCatalogPricesPayload> | null = null;

async function fetchFreshSubscriptionCatalogPrices(): Promise<SubscriptionCatalogPricesPayload> {
  if (!config.stripe.enabled) {
    return { prices: {} };
  }

  const stripe = getStripe();
  const prices: SubscriptionCatalogPricesPayload['prices'] = {};

  for (const meta of Object.values(PURCHASABLE_PRODUCTS)) {
    const priceId = config.stripe.prices[meta.priceConfigKey];
    if (!priceId) continue;

    try {
      const price = await stripe.prices.retrieve(priceId);
      if (price.currency !== 'usd') {
        elog.warn('Subscription catalog price skipped: expected USD', {
          productId: meta.id,
          currency: price.currency,
        });
        continue;
      }
      if (price.unit_amount == null) {
        elog.warn('Subscription catalog price skipped: missing unit_amount', { productId: meta.id });
        continue;
      }

      const billing: SubscriptionCatalogPriceEntry['billing'] =
        price.type === 'recurring' && price.recurring?.interval === 'year'
          ? 'annual'
          : 'one_time';

      prices[meta.id] = {
        unitAmountUsdCents: price.unit_amount,
        billing,
      };
    } catch (err) {
      elog.warn('Subscription catalog price retrieve failed', {
        productId: meta.id,
        ...billingErrorLogFields(err),
      });
    }
  }

  return { prices };
}

/**
 * Returns USD catalog prices for purchasable products, using a shared in-memory cache.
 */
export async function getCachedSubscriptionCatalogPrices(): Promise<SubscriptionCatalogPricesPayload> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.payload;
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    try {
      const payload = await fetchFreshSubscriptionCatalogPrices();
      cache = { expiresAt: Date.now() + SUBSCRIPTION_CATALOG_PRICES_CACHE_TTL_MS, payload };
      return payload;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Test hook: clear cache between cases. */
export function __resetSubscriptionCatalogPricesCacheForTests(): void {
  cache = undefined;
  inFlight = null;
}
