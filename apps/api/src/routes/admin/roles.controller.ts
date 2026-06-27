/**
 * Platform role and direct attribute assignment for identities.
 *
 * @module routes/admin/roles.controller
 */

import { ObjectId } from 'mongodb';
import { z } from '@adieuu/shared/schemas';
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
  hasPlatformPermission,
  isPlatformRole,
  type PlatformPermission,
  type PlatformRole,
} from '../../constants/platform-permissions';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getAuditLogRepository } from '../../repositories/audit.repository';
import { checkRateLimit } from '../../services/rate-limit.service';
import type { PlatformCapabilities } from '../../services/platform-capabilities.service';
import { isValidObjectId, sanitizeString } from '../../utils';
import { parseSanitizedObjectIdHex } from './controller';

const VALID_PLATFORM_PERMISSIONS = new Set<string>(Object.values(PLATFORM_PERMISSIONS));

/** Direct attributes must not grant admin-only permissions reserved for the admin role. */
const ADMIN_ONLY_DIRECT_ATTRIBUTE_DENYLIST = new Set<PlatformPermission>([
  PLATFORM_PERMISSIONS.MANAGE_ROLES,
  PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS,
  PLATFORM_PERMISSIONS.MANAGE_USERS,
  PLATFORM_PERMISSIONS.MANAGE_IDENTITIES,
]);

const ROLE_GRANT_RATE_LIMIT = { limit: 30, windowSeconds: 3600 } as const;
const ROLE_REVOKE_RATE_LIMIT = { limit: 30, windowSeconds: 3600 } as const;

function isPlatformPermission(value: string): value is PlatformPermission {
  return VALID_PLATFORM_PERMISSIONS.has(value);
}

function isDirectAttributeGrantAllowed(attribute: PlatformPermission): boolean {
  return !ADMIN_ONLY_DIRECT_ATTRIBUTE_DENYLIST.has(attribute);
}

async function writeRoleAuditLog(
  action:
    | 'admin_grant_platform_role'
    | 'admin_revoke_platform_role'
    | 'admin_grant_platform_attribute'
    | 'admin_revoke_platform_attribute',
  actorIdentityId: string,
  targetIdentityId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    action,
    ipHash: 'admin',
    metadata: {
      identityId: targetIdentityId,
      adminIdentityId: actorIdentityId,
      ...metadata,
    },
  });
}

export const GrantPlatformRoleSchema = z.object({
  role: z.enum([
    PLATFORM_ROLES.ADMIN,
    PLATFORM_ROLES.MODERATOR,
    PLATFORM_ROLES.SUPPORT_AGENT,
  ]),
});

export type PlatformRoleHolderRow = {
  identityId: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  roles: PlatformRole[];
};

export type GrantPlatformRoleResult =
  | { ok: true; identityId: string; roles: PlatformRole[] }
  | { ok: false; reason: 'forbidden' | 'validation_failed' | 'not_found' | 'rate_limited' | 'last_admin' };

export type RevokePlatformRoleResult =
  | { ok: true; identityId: string; roles: PlatformRole[] }
  | { ok: false; reason: 'forbidden' | 'validation_failed' | 'not_found' | 'last_admin' | 'rate_limited' };

export type ListPlatformRoleHoldersResult =
  | { ok: true; identities: PlatformRoleHolderRow[] }
  | { ok: false; reason: 'forbidden' | 'validation_failed' };

function assertManageRoles(caps: PlatformCapabilities): boolean {
  return hasPlatformPermission(caps.permissions, PLATFORM_PERMISSIONS.MANAGE_ROLES);
}

export async function listPlatformRoleHoldersResult(
  roleSegment: string | undefined,
  caps: PlatformCapabilities,
): Promise<ListPlatformRoleHoldersResult> {
  if (!assertManageRoles(caps)) {
    return { ok: false, reason: 'forbidden' };
  }

  const { value: roleValue } = sanitizeString(roleSegment ?? '', 'general');
  if (!isPlatformRole(roleValue)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const identityRepo = getIdentityRepository();
  const identities = await identityRepo.findByPlatformRole(roleValue);

  return {
    ok: true,
    identities: identities.map((identity) => ({
      identityId: identity._id instanceof ObjectId ? identity._id.toHexString() : String(identity._id),
      displayName: identity.displayName,
      username: identity.username,
      avatarUrl: identity.avatarUrl,
      roles: (identity.platformRoles ?? []).filter(isPlatformRole),
    })),
  };
}

export async function grantPlatformRoleResult(
  actorIdentityId: string,
  targetIdentitySegment: string | undefined,
  body: unknown,
  caps: PlatformCapabilities,
): Promise<GrantPlatformRoleResult> {
  if (!assertManageRoles(caps)) {
    return { ok: false, reason: 'forbidden' };
  }

  const rl = await checkRateLimit('admin:platform-roles:grant', actorIdentityId, ROLE_GRANT_RATE_LIMIT);
  if (!rl.allowed) {
    return { ok: false, reason: 'rate_limited' };
  }

  const parseResult = GrantPlatformRoleSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, reason: 'validation_failed' };
  }

  const targetHex = parseSanitizedObjectIdHex(targetIdentitySegment);
  if (!targetHex || !isValidObjectId(targetHex)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const identityRepo = getIdentityRepository();
  const identity = await identityRepo.findById(targetHex);
  if (!identity) {
    return { ok: false, reason: 'not_found' };
  }

  const role = parseResult.data.role;
  const existingRoles = (identity.platformRoles ?? []).filter(isPlatformRole);
  if (existingRoles.includes(role)) {
    return { ok: true, identityId: targetHex, roles: existingRoles };
  }

  const updated = await identityRepo.addPlatformRole(targetHex, role);
  if (!updated) {
    return { ok: false, reason: 'not_found' };
  }

  await writeRoleAuditLog('admin_grant_platform_role', actorIdentityId, targetHex, { role });

  const refreshed = await identityRepo.findById(targetHex);
  return {
    ok: true,
    identityId: targetHex,
    roles: (refreshed?.platformRoles ?? []).filter(isPlatformRole),
  };
}

export async function revokePlatformRoleResult(
  actorIdentityId: string,
  targetIdentitySegment: string | undefined,
  roleSegment: string | undefined,
  caps: PlatformCapabilities,
): Promise<RevokePlatformRoleResult> {
  if (!assertManageRoles(caps)) {
    return { ok: false, reason: 'forbidden' };
  }

  const rl = await checkRateLimit('admin:platform-roles:revoke', actorIdentityId, ROLE_REVOKE_RATE_LIMIT);
  if (!rl.allowed) {
    return { ok: false, reason: 'rate_limited' };
  }

  const targetHex = parseSanitizedObjectIdHex(targetIdentitySegment);
  if (!targetHex || !isValidObjectId(targetHex)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const { value: roleValue } = sanitizeString(roleSegment ?? '', 'general');
  if (!isPlatformRole(roleValue)) {
    return { ok: false, reason: 'validation_failed' };
  }

  if (
    roleValue === PLATFORM_ROLES.ADMIN &&
    targetHex.toLowerCase() === actorIdentityId.toLowerCase()
  ) {
    return { ok: false, reason: 'validation_failed' };
  }

  const identityRepo = getIdentityRepository();
  const identity = await identityRepo.findById(targetHex);
  if (!identity) {
    return { ok: false, reason: 'not_found' };
  }

  const existingRoles = (identity.platformRoles ?? []).filter(isPlatformRole);
  if (!existingRoles.includes(roleValue)) {
    return { ok: true, identityId: targetHex, roles: existingRoles };
  }

  if (roleValue === PLATFORM_ROLES.ADMIN) {
    const adminCount = await identityRepo.countByPlatformRole(PLATFORM_ROLES.ADMIN);
    if (adminCount <= 1) {
      return { ok: false, reason: 'last_admin' };
    }
  }

  const updated = await identityRepo.removePlatformRole(targetHex, roleValue);
  if (!updated) {
    return { ok: false, reason: 'not_found' };
  }

  await writeRoleAuditLog('admin_revoke_platform_role', actorIdentityId, targetHex, { role: roleValue });

  const refreshed = await identityRepo.findById(targetHex);
  return {
    ok: true,
    identityId: targetHex,
    roles: (refreshed?.platformRoles ?? []).filter(isPlatformRole),
  };
}

// ---------------------------------------------------------------------------
// Platform attribute (direct permission grant) management
// ---------------------------------------------------------------------------

export const GrantPlatformAttributeSchema = z.object({
  attribute: z.enum(
    Object.values(PLATFORM_PERMISSIONS) as [PlatformPermission, ...PlatformPermission[]],
  ),
});

export type GrantPlatformAttributeResult =
  | { ok: true; identityId: string; attributes: PlatformPermission[] }
  | { ok: false; reason: 'forbidden' | 'validation_failed' | 'not_found' | 'rate_limited' };

export type RevokePlatformAttributeResult =
  | { ok: true; identityId: string; attributes: PlatformPermission[] }
  | { ok: false; reason: 'forbidden' | 'validation_failed' | 'not_found' | 'rate_limited' };

export async function grantPlatformAttributeResult(
  actorIdentityId: string,
  targetIdentitySegment: string | undefined,
  body: unknown,
  caps: PlatformCapabilities,
): Promise<GrantPlatformAttributeResult> {
  if (!assertManageRoles(caps)) {
    return { ok: false, reason: 'forbidden' };
  }

  const rl = await checkRateLimit('admin:platform-roles:grant', actorIdentityId, ROLE_GRANT_RATE_LIMIT);
  if (!rl.allowed) {
    return { ok: false, reason: 'rate_limited' };
  }

  const parseResult = GrantPlatformAttributeSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, reason: 'validation_failed' };
  }

  const attribute = parseResult.data.attribute;
  if (!isDirectAttributeGrantAllowed(attribute)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const targetHex = parseSanitizedObjectIdHex(targetIdentitySegment);
  if (!targetHex || !isValidObjectId(targetHex)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const identityRepo = getIdentityRepository();
  const identity = await identityRepo.findById(targetHex);
  if (!identity) {
    return { ok: false, reason: 'not_found' };
  }

  const existing = (identity.platformAttributes ?? []).filter(isPlatformPermission);
  if (existing.includes(attribute)) {
    return { ok: true, identityId: targetHex, attributes: existing };
  }

  const didUpdate = await identityRepo.addPlatformAttribute(targetHex, attribute);
  if (!didUpdate) {
    return { ok: false, reason: 'not_found' };
  }

  await writeRoleAuditLog('admin_grant_platform_attribute', actorIdentityId, targetHex, {
    attribute,
  });

  const refreshed = await identityRepo.findById(targetHex);
  return {
    ok: true,
    identityId: targetHex,
    attributes: (refreshed?.platformAttributes ?? []).filter(isPlatformPermission),
  };
}

export async function revokePlatformAttributeResult(
  actorIdentityId: string,
  targetIdentitySegment: string | undefined,
  attributeSegment: string | undefined,
  caps: PlatformCapabilities,
): Promise<RevokePlatformAttributeResult> {
  if (!assertManageRoles(caps)) {
    return { ok: false, reason: 'forbidden' };
  }

  const rl = await checkRateLimit('admin:platform-roles:revoke', actorIdentityId, ROLE_REVOKE_RATE_LIMIT);
  if (!rl.allowed) {
    return { ok: false, reason: 'rate_limited' };
  }

  const targetHex = parseSanitizedObjectIdHex(targetIdentitySegment);
  if (!targetHex || !isValidObjectId(targetHex)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const { value: attrValue } = sanitizeString(attributeSegment ?? '', 'general');
  if (!isPlatformPermission(attrValue)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const identityRepo = getIdentityRepository();
  const identity = await identityRepo.findById(targetHex);
  if (!identity) {
    return { ok: false, reason: 'not_found' };
  }

  const existing = (identity.platformAttributes ?? []).filter(isPlatformPermission);
  if (!existing.includes(attrValue)) {
    return { ok: true, identityId: targetHex, attributes: existing };
  }

  const didUpdate = await identityRepo.removePlatformAttribute(targetHex, attrValue);
  if (!didUpdate) {
    return { ok: false, reason: 'not_found' };
  }

  await writeRoleAuditLog('admin_revoke_platform_attribute', actorIdentityId, targetHex, {
    attribute: attrValue,
  });

  const refreshed = await identityRepo.findById(targetHex);
  return {
    ok: true,
    identityId: targetHex,
    attributes: (refreshed?.platformAttributes ?? []).filter(isPlatformPermission),
  };
}
