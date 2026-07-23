/**
 * Space membership and role route controllers.
 *
 * Split from `controller.ts` to keep files under 700 lines.
 *
 * @module routes/spaces/member-controller
 */

import type { RouteContext } from '../../router/types';
import type { IdentityContext } from '../../middleware/identity-session';
import type { SpaceRouteResult } from './space-route-result';
import { mapSpaceError } from './space-route-result';
import type { SpaceBillingContext } from '../../services/space/types';
import {
  joinSpace,
  leaveSpace,
  removeSpaceMember,
  banSpaceMember,
  unbanSpaceMember,
  listBannedSpaceMembers,
  updateSpaceMemberProfile,
  listSpaceMembers,
  listSpaceRoles,
  createSpaceRole,
  updateSpaceRole,
  deleteSpaceRole,
  setMemberRoles,
  listRoleMembers,
} from '../../services/space.service';
import {
  CreateSpaceRoleSchema,
  UpdateSpaceRoleSchema,
  SetMemberRolesSchema,
  BanSpaceMemberSchema,
  UpdateSpaceMemberProfileSchema,
} from '@adieuu/shared/schemas';
import {
  sanitizeSpaceObjectId,
  sanitizeSpaceRoleName,
  sanitizeSpaceNickname,
  sanitizeSpaceBanReason,
  parseSpaceListCursor,
  clampSpaceListLimit,
} from './space-inputs';

/** Effective billing context for paid gating and join tier checks. */
function billingFromSession(session: IdentityContext): SpaceBillingContext {
  return {
    subscriptions: session.subscriptions,
    entitlements: session.entitlements,
    isLifetime: session.isLifetime,
  };
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export async function joinSpaceCtrl(ctx: RouteContext): Promise<SpaceRouteResult<unknown>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await joinSpace(id.id, identity._id, billingFromSession(ctx.identitySession));
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to join Space.');
  }
  return { kind: 'ok', data: result.member, message: 'Joined Space.' };
}

export async function leaveSpaceCtrl(ctx: RouteContext): Promise<SpaceRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await leaveSpace(id.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to leave Space.');
  }
  return { kind: 'ok', data: undefined, message: 'Left Space.' };
}

export async function listMembersCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ members: unknown[]; cursor: string | null }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const limit = clampSpaceListLimit(ctx.query.get('limit'), 50, 100);
  const cursor = parseSpaceListCursor(ctx.query.get('cursor'));

  const result = await listSpaceMembers(id.id, identity._id, limit, cursor);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list members.');
  }
  return { kind: 'ok', data: { members: result.members ?? [], cursor: result.cursor ?? null } };
}

export async function removeMemberCtrl(ctx: RouteContext): Promise<SpaceRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const target = sanitizeSpaceObjectId(ctx.params.identityId);
  if (!id.ok || !target.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const result = await removeSpaceMember(id.id, identity._id, target.id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to remove member.');
  }
  return { kind: 'ok', data: undefined, message: 'Member removed.' };
}

export async function banMemberCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ member: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const target = sanitizeSpaceObjectId(ctx.params.identityId);
  if (!id.ok || !target.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const parsed = BanSpaceMemberSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const reason = sanitizeSpaceBanReason(parsed.data.reason);
  if (!reason.ok) return { kind: 'validation_failed' };

  const result = await banSpaceMember(id.id, identity._id, target.id, {
    ...parsed.data,
    reason: reason.reason,
  });
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to ban member.');
  }
  return { kind: 'ok', data: { member: result.member }, message: 'Member banned.' };
}

export async function unbanMemberCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ member: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const target = sanitizeSpaceObjectId(ctx.params.identityId);
  if (!id.ok || !target.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const result = await unbanSpaceMember(id.id, identity._id, target.id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to unban member.');
  }
  return { kind: 'ok', data: { member: result.member }, message: 'Member unbanned.' };
}

export async function listBannedMembersCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ members: unknown[]; cursor: string | null }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const limit = clampSpaceListLimit(ctx.query.get('limit'), 50, 100);
  const cursor = parseSpaceListCursor(ctx.query.get('cursor'));

  const result = await listBannedSpaceMembers(id.id, identity._id, limit, cursor);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list banned members.');
  }
  return { kind: 'ok', data: { members: result.members ?? [], cursor: result.cursor ?? null } };
}

export async function updateMemberProfileCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ member: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const target = sanitizeSpaceObjectId(ctx.params.identityId);
  if (!id.ok || !target.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const parsed = UpdateSpaceMemberProfileSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const nickname = sanitizeSpaceNickname(parsed.data.nickname);
  if (!nickname.ok) return { kind: 'validation_failed' };

  const result = await updateSpaceMemberProfile(id.id, identity._id, target.id, {
    ...parsed.data,
    ...(nickname.nickname !== undefined ? { nickname: nickname.nickname } : {}),
  });
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to update member profile.');
  }
  return { kind: 'ok', data: { member: result.member }, message: 'Member profile updated.' };
}

export async function listRolesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ roles: unknown[] }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const result = await listSpaceRoles(id.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list roles.');
  }
  return { kind: 'ok', data: { roles: result.roles ?? [] } };
}

export async function createRoleCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ role: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  if (!id.ok) return { kind: 'bad_request', message: 'Invalid Space id.' };

  const parsed = CreateSpaceRoleSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const roleName = sanitizeSpaceRoleName(parsed.data.name);
  if (!roleName.ok) return { kind: 'validation_failed' };

  const result = await createSpaceRole(id.id, identity._id, {
    ...parsed.data,
    ...(roleName.name !== undefined ? { name: roleName.name } : {}),
  });
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to create role.');
  }
  return { kind: 'ok', data: { role: result.role }, message: 'Role created.' };
}

export async function updateRoleCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ role: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const roleId = sanitizeSpaceObjectId(ctx.params.roleId);
  if (!id.ok || !roleId.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const parsed = UpdateSpaceRoleSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const roleName = sanitizeSpaceRoleName(parsed.data.name);
  if (!roleName.ok) return { kind: 'validation_failed' };

  const result = await updateSpaceRole(id.id, roleId.id, identity._id, {
    ...parsed.data,
    ...(roleName.name !== undefined ? { name: roleName.name } : {}),
  });
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to update role.');
  }
  return { kind: 'ok', data: { role: result.role }, message: 'Role updated.' };
}

export async function deleteRoleCtrl(ctx: RouteContext): Promise<SpaceRouteResult<undefined>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const roleId = sanitizeSpaceObjectId(ctx.params.roleId);
  if (!id.ok || !roleId.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const result = await deleteSpaceRole(id.id, roleId.id, identity._id);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to delete role.');
  }
  return { kind: 'ok', data: undefined, message: 'Role deleted.' };
}

export async function listRoleMembersCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ members: unknown[]; cursor: string | null }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const roleId = sanitizeSpaceObjectId(ctx.params.roleId);
  if (!id.ok || !roleId.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const limit = clampSpaceListLimit(ctx.query.get('limit'), 50, 100);
  const cursor = parseSpaceListCursor(ctx.query.get('cursor'));

  const result = await listRoleMembers(id.id, roleId.id, identity._id, limit, cursor);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to list role members.');
  }
  return {
    kind: 'ok',
    data: { members: result.members ?? [], cursor: result.cursor ?? null },
  };
}

export async function setMemberRolesCtrl(
  ctx: RouteContext,
): Promise<SpaceRouteResult<{ member: unknown }>> {
  if (!ctx.identitySession) return { kind: 'unauthorized' };
  const { identity } = ctx.identitySession;

  const id = sanitizeSpaceObjectId(ctx.params.id);
  const target = sanitizeSpaceObjectId(ctx.params.identityId);
  if (!id.ok || !target.ok) return { kind: 'bad_request', message: 'Invalid id.' };

  const parsed = SetMemberRolesSchema.safeParse(ctx.body);
  if (!parsed.success) return { kind: 'validation_failed' };

  const result = await setMemberRoles(id.id, target.id, identity._id, parsed.data.roleIds);
  if (!result.success) {
    return mapSpaceError(result.errorCode, result.error ?? 'Failed to update member roles.');
  }
  return { kind: 'ok', data: { member: result.member }, message: 'Member roles updated.' };
}
