/**
 * Space role model
 * Roles carry permission flags. The first pass seeds two system roles per
 * Space: Admin (all permissions) and Member (read + post). Full RBAC/ABAC
 * (custom roles, attributes) is a later pass.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { PublicSpaceRole, SpacePermission } from '@adieuu/shared';

export interface SpaceRoleDocument extends BaseDocument {
  spaceId: ObjectId;
  name: string;
  permissions: SpacePermission[];
  /** The role auto-assigned to new members. */
  isDefaultMember: boolean;
  /** System roles (Admin/Member) cannot be deleted. */
  isSystem: boolean;
}

export interface CreateSpaceRoleInput {
  spaceId: ObjectId;
  name: string;
  permissions: SpacePermission[];
  isDefaultMember?: boolean;
  isSystem?: boolean;
}

export function toPublicSpaceRole(doc: SpaceRoleDocument): PublicSpaceRole {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    name: doc.name,
    permissions: doc.permissions,
    isDefaultMember: doc.isDefaultMember,
    isSystem: doc.isSystem,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
