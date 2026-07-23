/**
 * Space role CRUD (`manageRoles`) and member role assignment (`manageMemberRoles`).
 *
 * Assignment (`setMemberRoles`) requires `manageMemberRoles` or `manageRoles`:
 * - `manageMemberRoles` only: next role-set permissions must be ⊆ actor's
 * - `manageRoles`: may assign any role except system Admin (unless actor is Admin)
 *
 * System roles cannot be deleted. The Space must retain at least one Admin holder.
 *
 * @module services/space/roles
 */

import { ObjectId } from 'mongodb';
import {
  DEFAULT_CUSTOM_ROLE_COLOR,
  DEFAULT_MEMBER_ROLE_NAME,
  isSpaceAdminRole,
  isSpaceEveryoneRole,
  normalizeSpacePermissions,
  spacePermissionsSubsetOf,
  type PublicSpaceMember,
  type PublicSpaceRole,
  type SpacePermission,
} from '@adieuu/shared';
import { isValidObjectId } from '../../utils';
import { toPublicSpaceRole } from '../../models/space-role';
import { toPublicSpaceMember } from '../../models/space-member';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import { resolveMemberPermissions, memberHasPermission } from './permissions';
import { canActOnRolePosition, topRolePosition } from './role-hierarchy';
import { canReadSpace } from './access';
import { assertNotLastAdmin } from './last-admin';
import { recordSpaceAudit } from './audit';
import type { SpaceActionResult, SpaceErrorCode, SpaceMemberResult, SpaceRolesResult } from './types';

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export interface SpaceRoleResult {
  success: boolean;
  role?: PublicSpaceRole;
  error?: string;
  errorCode?: SpaceErrorCode;
}

export interface CreateSpaceRoleParams {
  name?: string;
  permissions?: readonly string[];
  color?: string;
  displaySeparately?: boolean;
  mentionable?: boolean;
  position?: number;
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
}

export interface UpdateSpaceRoleParams {
  name?: string;
  permissions?: readonly string[];
  color?: string;
  displaySeparately?: boolean;
  mentionable?: boolean;
  isDefaultMember?: boolean;
  position?: number;
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
}

async function requireManageRoles(
  spaceId: ObjectId,
  actingId: ObjectId,
): Promise<
  | { ok: true; actorPerms: Awaited<ReturnType<typeof resolveMemberPermissions>> }
  | { ok: false; error: string; errorCode: SpaceErrorCode }
> {
  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { ok: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }
  const actorPerms = await resolveMemberPermissions(spaceId, actingId);
  if (!actorPerms.isMember) {
    return { ok: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }
  if (!memberHasPermission(actorPerms, 'manageRoles')) {
    return {
      ok: false,
      error: 'You do not have permission to manage roles.',
      errorCode: 'FORBIDDEN',
    };
  }
  return { ok: true, actorPerms };
}

async function requireAssignMemberRoles(
  spaceId: ObjectId,
  actingId: ObjectId,
): Promise<
  | { ok: true; actorPerms: Awaited<ReturnType<typeof resolveMemberPermissions>> }
  | { ok: false; error: string; errorCode: SpaceErrorCode }
> {
  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { ok: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }
  const actorPerms = await resolveMemberPermissions(spaceId, actingId);
  if (!actorPerms.isMember) {
    return { ok: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }
  const canAssign =
    memberHasPermission(actorPerms, 'manageMemberRoles') ||
    memberHasPermission(actorPerms, 'manageRoles');
  if (!canAssign) {
    return {
      ok: false,
      error: 'You do not have permission to assign member roles.',
      errorCode: 'FORBIDDEN',
    };
  }
  return { ok: true, actorPerms };
}

function validateColor(color: string | undefined): string | null {
  if (color === undefined) return null;
  if (!HEX_COLOR_RE.test(color)) return 'Invalid role color.';
  return null;
}

/**
 * Create a custom role. Requires `manageRoles`. Permissions must be a subset
 * of the actor's own permissions.
 */
export async function createSpaceRole(
  spaceIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  params: CreateSpaceRoleParams,
): Promise<SpaceRoleResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !actingId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const gate = await requireManageRoles(spaceId, actingId);
  if (!gate.ok) return { success: false, error: gate.error, errorCode: gate.errorCode };

  const colorError = validateColor(params.color);
  if (colorError) return { success: false, error: colorError, errorCode: 'INVALID_CONTENT' };

  const permissions = normalizeSpacePermissions(params.permissions ?? []);
  if (!spacePermissionsSubsetOf(permissions, [...gate.actorPerms.permissions])) {
    return {
      success: false,
      error: 'You cannot grant permissions you do not hold.',
      errorCode: 'ESCALATION',
    };
  }

  const space = await getSpaceRepository().findById(spaceId);
  const e2ee = !!space?.e2ee;
  const hasEncrypted =
    !!(params.encryptedName && params.nameNonce && params.cipherId);
  if (e2ee && !hasEncrypted && !params.name) {
    return {
      success: false,
      error: 'Encrypted role name is required.',
      errorCode: 'INVALID_CONTENT',
    };
  }

  const roles = await getSpaceRoleRepository().findBySpace(spaceId);
  const maxPosition = roles.reduce((max, r) => Math.max(max, r.position ?? 0), 0);

  // Non-admins may only create roles ranked strictly below their own top role.
  if (params.position !== undefined && !gate.actorPerms.isAdmin) {
    const actorTop = topRolePosition(gate.actorPerms.roleIds, roles);
    if (!canActOnRolePosition(actorTop, params.position)) {
      return {
        success: false,
        error: 'You cannot create a role at or above your own rank.',
        errorCode: 'ESCALATION',
      };
    }
  }

  const role = await getSpaceRoleRepository().createRole({
    spaceId,
    name: e2ee ? '' : (params.name?.trim() || 'New Role'),
    permissions,
    color: params.color ?? DEFAULT_CUSTOM_ROLE_COLOR,
    displaySeparately: params.displaySeparately ?? false,
    mentionable: params.mentionable ?? false,
    position: params.position ?? maxPosition + 1,
    ...(hasEncrypted
      ? {
          encryptedName: params.encryptedName,
          nameNonce: params.nameNonce,
          cipherId: params.cipherId,
        }
      : {}),
  });

  void recordSpaceAudit({
    spaceId,
    actorIdentityId: actingId,
    action: 'role_create',
    targetId: role._id,
  });
  return { success: true, role: toPublicSpaceRole(role) };
}

/**
 * Update a role's display settings and/or permissions.
 */
export async function updateSpaceRole(
  spaceIdRaw: string | ObjectId,
  roleIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  params: UpdateSpaceRoleParams,
): Promise<SpaceRoleResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const roleId = parseObjId(roleIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !roleId || !actingId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const gate = await requireManageRoles(spaceId, actingId);
  if (!gate.ok) return { success: false, error: gate.error, errorCode: gate.errorCode };

  const existing = await getSpaceRoleRepository().findByIdInSpace(spaceId, roleId);
  if (!existing) {
    return { success: false, error: 'Role not found.', errorCode: 'ROLE_NOT_FOUND' };
  }

  // Non-admins may only edit roles ranked strictly below their own top role,
  // and may not move a role to or above their own rank.
  if (!gate.actorPerms.isAdmin) {
    const roles = await getSpaceRoleRepository().findBySpace(spaceId);
    const actorTop = topRolePosition(gate.actorPerms.roleIds, roles);
    if (!canActOnRolePosition(actorTop, existing.position ?? 0)) {
      return {
        success: false,
        error: 'You cannot edit a role at or above your own rank.',
        errorCode: 'ESCALATION',
      };
    }
    if (params.position !== undefined && !canActOnRolePosition(actorTop, params.position)) {
      return {
        success: false,
        error: 'You cannot move a role to or above your own rank.',
        errorCode: 'ESCALATION',
      };
    }
  }

  const colorError = validateColor(params.color);
  if (colorError) return { success: false, error: colorError, errorCode: 'INVALID_CONTENT' };

  if (params.permissions !== undefined) {
    const permissions = normalizeSpacePermissions(params.permissions);
    if (!spacePermissionsSubsetOf(permissions, [...gate.actorPerms.permissions])) {
      return {
        success: false,
        error: 'You cannot grant permissions you do not hold.',
        errorCode: 'ESCALATION',
      };
    }
  }

  // Everyone is permanently the default join role; it cannot be cleared or transferred.
  if (params.isDefaultMember !== undefined) {
    if (isSpaceEveryoneRole(existing)) {
      if (params.isDefaultMember === false) {
        return {
          success: false,
          error: 'The Everyone role is always the default role for new members.',
          errorCode: 'INVALID_CONTENT',
        };
      }
      // no-op true → ignore below
    } else if (params.isDefaultMember === true) {
      return {
        success: false,
        error: 'The Everyone role is always the default role for new members.',
        errorCode: 'INVALID_CONTENT',
      };
    } else if (params.isDefaultMember === false && existing.isDefaultMember) {
      return {
        success: false,
        error: 'The Everyone role is always the default role for new members.',
        errorCode: 'INVALID_CONTENT',
      };
    }
  }

  const roleRepo = getSpaceRoleRepository();

  const updated = await roleRepo.updateRole(spaceId, roleId, {
    ...(params.name !== undefined ? { name: params.name.trim() } : {}),
    ...(params.permissions !== undefined
      ? { permissions: normalizeSpacePermissions(params.permissions) }
      : {}),
    ...(params.color !== undefined ? { color: params.color } : {}),
    ...(params.displaySeparately !== undefined
      ? { displaySeparately: params.displaySeparately }
      : {}),
    ...(params.mentionable !== undefined ? { mentionable: params.mentionable } : {}),
    // isDefaultMember is immutable (Everyone is permanently the default).
    ...(params.position !== undefined ? { position: params.position } : {}),
    ...(params.encryptedName !== undefined ? { encryptedName: params.encryptedName } : {}),
    ...(params.nameNonce !== undefined ? { nameNonce: params.nameNonce } : {}),
    ...(params.cipherId !== undefined ? { cipherId: params.cipherId } : {}),
  });

  if (!updated) {
    return { success: false, error: 'Role not found.', errorCode: 'ROLE_NOT_FOUND' };
  }
  void recordSpaceAudit({
    spaceId,
    actorIdentityId: actingId,
    action: 'role_update',
    targetId: roleId,
  });
  return { success: true, role: toPublicSpaceRole(updated) };
}

/**
 * Delete a role. System roles may be deleted only when no members hold them.
 */
export async function deleteSpaceRole(
  spaceIdRaw: string | ObjectId,
  roleIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
): Promise<SpaceActionResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const roleId = parseObjId(roleIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !roleId || !actingId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const gate = await requireManageRoles(spaceId, actingId);
  if (!gate.ok) return { success: false, error: gate.error, errorCode: gate.errorCode };

  const existing = await getSpaceRoleRepository().findByIdInSpace(spaceId, roleId);
  if (!existing) {
    return { success: false, error: 'Role not found.', errorCode: 'ROLE_NOT_FOUND' };
  }

  if (existing.isSystem || existing.systemKey) {
    return {
      success: false,
      error: 'System roles cannot be deleted.',
      errorCode: 'SYSTEM_ROLE',
    };
  }

  // Non-admins may only delete roles ranked strictly below their own top role.
  if (!gate.actorPerms.isAdmin) {
    const roles = await getSpaceRoleRepository().findBySpace(spaceId);
    const actorTop = topRolePosition(gate.actorPerms.roleIds, roles);
    if (!canActOnRolePosition(actorTop, existing.position ?? 0)) {
      return {
        success: false,
        error: 'You cannot delete a role at or above your own rank.',
        errorCode: 'ESCALATION',
      };
    }
  }

  const memberRepo = getSpaceMemberRepository();
  const holderCount = await memberRepo.countWithRole(spaceId, roleId);

  // Strip the role from all members before delete (no-op when already empty).
  if (holderCount > 0) {
    const members = await memberRepo.listByRole(spaceId, roleId, holderCount);
    for (const member of members) {
      await memberRepo.removeRole(spaceId, member.identityId, roleId);
    }
  }

  const deleted = await getSpaceRoleRepository().deleteRole(spaceId, roleId);
  if (!deleted) {
    return { success: false, error: 'Role not found.', errorCode: 'ROLE_NOT_FOUND' };
  }
  void recordSpaceAudit({
    spaceId,
    actorIdentityId: actingId,
    action: 'role_delete',
    targetId: roleId,
  });
  return { success: true };
}

/**
 * Replace a member's role set. Requires `manageMemberRoles` or `manageRoles`.
 * Always retains the default Member role when present. Protects the last Admin.
 */
export async function setMemberRoles(
  spaceIdRaw: string | ObjectId,
  targetIdentityIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  roleIdsRaw: readonly string[],
): Promise<SpaceMemberResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const targetId = parseObjId(targetIdentityIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !targetId || !actingId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const gate = await requireAssignMemberRoles(spaceId, actingId);
  if (!gate.ok) return { success: false, error: gate.error, errorCode: gate.errorCode };

  const memberRepo = getSpaceMemberRepository();
  const target = await memberRepo.findMember(spaceId, targetId);
  if (!target || target.status !== 'active') {
    return { success: false, error: 'That member was not found.', errorCode: 'MEMBER_NOT_FOUND' };
  }

  const roles = await getSpaceRoleRepository().findBySpace(spaceId);
  const roleById = new Map(roles.map((r) => [r._id.toHexString(), r]));
  const adminRole = roles.find((r) => isSpaceAdminRole(r));
  const defaultMember =
    roles.find((r) => isSpaceEveryoneRole(r)) ?? roles.find((r) => r.isDefaultMember);
  const actorCanManageRoles = memberHasPermission(gate.actorPerms, 'manageRoles');

  const nextIds: ObjectId[] = [];
  const seen = new Set<string>();
  for (const raw of roleIdsRaw) {
    const id = parseObjId(raw);
    if (!id) {
      return { success: false, error: 'Invalid role id.', errorCode: 'INVALID_ID' };
    }
    const hex = id.toHexString();
    if (seen.has(hex)) continue;
    if (!roleById.has(hex)) {
      return { success: false, error: 'Role not found.', errorCode: 'ROLE_NOT_FOUND' };
    }
    seen.add(hex);
    nextIds.push(id);
  }

  // Always keep the default Member role on every member.
  if (defaultMember && !seen.has(defaultMember._id.toHexString())) {
    nextIds.push(defaultMember._id);
    seen.add(defaultMember._id.toHexString());
  }

  // Last Admin protection + Admin grant gate (only system Admins may newly assign Admin).
  if (adminRole) {
    const hadAdmin = target.roleIds.some((id) => id.equals(adminRole._id));
    const willHaveAdmin = nextIds.some((id) => id.equals(adminRole._id));
    if (willHaveAdmin && !hadAdmin && !gate.actorPerms.isAdmin) {
      return {
        success: false,
        error: 'Only system admins can assign the Admin role.',
        errorCode: 'ESCALATION',
      };
    }
    if (hadAdmin && !willHaveAdmin) {
      const blocked = await assertNotLastAdmin(spaceId, targetId);
      if (blocked) return blocked;
    }
  }

  // Non-admins may only add or remove roles ranked strictly below their own
  // top role (newly granting Admin is additionally gated above).
  if (!gate.actorPerms.isAdmin) {
    const actorTop = topRolePosition(gate.actorPerms.roleIds, roles);
    const currentHexes = new Set(target.roleIds.map((id) => id.toHexString()));
    const nextHexes = new Set(nextIds.map((id) => id.toHexString()));
    const changedHexes = [
      ...[...nextHexes].filter((hex) => !currentHexes.has(hex)),
      ...[...currentHexes].filter((hex) => !nextHexes.has(hex)),
    ];
    for (const hex of changedHexes) {
      const role = roleById.get(hex);
      // Stale references to deleted roles are safe to drop.
      if (!role) continue;
      if (!canActOnRolePosition(actorTop, role.position ?? 0)) {
        return {
          success: false,
          error: 'You cannot change roles at or above your own rank.',
          errorCode: 'ESCALATION',
        };
      }
    }
  }

  // Without manageRoles, next role-set permissions must be ⊆ actor's.
  if (!actorCanManageRoles) {
    const granted = new Set<SpacePermission>();
    for (const id of nextIds) {
      const role = roleById.get(id.toHexString());
      if (!role) continue;
      for (const p of normalizeSpacePermissions(role.permissions)) granted.add(p);
    }
    if (!spacePermissionsSubsetOf([...granted], [...gate.actorPerms.permissions])) {
      return {
        success: false,
        error: 'You cannot assign roles with permissions you do not hold.',
        errorCode: 'ESCALATION',
      };
    }
  }

  const beforeRoleIds = target.roleIds.map((id) => id.toHexString());
  const updated = await memberRepo.setRoles(spaceId, targetId, nextIds);
  if (!updated) {
    return { success: false, error: 'That member was not found.', errorCode: 'MEMBER_NOT_FOUND' };
  }
  void recordSpaceAudit({
    spaceId,
    actorIdentityId: actingId,
    action: 'member_roles_update',
    targetIdentityId: targetId,
    metadata: {
      before: beforeRoleIds,
      after: nextIds.map((id) => id.toHexString()),
    },
  });
  return { success: true, member: toPublicSpaceMember(updated) };
}

/**
 * List members that hold a specific role (for Manage Members tab).
 */
export async function listRoleMembers(
  spaceIdRaw: string | ObjectId,
  roleIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
  limit = 50,
  cursor?: string,
): Promise<{
  success: boolean;
  members?: PublicSpaceMember[];
  cursor?: string | null;
  error?: string;
  errorCode?: SpaceErrorCode;
}> {
  const spaceId = parseObjId(spaceIdRaw);
  const roleId = parseObjId(roleIdRaw);
  const requesterId = parseObjId(requesterIdentityIdRaw);
  if (!spaceId || !roleId || !requesterId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const access = await canReadSpace(space, requesterId);
  if (!access.ok) return { success: false, error: access.error, errorCode: access.errorCode };

  const role = await getSpaceRoleRepository().findByIdInSpace(spaceId, roleId);
  if (!role) {
    return { success: false, error: 'Role not found.', errorCode: 'ROLE_NOT_FOUND' };
  }

  const gate = await resolveMemberPermissions(spaceId, requesterId);
  const canList =
    memberHasPermission(gate, 'manageRoles') ||
    memberHasPermission(gate, 'manageMemberRoles');
  if (!canList) {
    return {
      success: false,
      error: 'You do not have permission to manage roles.',
      errorCode: 'FORBIDDEN',
    };
  }

  const cursorObjId = cursor && isValidObjectId(cursor) ? new ObjectId(cursor) : undefined;
  const members = await getSpaceMemberRepository().listByRole(
    spaceId,
    roleId,
    limit + 1,
    cursorObjId,
  );
  const hasMore = members.length > limit;
  const page = hasMore ? members.slice(0, limit) : members;

  return {
    success: true,
    members: page.map(toPublicSpaceMember),
    cursor: hasMore && page.length > 0 ? page[page.length - 1]!._id.toHexString() : null,
  };
}

/** Re-export list for convenience (already in members.ts). */
export type { SpaceRolesResult, PublicSpaceRole };

/** Default plaintext name for new custom roles. */
export { DEFAULT_MEMBER_ROLE_NAME };
