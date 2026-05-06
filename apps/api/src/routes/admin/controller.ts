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
import {
  upsertPlatformSetting,
  isPlatformAdmin,
} from '../../services/platform-settings.service';
import type { IdentitySessionData } from '../../services/session.service';
import {
  PLATFORM_SETTING_KEYS,
  isRegisteredPlatformSettingKey,
  type PlatformSettingKey,
} from '../../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../../repositories/platform-settings.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getUserRepository } from '../../repositories/user.repository';
import { checkRateLimit } from '../../services/rate-limit.service';
import { isValidObjectId, sanitizeString } from '../../utils';
import { z } from '@adieuu/shared/schemas';

/** Matches PUT/PATCH body description upper bound in Zod schema below. */
export const PLATFORM_SETTING_PUT_BODY_DESCRIPTION_MAX = 4096;

export const PutPlatformSettingSchema = z.object({
  valueType: z.enum(['boolean', 'string', 'number', 'stringArray', 'objectIdArray']),
  value: z.unknown(),
  description: z.string().max(PLATFORM_SETTING_PUT_BODY_DESCRIPTION_MAX).optional(),
});

export const AddPlatformAdminSchema = z.object({
  identityId: z.string().min(1).max(64),
});

export type PlatformAdminRow = {
  identityId: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  stale?: boolean;
};

export type AdminGateFailureReason = 'unauthorized' | 'forbidden';

export async function gatePlatformAdminSession(
  session: IdentitySessionData | null,
): Promise<
  | { ok: true; session: IdentitySessionData }
  | { ok: false; reason: AdminGateFailureReason }
> {
  if (!session) return { ok: false, reason: 'unauthorized' };
  if (!(await isPlatformAdmin(session.identityId))) return { ok: false, reason: 'forbidden' };
  return { ok: true, session };
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

function readAdminObjectIds(doc: PlatformSettingsDocument | null): ObjectId[] {
  if (!doc || doc.valueType !== 'objectIdArray' || !Array.isArray(doc.value)) {
    return [];
  }
  const out: ObjectId[] = [];
  for (const v of doc.value) {
    if (v instanceof ObjectId) {
      out.push(v);
    } else if (typeof v === 'string' && /^[a-fA-F0-9]{24}$/.test(v)) {
      out.push(new ObjectId(v));
    }
  }
  return out;
}

export async function buildPlatformAdminsList(): Promise<{ admins: PlatformAdminRow[] }> {
  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.ADMIN_IDENTITY_LIST);
  const ids = readAdminObjectIds(doc);
  const identityRepo = getIdentityRepository();
  const admins: PlatformAdminRow[] = [];

  for (const oid of ids) {
    const identity = await identityRepo.findById(oid);
    if (!identity) {
      admins.push({ identityId: oid.toHexString(), stale: true });
      continue;
    }
    admins.push({
      identityId: oid.toHexString(),
      displayName: identity.displayName,
      username: identity.username,
      avatarUrl: identity.avatarUrl,
    });
  }

  return { admins };
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

export type AddPlatformAdminResult =
  | { ok: true; admins: PlatformAdminRow[] }
  | { ok: false; reason: 'validation_failed' | 'rate_limited' | 'not_found' };

export async function addPlatformAdminResult(
  sessionIdentityId: string,
  body: unknown,
): Promise<AddPlatformAdminResult> {
  const rl = await checkRateLimit('admin:platform-admins:add', sessionIdentityId, {
    limit: 30,
    windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return { ok: false, reason: 'rate_limited' };
  }

  const parseResult = AddPlatformAdminSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, reason: 'validation_failed' };
  }

  const { value: hexId } = sanitizeString(parseResult.data.identityId, 'id');
  if (!hexId || !isValidObjectId(hexId)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const identityRepo = getIdentityRepository();
  const identity = await identityRepo.findById(hexId);
  if (!identity) {
    return { ok: false, reason: 'not_found' };
  }

  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.ADMIN_IDENTITY_LIST);
  const existing = readAdminObjectIds(doc);
  const targetHex = identity._id instanceof ObjectId ? identity._id.toHexString() : String(identity._id);
  if (existing.some((id) => id.toHexString() === targetHex)) {
    const payload = await buildPlatformAdminsList();
    return { ok: true, admins: payload.admins };
  }

  const nextIds = [...existing.map((id) => id.toHexString()), targetHex];

  try {
    await upsertPlatformSetting({
      key: PLATFORM_SETTING_KEYS.ADMIN_IDENTITY_LIST,
      description: doc?.description ?? 'Platform administrator identity IDs',
      valueType: 'objectIdArray',
      value: nextIds,
      lastUpdatedBy: sessionIdentityId,
    });
  } catch {
    return { ok: false, reason: 'validation_failed' };
  }

  const payloadAdded = await buildPlatformAdminsList();
  return { ok: true, admins: payloadAdded.admins };
}

export type RemovePlatformAdminResult =
  | { ok: true; admins: PlatformAdminRow[] }
  | { ok: false; reason: 'validation_failed' | 'not_found' };

export async function removePlatformAdminResult(
  sessionIdentityId: string,
  identityIdSegment: string | undefined,
): Promise<RemovePlatformAdminResult> {
  const hexId = parseSanitizedObjectIdHex(identityIdSegment);
  if (!hexId) {
    return { ok: false, reason: 'validation_failed' };
  }

  const removeId = new ObjectId(hexId);

  if (removeId.toHexString() === sessionIdentityId.toLowerCase()) {
    return { ok: false, reason: 'validation_failed' };
  }

  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.ADMIN_IDENTITY_LIST);
  const existing = readAdminObjectIds(doc);
  const nextHex = existing.map((id) => id.toHexString()).filter((hex) => hex !== removeId.toHexString());

  if (nextHex.length === existing.length) {
    return { ok: false, reason: 'not_found' };
  }

  try {
    await upsertPlatformSetting({
      key: PLATFORM_SETTING_KEYS.ADMIN_IDENTITY_LIST,
      description: doc?.description ?? 'Platform administrator identity IDs',
      valueType: 'objectIdArray',
      value: nextHex,
      lastUpdatedBy: sessionIdentityId,
    });
  } catch {
    return { ok: false, reason: 'validation_failed' };
  }

  const payload = await buildPlatformAdminsList();
  return { ok: true, admins: payload.admins };
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
