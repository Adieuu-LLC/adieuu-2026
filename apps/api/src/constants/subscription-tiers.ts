/**
 * Purchasable product definitions with Stripe price mapping.
 *
 * The canonical type ids live in @adieuu/shared; this file adds
 * server-side metadata: Stripe checkout mode, price config key,
 * granted tiers, granted entitlements, and lifetime flag.
 */

import type { SubscriptionTierId, PurchasableProductId } from '@adieuu/shared';

export type StripePriceConfigKey =
  | 'freeMonthly'
  | 'accessAnnual'
  | 'insiderAnnual'
  | 'vanguardLifetime'
  | 'founderLifetime';

export interface ProductMeta {
  id: PurchasableProductId;
  /** Stripe Checkout mode. */
  checkoutMode: 'subscription' | 'payment';
  /** Key into config.stripe.prices */
  priceConfigKey: StripePriceConfigKey;
  /** Effective subscription tiers granted by this product. */
  grantsTiers: SubscriptionTierId[];
  /** Entitlements awarded (e.g. badge names). */
  grantsEntitlements: string[];
  /** Whether this purchase grants permanent (lifetime) access. */
  isLifetime: boolean;
}

export const PURCHASABLE_PRODUCTS: Record<PurchasableProductId, ProductMeta> = {
  free: {
    id: 'free',
    checkoutMode: 'subscription',
    priceConfigKey: 'freeMonthly',
    grantsTiers: ['free'],
    grantsEntitlements: [],
    isLifetime: false,
  },
  access: {
    id: 'access',
    checkoutMode: 'subscription',
    priceConfigKey: 'accessAnnual',
    grantsTiers: ['access'],
    grantsEntitlements: [],
    isLifetime: false,
  },
  insider: {
    id: 'insider',
    checkoutMode: 'subscription',
    priceConfigKey: 'insiderAnnual',
    grantsTiers: ['insider'],
    grantsEntitlements: [],
    isLifetime: false,
  },
  vanguard: {
    id: 'vanguard',
    checkoutMode: 'payment',
    priceConfigKey: 'vanguardLifetime',
    grantsTiers: ['insider'],
    grantsEntitlements: ['vanguard'],
    isLifetime: true,
  },
  founder: {
    id: 'founder',
    checkoutMode: 'payment',
    priceConfigKey: 'founderLifetime',
    grantsTiers: ['insider'],
    grantsEntitlements: ['founder'],
    isLifetime: true,
  },
} as const;
