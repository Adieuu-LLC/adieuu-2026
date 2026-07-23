/**
 * Space audit log model.
 *
 * Separate from platform `audit_logs`: records Space moderation/management
 * actions for the Space Manage audit UI. Documents store real ObjectIds
 * (not hashed identifiers); metadata must not include ciphertext.
 */

import type { ObjectId } from 'mongodb';
import type { PublicSpaceAuditEntry, SpaceAuditAction } from '@adieuu/shared';
import type { BaseDocument } from './base';

export type { SpaceAuditAction };

export interface SpaceAuditLogDocument extends BaseDocument {
  spaceId: ObjectId;
  actorIdentityId: ObjectId;
  action: SpaceAuditAction;
  targetIdentityId?: ObjectId;
  targetId?: ObjectId;
  channelId?: ObjectId;
  metadata?: Record<string, unknown>;
}

export interface CreateSpaceAuditLogInput {
  spaceId: ObjectId;
  actorIdentityId: ObjectId;
  action: SpaceAuditAction;
  targetIdentityId?: ObjectId;
  targetId?: ObjectId;
  channelId?: ObjectId;
  metadata?: Record<string, unknown>;
}

export function toPublicSpaceAuditEntry(doc: SpaceAuditLogDocument): PublicSpaceAuditEntry {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    actorIdentityId: doc.actorIdentityId.toHexString(),
    action: doc.action,
    ...(doc.targetIdentityId ? { targetIdentityId: doc.targetIdentityId.toHexString() } : {}),
    ...(doc.targetId ? { targetId: doc.targetId.toHexString() } : {}),
    ...(doc.channelId ? { channelId: doc.channelId.toHexString() } : {}),
    ...(doc.metadata ? { metadata: doc.metadata } : {}),
    createdAt: doc.createdAt.toISOString(),
  };
}
