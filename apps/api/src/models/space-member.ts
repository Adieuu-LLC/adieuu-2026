/**
 * Space member model
 * One document per (space, identity). Membership is a dedicated collection
 * (not an embedded array) so a Space can scale to any number of members.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { ModerationSpaceMember, PublicSpaceMember, SpaceMemberStatus } from '@adieuu/shared';

export interface SpaceMemberDocument extends BaseDocument {
  spaceId: ObjectId;
  identityId: ObjectId;
  /** Roles held by this member within the Space. */
  roleIds: ObjectId[];
  status: SpaceMemberStatus;
  joinedAt: Date;
  /** Space-scoped display nickname (plaintext). */
  nickname?: string;
  /** Space-scoped display colour (hex). */
  color?: string;
  banReason?: string;
  bannedAt?: Date;
  /** When set, ban ends at this time; null means permanent. */
  banExpiresAt?: Date | null;
}

export interface CreateSpaceMemberInput {
  spaceId: ObjectId;
  identityId: ObjectId;
  roleIds: ObjectId[];
  status?: SpaceMemberStatus;
  joinedAt?: Date;
}

/**
 * Public serializer. Deliberately excludes `banReason`/`bannedAt` — the reason
 * is a moderator note and must not be shown to the banned user or other
 * members. `banExpiresAt` stays so a banned user can see when the ban ends.
 */
export function toPublicSpaceMember(doc: SpaceMemberDocument): PublicSpaceMember {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    identityId: doc.identityId.toHexString(),
    roleIds: doc.roleIds.map((r) => r.toHexString()),
    status: doc.status,
    joinedAt: doc.joinedAt.toISOString(),
    ...(doc.nickname ? { nickname: doc.nickname } : {}),
    ...(doc.color ? { color: doc.color } : {}),
    ...(doc.status === 'banned'
      ? { banExpiresAt: doc.banExpiresAt ? doc.banExpiresAt.toISOString() : null }
      : {}),
  };
}

/**
 * Moderation serializer: public shape plus ban details. Only for responses
 * gated by `banMembers`/`admin` permissions.
 */
export function toModerationSpaceMember(doc: SpaceMemberDocument): ModerationSpaceMember {
  return {
    ...toPublicSpaceMember(doc),
    ...(doc.banReason ? { banReason: doc.banReason } : {}),
    ...(doc.bannedAt ? { bannedAt: doc.bannedAt.toISOString() } : {}),
  };
}
