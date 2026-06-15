/**
 * Referral program models.
 *
 * ReferralCodeDocument — account-owned referral codes (up to 3 active per account).
 * ReferralAttributionDocument — audit trail linking referred users to referrers.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/** A referral code owned by an account. */
export interface ReferralCodeDocument extends BaseDocument {
  /** Owning account user id. */
  userId: ObjectId;
  /** Lowercase unique code (3–24 chars, [a-z0-9-]). */
  code: string;
  /** Historical code strings for moderation audit (includes prior values after edits). */
  previousVersions: string[];
  /** Plain-text message shown on the public landing page (max 300 chars). */
  customMessage?: string;
  /** Landing page visits / link clicks. */
  useCount: number;
  /** Denormalized count of users who signed up via this code. */
  signupCount: number;
  /** Denormalized count of referred users who converted to paid subscription. */
  subscriptionCount: number;
  /** Soft delete — code remains reserved globally. */
  isDeleted: boolean;
  deletedAt?: Date;
}

/** Record of a referred user attributing signup to a referral code. */
export interface ReferralAttributionDocument extends BaseDocument {
  /** Referrer account id (code owner). */
  referrerId: ObjectId;
  /** Referred account id. */
  referredUserId: ObjectId;
  /** Referral code document id at time of attribution. */
  referralCodeId: ObjectId;
  /** Code string snapshot at redemption time. */
  code: string;
  attributedAt: Date;
  /** Whether the referrer has received credit for this referral. */
  creditGranted: boolean;
  creditGrantedAt?: Date;
  /** Credit amount in cents applied to referrer (audit). */
  creditAmountCents?: number;
  /**
   * True when the referred user's first subscription activity was promo-driven
   * and credit is deferred until a real payment invoice succeeds.
   */
  promoBlockedCredit: boolean;
}
