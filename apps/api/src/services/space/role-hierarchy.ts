/**
 * Role-position hierarchy helpers.
 *
 * Positions are ascending: lower `position` = higher rank (system Admin seeds
 * at 0, the default Member role at 1000). Non-admin moderators may only act
 * on roles ranked strictly below their own highest role, and may only
 * kick/ban members they strictly outrank.
 *
 * @module services/space/role-hierarchy
 */

import type { ObjectId } from 'mongodb';

interface PositionedRole {
  _id: ObjectId;
  position?: number;
}

/**
 * Lowest role position among held roles (lower = higher rank), or null when
 * the member holds no known roles.
 */
export function topRolePosition(
  roleIds: readonly ObjectId[],
  roles: readonly PositionedRole[],
): number | null {
  const held = new Set(roleIds.map((id) => id.toHexString()));
  let top: number | null = null;
  for (const role of roles) {
    if (!held.has(role._id.toHexString())) continue;
    const position = role.position ?? 0;
    if (top === null || position < top) top = role.position ?? 0;
  }
  return top;
}

/**
 * Whether a non-admin actor whose highest role sits at `actorTop` may manage
 * (create at / move to / edit / delete / assign / remove) a role at
 * `rolePosition`. Only roles ranked strictly below the actor qualify.
 */
export function canActOnRolePosition(
  actorTop: number | null,
  rolePosition: number,
): boolean {
  if (actorTop === null) return false;
  return rolePosition > actorTop;
}

/**
 * Whether the actor strictly outranks the target member. Targets with no
 * ranked roles are always outranked; actors with no ranked roles never
 * outrank anyone.
 */
export function actorOutranksMember(
  actorTop: number | null,
  targetTop: number | null,
): boolean {
  if (targetTop === null) return actorTop !== null;
  if (actorTop === null) return false;
  return actorTop < targetTop;
}
