/**
 * Space role model
 * Roles carry permission flags, display settings, and optional system keys.
 * Every Space seeds Admin (all permissions) and Everyone (default member perms).
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import {
  DEFAULT_CUSTOM_ROLE_COLOR,
  DEFAULT_MEMBER_ROLE_NAME,
  normalizeSpacePermissions,
  type PublicSpaceRole,
  type SpacePermission,
  type SpaceRoleSystemKey,
} from '@adieuu/shared';

export interface SpaceRoleDocument extends BaseDocument {
  spaceId: ObjectId;
  /** Plaintext name; empty when the Space is e2ee. */
  name: string;
  permissions: SpacePermission[];
  /** Hex color for role display. */
  color: string;
  /** When true, members with this role are listed in a separate online group. */
  displaySeparately: boolean;
  /** When true, anyone in the Space may mention this role. */
  mentionable: boolean;
  /** Sort order in Manage UI (lower = higher). */
  position: number;
  /** Cipher-encrypted name when the Space is e2ee. */
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  /** The role auto-assigned to new members. */
  isDefaultMember: boolean;
  /** System roles (Admin/Member) cannot be deleted. */
  isSystem: boolean;
  /** Seeded system role identity. */
  systemKey?: SpaceRoleSystemKey;
}

export interface CreateSpaceRoleInput {
  spaceId: ObjectId;
  name: string;
  permissions: SpacePermission[];
  color?: string;
  displaySeparately?: boolean;
  mentionable?: boolean;
  position?: number;
  isDefaultMember?: boolean;
  isSystem?: boolean;
  systemKey?: SpaceRoleSystemKey;
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
}

export function toPublicSpaceRole(doc: SpaceRoleDocument): PublicSpaceRole {
  // Legacy seed name for the default system role was "Member".
  const legacyMemberName =
    doc.systemKey === 'member' && !doc.encryptedName && doc.name === 'Member'
      ? DEFAULT_MEMBER_ROLE_NAME
      : doc.name;

  return {
    id: doc._id.toHexString(),
    spaceId: doc.spaceId.toHexString(),
    name: legacyMemberName,
    permissions: normalizeSpacePermissions(doc.permissions),
    color: doc.color || DEFAULT_CUSTOM_ROLE_COLOR,
    displaySeparately: doc.displaySeparately ?? false,
    mentionable: doc.mentionable ?? false,
    position: doc.position ?? 0,
    ...(doc.encryptedName
      ? {
          encryptedName: doc.encryptedName,
          nameNonce: doc.nameNonce,
          cipherId: doc.cipherId,
        }
      : {}),
    isDefaultMember: doc.isDefaultMember,
    isSystem: doc.isSystem,
    ...(doc.systemKey ? { systemKey: doc.systemKey } : {}),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
