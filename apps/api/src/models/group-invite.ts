/**
 * Group invite model
 * Represents a pending invitation for an identity to join a group conversation.
 *
 * Created when adding a member whose identity has requireGroupApproval enabled.
 * The invited identity can accept or decline.
 *
 * PRIVACY NOTE: Group invites are identity-scoped and never leak User identity.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

export type GroupInviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

/**
 * Group invite document stored in MongoDB
 */
export interface GroupInviteDocument extends BaseDocument {
  /** The conversation being invited to */
  conversationId: ObjectId;

  /** Identity being invited */
  invitedIdentityId: ObjectId;

  /** Identity that sent the invite */
  invitedByIdentityId: ObjectId;

  /** Current status of the invite */
  status: GroupInviteStatus;

  /** Group name at time of invite (plaintext snippet for the invite UI) */
  groupName?: string;

  /** Whether the group has a name (without revealing the name itself) */
  hasGroupName?: boolean;

  /** Number of members at time of invite */
  memberCount: number;
}

/**
 * Input for creating a group invite
 */
export interface CreateGroupInviteInput {
  conversationId: ObjectId;
  invitedIdentityId: ObjectId;
  invitedByIdentityId: ObjectId;
  groupName?: string;
  hasGroupName?: boolean;
  memberCount: number;
}

/**
 * Public group invite representation (safe to send to client)
 */
export interface PublicGroupInvite {
  id: string;
  conversationId: string;
  invitedIdentityId: string;
  invitedByIdentityId: string;
  status: GroupInviteStatus;
  groupName?: string;
  hasGroupName?: boolean;
  memberCount: number;
  createdAt: string;
}

/**
 * Convert a GroupInviteDocument to PublicGroupInvite (safe for client)
 */
export function toPublicGroupInvite(doc: GroupInviteDocument): PublicGroupInvite {
  return {
    id: doc._id.toHexString(),
    conversationId: doc.conversationId.toHexString(),
    invitedIdentityId: doc.invitedIdentityId.toHexString(),
    invitedByIdentityId: doc.invitedByIdentityId.toHexString(),
    status: doc.status,
    groupName: doc.groupName,
    hasGroupName: doc.hasGroupName,
    memberCount: doc.memberCount,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Member preview for a group invite (safe to send to invited identity)
 */
export interface GroupInvitePreviewMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  isAdmin: boolean;
}

/**
 * Group preview returned for a pending invite.
 * Only accessible to the invited identity while the invite is pending.
 */
export interface GroupInvitePreview {
  inviteId: string;
  conversationId: string;
  groupName?: string;
  hasGroupName?: boolean;
  memberCount: number;
  members: GroupInvitePreviewMember[];
  invitedMembers: GroupInvitePreviewMember[];
  invitedBy: GroupInvitePreviewMember;
  createdAt: string;
}
