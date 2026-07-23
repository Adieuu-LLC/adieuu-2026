/**
 * Discord-style role hierarchy helpers for channel ACL pickers.
 * Lower `position` = higher in hierarchy (Admin seeds at 0).
 */

import { isSpaceEveryoneRole, type PublicSpaceRole } from '@adieuu/shared';

/** Lowest position among held roles, or null when none match. */
export function actorTopRolePosition(
  heldRoleIds: readonly string[],
  roles: readonly PublicSpaceRole[],
): number | null {
  const held = new Set(heldRoleIds);
  let top: number | null = null;
  for (const role of roles) {
    if (!held.has(role.id)) continue;
    if (top === null || role.position < top) top = role.position;
  }
  return top;
}

/** Roles at or below the actor (position >= top). Excludes Everyone. */
export function rolesAtOrBelowHierarchy(
  roles: readonly PublicSpaceRole[],
  topPosition: number,
): PublicSpaceRole[] {
  return roles.filter((r) => !isSpaceEveryoneRole(r) && r.position >= topPosition);
}

export function findEveryoneRole(
  roles: readonly PublicSpaceRole[],
): PublicSpaceRole | undefined {
  return roles.find((r) => isSpaceEveryoneRole(r))
    ?? roles.find((r) => r.isDefaultMember);
}

/**
 * Role ids for the ACL picker UI. If the allowlist includes Everyone, the
 * channel/category is open to all members — show no specific roles.
 */
export function roleIdsForAclPicker(
  allowedRoleIds: readonly string[],
  roles: readonly PublicSpaceRole[],
): string[] {
  const everyone = findEveryoneRole(roles);
  if (everyone && allowedRoleIds.includes(everyone.id)) return [];
  return allowedRoleIds.filter((id) => id !== everyone?.id);
}
