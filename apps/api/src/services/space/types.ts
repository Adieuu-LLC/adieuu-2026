/**
 * Shared result and payload types for the Space service layer.
 *
 * @module services/space/types
 */

import type {
  CipherCheck,
  PublicSpace,
  PublicSpaceMember,
  PublicSpaceRole,
  SpaceVisibility,
  SubscriptionTierId,
} from '@adieuu/shared';

/** Billing context used to enforce the paid-creation gate and join tier checks. */
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
  | 'NOT_MEMBER'
  | 'ALREADY_MEMBER'
  | 'INVITE_REQUIRED'
  | 'FORBIDDEN'
  | 'OWNER_CANNOT_LEAVE'
  | 'CANNOT_REMOVE_OWNER'
  | 'MEMBER_NOT_FOUND';

export interface SpaceResult {
  success: boolean;
  space?: PublicSpace;
  error?: string;
  errorCode?: SpaceErrorCode;
}

/** Result of a single-member operation (join, or fetching one membership). */
export interface SpaceMemberResult {
  success: boolean;
  member?: PublicSpaceMember;
  error?: string;
  errorCode?: SpaceErrorCode;
}

/** Result of a member-mutating action with no returned entity (leave, remove). */
export interface SpaceActionResult {
  success: boolean;
  error?: string;
  errorCode?: SpaceErrorCode;
}

/** Result of listing a Space's members (cursor-paginated). */
export interface SpaceMembersListResult {
  success: boolean;
  members?: PublicSpaceMember[];
  cursor?: string | null;
  error?: string;
  errorCode?: SpaceErrorCode;
}

/** Result of listing a Space's roles. */
export interface SpaceRolesResult {
  success: boolean;
  roles?: PublicSpaceRole[];
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
