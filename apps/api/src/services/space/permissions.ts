/**
 * Space permission resolver.
 *
 * A member's effective permissions are the union of the permissions across all
 * roles they hold. The system Admin role always contributes the current full
 * catalog (`DEFAULT_ADMIN_PERMISSIONS`) so catalog growth applies to existing
 * Spaces without a DB migration. `isAdmin` means the member holds that role.
 *
 * @module services/space/permissions
 */

import type { ObjectId } from 'mongodb';
import {
  DEFAULT_ADMIN_PERMISSIONS,
  normalizeSpacePermissions,
  type SpacePermission,
} from '@adieuu/shared';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';

export interface SpaceMemberPermissions {
  /** True when the identity is an active member of the Space. */
  isMember: boolean;
  /** Union of permissions across the member's roles. */
  permissions: ReadonlySet<SpacePermission>;
  /** Convenience flag: holds the system Admin role. */
  isAdmin: boolean;
  /** The member's role ids (empty when not a member). */
  roleIds: ObjectId[];
}

const EMPTY_PERMISSIONS: SpaceMemberPermissions = {
  isMember: false,
  permissions: new Set(),
  isAdmin: false,
  roleIds: [],
};

/**
 * Resolves the effective permission set for an identity within a Space.
 * Returns a non-member result when the identity has no active membership.
 */
export async function resolveMemberPermissions(
  spaceId: ObjectId,
  identityId: ObjectId,
): Promise<SpaceMemberPermissions> {
  const member = await getSpaceMemberRepository().findMember(spaceId, identityId);
  if (!member || member.status !== 'active') {
    return EMPTY_PERMISSIONS;
  }

  const roles = await getSpaceRoleRepository().findBySpace(spaceId);
  const roleById = new Map(roles.map((r) => [r._id.toHexString(), r]));

  const permissions = new Set<SpacePermission>();
  let isAdmin = false;
  for (const roleId of member.roleIds) {
    const role = roleById.get(roleId.toHexString());
    if (!role) continue;
    if (role.systemKey === 'admin') {
      isAdmin = true;
      for (const perm of DEFAULT_ADMIN_PERMISSIONS) {
        permissions.add(perm);
      }
      continue;
    }
    for (const perm of normalizeSpacePermissions(role.permissions)) {
      permissions.add(perm);
    }
  }

  return {
    isMember: true,
    permissions,
    isAdmin,
    roleIds: member.roleIds,
  };
}

/**
 * Whether a resolved member holds a given permission.
 */
export function memberHasPermission(
  perms: SpaceMemberPermissions,
  permission: SpacePermission,
): boolean {
  return perms.permissions.has(permission);
}

/** Whether the member can open the Space Manage UI shell. */
export function memberCanAccessManageUi(perms: SpaceMemberPermissions): boolean {
  return (
    memberHasPermission(perms, 'manageMetadata') ||
    memberHasPermission(perms, 'manageRoles') ||
    memberHasPermission(perms, 'manageEncryption') ||
    memberHasPermission(perms, 'manageWebhooks')
  );
}
