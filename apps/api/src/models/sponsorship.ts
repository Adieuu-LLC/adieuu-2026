/**
 * Sponsorship models.
 *
 * SponsorshipRequestDocument — public directory entries posted by users
 * requesting subscription sponsorship from the community.
 *
 * SponsorshipLogDocument — audit trail of fulfilled sponsorships.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { PurchasableProductId, SubscriptionTierId } from '@adieuu/shared';

export type SponsorshipRequestStatus = 'active' | 'fulfilled' | 'withdrawn';

/**
 * A sponsorship request posted to the public directory.
 * One request per account (enforced by unique index on userId).
 */
export interface SponsorshipRequestDocument extends BaseDocument {
  /** Requester's account ObjectId. */
  userId: ObjectId;
  /** Display first name (consented by user). */
  firstName: string;
  /** Display last initial (consented by user). */
  lastInitial: string;
  /** Jurisdiction from user.geo at time of request. */
  jurisdiction: string;
  /** Optional freeform message (max 280 chars). */
  message?: string;
  /** Optional plan preference indicated by the requester. */
  preferredProduct?: PurchasableProductId;
  /** Current status of the request. */
  status: SponsorshipRequestStatus;
  /** Sponsor's account ObjectId (set on fulfillment). */
  sponsorUserId?: ObjectId;
  /** Whether the sponsor opted to reveal their identity to the beneficiary. */
  sponsorRevealed?: boolean;
  /** Sponsor's first name (only stored when revealed). */
  sponsorFirstName?: string;
  /** Sponsor's last initial (only stored when revealed). */
  sponsorLastInitial?: string;
  /** Product the sponsor purchased for the beneficiary. */
  fulfilledProduct?: PurchasableProductId;
  /** When the sponsorship was fulfilled. */
  fulfilledAt?: Date;
  /** Stripe checkout session ID for audit. */
  stripeSessionId?: string;
}

/**
 * Audit log entry for a completed sponsorship.
 */
export interface SponsorshipLogDocument extends BaseDocument {
  /** Beneficiary's account ObjectId. */
  recipientUserId: ObjectId;
  /** Sponsor's account ObjectId. */
  sponsorUserId: ObjectId;
  /** Stripe checkout session ID. */
  sponsorStripeSessionId: string;
  /** Purchasable product that was bought. */
  product: PurchasableProductId;
  /** Effective tier granted. */
  tier: SubscriptionTierId;
  /** When the grant was applied. */
  grantedAt: Date;
  /** When the override expires (undefined for lifetime). */
  expiresAt?: Date;
  /** Reference to the fulfilled sponsorship request. */
  requestId: ObjectId;
}
