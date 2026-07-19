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
  /** Plaintext name; empty when the Space is e2ee. */
  name: string;
  permissions: SpacePermission[];
  /** Cipher-encrypted name when the Space is e2ee. */
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
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
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
}

export function toPublicSpaceRole(doc: SpaceRoleDocument): PublicSpaceRole {
  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    name: doc.name,
    permissions: doc.permissions,
    ...(doc.encryptedName
      ? {
          encryptedName: doc.encryptedName,
          nameNonce: doc.nameNonce,
          cipherId: doc.cipherId,
        }
      : {}),
    isDefaultMember: doc.isDefaultMember,
    isSystem: doc.isSystem,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
