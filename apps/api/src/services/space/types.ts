/**
 * Shared result and payload types for the Space service layer.
 *
 * @module services/space/types
 */

import type { CipherCheck, PublicSpace, SpaceVisibility, SubscriptionTierId } from '@adieuu/shared';

/** Billing context used to enforce the paid-creation gate. */
export interface SpaceBillingContext {
  subscriptions: readonly SubscriptionTierId[];
  entitlements?: readonly string[];
  isLifetime?: boolean;
}

export type SpaceErrorCode =
  | 'TIER_REQUIRED'
  | 'SLUG_RESERVED'
  | 'SLUG_TAKEN'
  | 'INVALID_ENCRYPTION'
  | 'INVALID_ID'
  | 'SPACE_NOT_FOUND'
  | 'NOT_MEMBER';

export interface SpaceResult {
  success: boolean;
  space?: PublicSpace;
  error?: string;
  errorCode?: SpaceErrorCode;
}

/** Sanitized/validated inputs for creating a Space (from the controller). */
export interface CreateSpaceServiceParams {
  slug: string;
  name: string;
  description?: string;
  visibility: SpaceVisibility;
  allowFreeMembers?: boolean;
  /** Present only for E2EE Spaces (never for `public`). */
  cipherCheck?: CipherCheck;
  /** Optional client-generated ObjectId (24 hex) so the cipher challenge binds the final id. */
  id?: string;
}

export interface SpaceListPayload {
  spaces: PublicSpace[];
  cursor: string | null;
}
