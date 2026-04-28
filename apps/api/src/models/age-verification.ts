/**
 * Age verification attempt document.
 * Tracks individual verification sessions with the provider.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export type AgeVerificationAttemptStatus =
  | 'started'
  | 'pending'
  | 'approved'
  | 'failed'
  | 'expired';

export interface AgeVerificationDocument extends BaseDocument {
  userId: ObjectId;
  providerId: string;
  providerVerificationId: string;
  status: AgeVerificationAttemptStatus;
  jurisdiction: string;
  /** The method we requested via the `method` param. */
  requestedMethod?: string;
  /** The method that ultimately approved (from provider response). */
  approvalMethod?: string;
  /** Background check type performed ('email' | 'mobile' | 'full' | null). */
  backgroundCheck?: string | null;
  startedAt: Date;
  /** Provider-reported expiration (e.g. 6-hour window). */
  expiresAt?: Date;
  completedAt?: Date;
  /** The hosted verification URL returned by the provider (reusable until expiry). */
  redirectUrl?: string;
  /** Whether this verification was user-initiated via opt-in. */
  optedIn: boolean;
}
