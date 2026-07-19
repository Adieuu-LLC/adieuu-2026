/**
 * Shared result and payload types for the Space service layer.
 *
 * @module services/space/types
 */

import type {
  CipherCheck,
  PublicSpace,
  PublicSpaceChannel,
  PublicSpaceInvite,
  PublicSpaceMember,
  PublicSpaceMessage,
  PublicSpaceReaction,
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
  | 'MEMBER_NOT_FOUND'
  | 'NOT_AUTHORIZED'
  | 'INVITE_NOT_FOUND'
  | 'INVITE_EXISTS'
  | 'INVITE_NOT_PENDING'
  | 'IDENTITY_NOT_FOUND'
  | 'CANNOT_INVITE_SELF'
  | 'CHANNEL_NOT_FOUND'
  | 'ENCRYPTION_NOT_SUPPORTED'
  | 'INVALID_CONTENT'
  | 'MESSAGE_NOT_FOUND'
  | 'NOT_AUTHOR'
  | 'MAX_EDITS_REACHED'
  | 'MESSAGE_DELETED'
  | 'INVALID_REPLY_TARGET'
  | 'REACTION_EXISTS'
  | 'REACTION_NOT_FOUND'
  | 'EDIT_CONFLICT'
  | 'ALREADY_PINNED'
  | 'PIN_NOT_FOUND';

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

/** Result of a single-invite operation (create, accept, decline, revoke). */
export interface SpaceInviteResult {
  success: boolean;
  invite?: PublicSpaceInvite;
  error?: string;
  errorCode?: SpaceErrorCode;
}

/** Result of listing Space invites (identity inbox or a Space's pending set). */
export interface SpaceInvitesListResult {
  success: boolean;
  invites?: PublicSpaceInvite[];
  cursor?: string | null;
  error?: string;
  errorCode?: SpaceErrorCode;
}

/** Result of listing a Space's channels. */
export interface SpaceChannelsResult {
  success: boolean;
  channels?: PublicSpaceChannel[];
  error?: string;
  errorCode?: SpaceErrorCode;
}

/** Result of sending a single channel message. */
export interface SpaceMessageResult {
  success: boolean;
  message?: PublicSpaceMessage;
  error?: string;
  errorCode?: SpaceErrorCode;
}

/** Result of listing channel messages (newest first, cursor-paginated). */
export interface SpaceMessagesListResult {
  success: boolean;
  messages?: PublicSpaceMessage[];
  cursor?: string | null;
  /** True when more messages exist toward the present than the returned page. */
  hasNewerPages?: boolean;
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
  /**
   * Blind-relay challenge when associating a Community Cipher (E2EE and/or
   * cipher-required join). Never for `public`.
   */
  cipherCheck?: CipherCheck;
  /** Content encryption; requires `cipherCheck`. */
  e2ee?: boolean;
  /** Client join gate; requires `cipherCheck`. */
  cipherRequired?: boolean;
  /** Optional client-generated ObjectId (24 hex) so the cipher challenge binds the final id. */
  id?: string;
}

export interface SpaceListPayload {
  spaces: PublicSpace[];
  cursor: string | null;
}

/** Result of a reaction operation. */
export interface SpaceReactionResult {
  success: boolean;
  reaction?: PublicSpaceReaction;
  error?: string;
  errorCode?: SpaceErrorCode;
}

/** Result of listing reactions. */
export interface SpaceReactionsListResult {
  success: boolean;
  reactions?: PublicSpaceReaction[];
  error?: string;
  errorCode?: SpaceErrorCode;
}

/** Result of a pin operation. */
export interface SpacePinResult {
  success: boolean;
  error?: string;
  errorCode?: SpaceErrorCode;
}

/** Result of listing pinned messages. */
export interface SpacePinnedMessagesResult {
  success: boolean;
  messages?: (PublicSpaceMessage | null)[];
  cursor?: string | null;
  error?: string;
  errorCode?: SpaceErrorCode;
}
