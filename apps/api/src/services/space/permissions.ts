/**
 * Space permission resolver.
 *
 * A member's effective permissions are the union of the permissions across all
 * roles they hold. The `admin` permission is a super-permission that implies
 * every other permission (checked via {@link memberHasPermission}).
 *
 * This is the authoritative authz primitive for Space actions (member
 * management now; channels, invites, and settings in later phases).
 *
 * @module services/space/permissions
 */

import type { ObjectId } from 'mongodb';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import type { SpacePermission } from '@adieuu/shared';

export interface SpaceMemberPermissions {
  /** True when the identity is an active member of the Space. */
  isMember: boolean;
  /** Union of permissions across the member's roles. */
  permissions: ReadonlySet<SpacePermission>;
  /** Convenience flag: holds the `admin` super-permission. */
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
  for (const roleId of member.roleIds) {
    const role = roleById.get(roleId.toHexString());
    if (!role) continue;
    for (const perm of role.permissions) {
      permissions.add(perm);
    }
  }

  return {
    isMember: true,
    permissions,
    isAdmin: permissions.has('admin'),
    roleIds: member.roleIds,
  };
}

/**
 * Whether a resolved member holds a given permission. `admin` implies all.
 */
export function memberHasPermission(
  perms: SpaceMemberPermissions,
  permission: SpacePermission,
): boolean {
  return perms.isAdmin || perms.permissions.has(permission);
}
