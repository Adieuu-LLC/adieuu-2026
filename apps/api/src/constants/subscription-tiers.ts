/**
 * Subscription tier definitions with Stripe price mapping.
 *
 * The canonical tier id type lives in @adieuu/shared; this file adds
 * server-side metadata (which config key holds the Stripe Price ID).
 */

import type { SubscriptionTierId } from '@adieuu/shared';

export interface SubscriptionTierMeta {
  id: SubscriptionTierId;
  /** Key into config.stripe.prices */
  priceConfigKey: 'vanguardMonthly';
}

export const SUBSCRIPTION_TIERS: Record<SubscriptionTierId, SubscriptionTierMeta> = {
  vanguard: {
    id: 'vanguard',
    priceConfigKey: 'vanguardMonthly',
  },
} as const;
