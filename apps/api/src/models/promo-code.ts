/**
 * Promotional code models.
 *
 * PromoCodeDocument — platform-defined codes that grant subscription tiers
 * and/or entitlements for a limited time.
 *
 * PromoRedemptionDocument — audit trail of which users redeemed which codes.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { SubscriptionTierId } from '@adieuu/shared';

/** Subscription tier grant attached to a promo code. */
export interface PromoCodeSubscriptionGrant {
  tier: SubscriptionTierId;
  /** Duration in months; null = lifetime (no expiry). */
  durationMonths: number | null;
}

/** Who can redeem a promo code based on their subscription history. */
export type PromoCodeAudience = 'all' | 'first_time' | 'unsubscribed';

/**
 * A promotional code definition.
 * Shortcodes are stored lowercase and matched case-insensitively.
 */
export interface PromoCodeDocument extends BaseDocument {
  /** Unique shortcode (lowercase). */
  shortcode: string;
  description?: string;
  /** Optional subscription tier grant. */
  subscription?: PromoCodeSubscriptionGrant;
  /** Entitlement strings granted on redemption (lifetime overrides). */
  entitlements: string[];
  /** Shortcodes the user must have already redeemed. */
  requiredCodes: string[];
  /** Shortcodes the user must not have redeemed. */
  incompatibleCodes: string[];
  /** Maximum redemptions allowed; null = unlimited. */
  maxUses: number | null;
  /** Current redemption count. */
  currentUses: number;
  /** Allowed jurisdictions (e.g. US-TN, GB); empty = all jurisdictions. */
  jurisdictions: string[];
  /** Who can redeem: 'all' (default), 'first_time', or 'unsubscribed'. */
  audience?: PromoCodeAudience;
  /** Start of validity window; null = valid immediately. */
  validFrom: Date | null;
  /** End of validity window; null = no expiry. */
  validTo: Date | null;
}

/** Which Stripe integration path was used during promo redemption. */
export type PromoRedemptionStripeAction = 'trial' | 'credit' | 'override';

/** Record of a user redeeming a promo code. */
export interface PromoRedemptionDocument extends BaseDocument {
  userId: ObjectId;
  /** Lowercase shortcode redeemed. */
  shortcode: string;
  redeemedAt: Date;
  subscriptionOverrideApplied?: {
    tier: SubscriptionTierId;
    expiresAt?: Date;
  };
  entitlementsApplied: string[];
  /** Which Stripe integration path was used (if any). */
  stripeAction?: PromoRedemptionStripeAction;
}
