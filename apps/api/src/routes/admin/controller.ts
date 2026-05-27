/**
 * Platform admin route behaviour — metrics, admin list, platform settings.
 *
 * @module routes/admin/controller
 */

import { ObjectId } from 'mongodb';
import type {
  PlatformSettingsDocument,
  PlatformSettingValueType,
} from '../../models/platform-settings';
import { DELETED_IDENT_PREFIX } from '../../models/identity';
import { upsertPlatformSetting } from '../../services/platform-settings.service';
import type { IdentitySessionData } from '../../services/session.service';
import {
  isRegisteredPlatformSettingKey,
  type PlatformSettingKey,
} from '../../constants/platform-settings-keys';
import {
  PLATFORM_PERMISSIONS,
  hasPlatformPermission,
  type PlatformPermission,
} from '../../constants/platform-permissions';
import {
  getPlatformCapabilities,
  type PlatformCapabilities,
} from '../../services/platform-capabilities.service';
import { getPlatformSettingsRepository } from '../../repositories/platform-settings.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getUserRepository } from '../../repositories/user.repository';
import { isValidObjectId, sanitizeString } from '../../utils';
import { z } from '@adieuu/shared/schemas';

/** Matches PUT/PATCH body description upper bound in Zod schema below. */
export const PLATFORM_SETTING_PUT_BODY_DESCRIPTION_MAX = 4096;

export const PutPlatformSettingSchema = z.object({
  valueType: z.enum(['boolean', 'string', 'number', 'stringArray', 'objectIdArray']),
  value: z.unknown(),
  description: z.string().max(PLATFORM_SETTING_PUT_BODY_DESCRIPTION_MAX).optional(),
});

export type PlatformAdminRow = {
  identityId: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  stale?: boolean;
};

export type AdminGateFailureReason = 'unauthorized' | 'forbidden';

export async function gatePlatformPermissionSession(
  session: IdentitySessionData | null,
  permission: PlatformPermission,
): Promise<
  | { ok: true; session: IdentitySessionData; caps: PlatformCapabilities }
  | { ok: false; reason: AdminGateFailureReason }
> {
  if (!session) return { ok: false, reason: 'unauthorized' };
  const caps = await getPlatformCapabilities(session.identityId);
  if (!hasPlatformPermission(caps.permissions, permission)) {
    return { ok: false, reason: 'forbidden' };
  }
  return { ok: true, session, caps };
}

/** @deprecated Use gatePlatformPermissionSession with a specific permission. */
export async function gatePlatformAdminSession(
  session: IdentitySessionData | null,
): Promise<
  | { ok: true; session: IdentitySessionData; caps: PlatformCapabilities }
  | { ok: false; reason: AdminGateFailureReason }
> {
  return gatePlatformPermissionSession(session, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
}

/** Decode URI segment; returns empty string if malformed `%`-sequences would throw. */
export function safeDecodeUriComponent(segment: string | undefined): string {
  try {
    return decodeURIComponent(segment ?? '');
  } catch {
    return '';
  }
}

export function parseRegisteredPlatformSettingKey(segment: string | undefined): PlatformSettingKey | null {
  const decoded = safeDecodeUriComponent(segment);
  const { value } = sanitizeString(decoded, 'alphanumdash');
  if (!isRegisteredPlatformSettingKey(value)) return null;
  return value;
}

/** Sanitized 24-char hex ObjectId from route segment, or null if invalid. */
export function parseSanitizedObjectIdHex(segment: string | undefined): string | null {
  const decoded = safeDecodeUriComponent(segment);
  const { value } = sanitizeString(decoded, 'id');
  if (!value || !isValidObjectId(value)) return null;
  return value;
}

function activeIdentityBaseFilter() {
  return {
    ident: { $not: { $regex: `^${DELETED_IDENT_PREFIX}` } },
  };
}

function isoFromDocDate(doc: PlatformSettingsDocument, field: 'createdAt' | 'updatedAt'): string {
  const d = doc[field];
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    return d.toISOString();
  }
  return doc._id.getTimestamp().toISOString();
}

export function toPublicSetting(doc: PlatformSettingsDocument) {
  let value: unknown = doc.value;
  if (doc.valueType === 'objectIdArray' && Array.isArray(doc.value)) {
    value = doc.value.map((id) => (id instanceof ObjectId ? id.toHexString() : String(id)));
  }
  return {
    key: doc.key,
    description: doc.description,
    valueType: doc.valueType,
    value,
    lastUpdatedBy: doc.lastUpdatedBy,
    updatedAt: isoFromDocDate(doc, 'updatedAt'),
    createdAt: isoFromDocDate(doc, 'createdAt'),
  };
}

export async function getAdminMetricsCounts(): Promise<{
  totalUsers: number;
  totalIdentities: number;
  activeIdentities15m: number;
  activeIdentities24h: number;
}> {
  const userRepo = getUserRepository();
  const identityRepo = getIdentityRepository();
  const now = Date.now();
  const window15m = new Date(now - 15 * 60 * 1000);
  const window24h = new Date(now - 24 * 60 * 60 * 1000);
  const base = activeIdentityBaseFilter();

  const [totalUsers, totalIdentities, activeIdentities15m, activeIdentities24h] = await Promise.all([
    userRepo.count({}),
    identityRepo.count(base),
    identityRepo.count({ ...base, lastActiveAt: { $gte: window15m } }),
    identityRepo.count({ ...base, lastActiveAt: { $gte: window24h } }),
  ]);

  return {
    totalUsers,
    totalIdentities,
    activeIdentities15m,
    activeIdentities24h,
  };
}

export async function listPlatformSettingDocuments(): Promise<PlatformSettingsDocument[]> {
  const repo = getPlatformSettingsRepository();
  return repo.findAll();
}

export async function findPlatformSettingDocument(
  key: PlatformSettingKey,
): Promise<PlatformSettingsDocument | null> {
  const repo = getPlatformSettingsRepository();
  return repo.findByKey(key);
}

export type UpsertPlatformSettingAdminResult =
  | { ok: true; doc: PlatformSettingsDocument }
  | { ok: false; reason: 'validation_failed' | 'internal' };

export async function upsertPlatformSettingAdminResult(
  sessionIdentityId: string,
  key: PlatformSettingKey,
  body: unknown,
): Promise<UpsertPlatformSettingAdminResult> {
  const parseResult = PutPlatformSettingSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, reason: 'validation_failed' };
  }

  const { valueType, value, description } = parseResult.data;

  try {
    await upsertPlatformSetting({
      key,
      description,
      valueType: valueType as PlatformSettingValueType,
      value,
      lastUpdatedBy: sessionIdentityId,
    });
  } catch {
    return { ok: false, reason: 'validation_failed' };
  }

  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(key);
  if (!doc) {
    return { ok: false, reason: 'internal' };
  }

  return { ok: true, doc };
}
