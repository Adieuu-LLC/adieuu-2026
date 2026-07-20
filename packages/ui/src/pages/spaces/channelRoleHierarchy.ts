/**
 * Discord-style role hierarchy helpers for channel ACL pickers.
 * Lower `position` = higher in hierarchy (Admin seeds at 0).
 */

import type { PublicSpaceRole } from '@adieuu/shared';

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

/** Roles at or below the actor (position >= top). */
export function rolesAtOrBelowHierarchy(
  roles: readonly PublicSpaceRole[],
  topPosition: number,
): PublicSpaceRole[] {
  return roles.filter((r) => r.position >= topPosition);
}

export function findEveryoneRole(
  roles: readonly PublicSpaceRole[],
): PublicSpaceRole | undefined {
  return roles.find((r) => r.isDefaultMember || r.systemKey === 'member');
}
