/**
 * Recognition helpers for seeded Space system roles.
 *
 * Newer Spaces persist `systemKey: 'everyone'`. Older seeds used
 * `systemKey: 'member'` or only `isSystem` + name (and Admin often carried a
 * legacy `"admin"` permission string).
 *
 * @module api/space-system-roles
 */

/** System role key stored on seeded Admin/Everyone roles. */
export type SpaceRoleSystemKey = 'admin' | 'everyone';

/** System role names seeded with every new Space (plaintext labels for client encrypt). */
export const DEFAULT_ADMIN_ROLE_NAME = 'Admin';
export const DEFAULT_MEMBER_ROLE_NAME = 'Everyone';

/** Fields used to recognize seeded system roles (including pre-systemKey docs). */
export interface SpaceSystemRoleLike {
  systemKey?: string | null;
  isSystem?: boolean;
  isDefaultMember?: boolean;
  name?: string | null;
  /** Raw permission strings; may include the legacy `"admin"` flag. */
  permissions?: readonly string[] | null;
}

/**
 * Resolve the seeded system identity for a role document.
 *
 * Always returns the canonical keys (`admin` / `everyone`). Legacy
 * `systemKey: 'member'` maps to `everyone`.
 */
export function resolveSpaceRoleSystemKey(
  role: SpaceSystemRoleLike,
): SpaceRoleSystemKey | undefined {
  if (role.systemKey === 'admin') return 'admin';
  if (role.systemKey === 'everyone' || role.systemKey === 'member') return 'everyone';
  if (!role.isSystem) return undefined;

  const name = (role.name ?? '').trim();
  if (name === DEFAULT_ADMIN_ROLE_NAME) return 'admin';
  if (name === DEFAULT_MEMBER_ROLE_NAME || name === 'Member') return 'everyone';
  if (role.permissions?.includes('admin')) return 'admin';
  if (role.isDefaultMember) return 'everyone';
  return undefined;
}

/** System Admin role — holders bypass role-hierarchy gates and get the full catalog. */
export function isSpaceAdminRole(role: SpaceSystemRoleLike): boolean {
  return resolveSpaceRoleSystemKey(role) === 'admin';
}

/** System Everyone role — always held; never listed for assignment/membership display. */
export function isSpaceEveryoneRole(role: SpaceSystemRoleLike): boolean {
  return resolveSpaceRoleSystemKey(role) === 'everyone';
}
