/**
 * Space invite model
 * Represents a pending invitation for an identity to join a Space. Mirrors the
 * group-conversation invite flow (accept / decline / revoke).
 *
 * PRIVACY NOTE: Space invites are identity-scoped and never leak User identity.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { PublicSpaceInvite, SpaceInviteStatus } from '@adieuu/shared';

export interface SpaceInviteDocument extends BaseDocument {
  spaceId: ObjectId;
  invitedIdentityId: ObjectId;
  invitedByIdentityId: ObjectId;
  status: SpaceInviteStatus;
  /** Space name/slug snapshots for the invite UI. */
  spaceName?: string;
  spaceSlug?: string;
  /** Member count at time of invite. */
  memberCount: number;
}

export interface CreateSpaceInviteInput {
  spaceId: ObjectId;
  invitedIdentityId: ObjectId;
  invitedByIdentityId: ObjectId;
  spaceName?: string;
  spaceSlug?: string;
  memberCount: number;
}

export function toPublicSpaceInvite(doc: SpaceInviteDocument): PublicSpaceInvite {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    invitedIdentityId: doc.invitedIdentityId.toHexString(),
    invitedByIdentityId: doc.invitedByIdentityId.toHexString(),
    status: doc.status,
    ...(doc.spaceName ? { spaceName: doc.spaceName } : {}),
    ...(doc.spaceSlug ? { spaceSlug: doc.spaceSlug } : {}),
    memberCount: doc.memberCount,
    createdAt: doc.createdAt.toISOString(),
  };
}
