/**
 * Platform admin routes — identity session + platform admin list only.
 */

import { ObjectId } from 'mongodb';
import { Router, type RouteContext } from '../../router';
import { success } from '../../utils/response';
import { requireIdentitySession, type IdentitySessionData } from '../../services/session.service';
import {
  ensureAuthAllowlistPlatformSettingsExist,
  isPlatformAdmin,
  upsertPlatformSetting,
} from '../../services/platform-settings.service';
import { PLATFORM_SETTING_KEYS, isRegisteredPlatformSettingKey } from '../../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../../repositories/platform-settings.repository';
import type { PlatformSettingsDocument, PlatformSettingValueType } from '../../models/platform-settings';
import { DELETED_IDENT_PREFIX } from '../../models/identity';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getUserRepository } from '../../repositories/user.repository';
import { checkRateLimit } from '../../services/rate-limit.service';
import { z } from '@adieuu/shared/schemas';

const router = new Router();

const PutPlatformSettingSchema = z.object({
  valueType: z.enum(['boolean', 'string', 'number', 'stringArray', 'objectIdArray']),
  value: z.unknown(),
  description: z.string().optional(),
});

const AddPlatformAdminSchema = z.object({
  identityId: z.string().min(1).max(64),
});

/** Non-deleted identities only (matches identity search filter). */
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

function toPublicSetting(doc: PlatformSettingsDocument) {
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

type PlatformAdminRow = {
  identityId: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  stale?: boolean;
};

async function buildPlatformAdminsList(): Promise<{ admins: PlatformAdminRow[] }> {
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

router.get('/admin/metrics', async (ctx) => {
  const session = await requireIdentitySession(ctx.request);
  if (!session) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.identityId))) {
    return ctx.errors.forbidden();
  }

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

  return success({
    totalUsers,
    totalIdentities,
    activeIdentities15m,
    activeIdentities24h,
  });
});

router.get('/admin/platform-admins', async (ctx) => {
  const session = await requireIdentitySession(ctx.request);
  if (!session) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.identityId))) {
    return ctx.errors.forbidden();
  }

  const payload = await buildPlatformAdminsList();
  return success(payload);
});

router.post('/admin/platform-admins', async (ctx) => {
  const session = await requireIdentitySession(ctx.request);
  if (!session) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.identityId))) {
    return ctx.errors.forbidden();
  }

  const rl = await checkRateLimit('admin:platform-admins:add', session.identityId, {
    limit: 30,
    windowSeconds: 3600,
  });
  if (!rl.allowed) {
    return ctx.errors.rateLimited();
  }

  const parseResult = AddPlatformAdminSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const identityRepo = getIdentityRepository();
  const identity = await identityRepo.findById(parseResult.data.identityId);
  if (!identity) {
    return ctx.errors.notFound();
  }

  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.ADMIN_IDENTITY_LIST);
  const existing = readAdminObjectIds(doc);
  const targetHex = identity._id instanceof ObjectId ? identity._id.toHexString() : String(identity._id);
  if (existing.some((id) => id.toHexString() === targetHex)) {
    const payload = await buildPlatformAdminsList();
    return success(payload);
  }

  const nextIds = [...existing.map((id) => id.toHexString()), targetHex];

  try {
    await upsertPlatformSetting({
      key: PLATFORM_SETTING_KEYS.ADMIN_IDENTITY_LIST,
      description: doc?.description ?? 'Platform administrator identity IDs',
      valueType: 'objectIdArray',
      value: nextIds,
      lastUpdatedBy: session.identityId,
    });
  } catch {
    return ctx.errors.validationFailed();
  }

  const payload = await buildPlatformAdminsList();
  return success(payload);
});

router.delete('/admin/platform-admins/:identityId', async (ctx) => {
  const session = await requireIdentitySession(ctx.request);
  if (!session) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.identityId))) {
    return ctx.errors.forbidden();
  }

  const rawId = decodeURIComponent(ctx.params.identityId ?? '');
  let removeId: ObjectId;
  try {
    removeId = new ObjectId(rawId);
  } catch {
    return ctx.errors.validationFailed();
  }

  if (removeId.toHexString() === session.identityId.toLowerCase()) {
    return ctx.errors.validationFailed();
  }

  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.ADMIN_IDENTITY_LIST);
  const existing = readAdminObjectIds(doc);
  const nextHex = existing
    .map((id) => id.toHexString())
    .filter((hex) => hex !== removeId.toHexString());

  if (nextHex.length === existing.length) {
    return ctx.errors.notFound();
  }

  try {
    await upsertPlatformSetting({
      key: PLATFORM_SETTING_KEYS.ADMIN_IDENTITY_LIST,
      description: doc?.description ?? 'Platform administrator identity IDs',
      valueType: 'objectIdArray',
      value: nextHex,
      lastUpdatedBy: session.identityId,
    });
  } catch {
    return ctx.errors.validationFailed();
  }

  const payload = await buildPlatformAdminsList();
  return success(payload);
});

router.get('/admin/platform-settings', async (ctx) => {
  const session = await requireIdentitySession(ctx.request);
  if (!session) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.identityId))) {
    return ctx.errors.forbidden();
  }

  try {
    await ensureAuthAllowlistPlatformSettingsExist(session.identityId);
  } catch {
    return ctx.errors.internal();
  }

  const repo = getPlatformSettingsRepository();
  const docs = await repo.findAll();
  return success(docs.map(toPublicSetting));
});

router.get('/admin/platform-settings/:key', async (ctx) => {
  const session = await requireIdentitySession(ctx.request);
  if (!session) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.identityId))) {
    return ctx.errors.forbidden();
  }

  const key = decodeURIComponent(ctx.params.key ?? '');
  if (!isRegisteredPlatformSettingKey(key)) {
    return ctx.errors.notFound();
  }

  try {
    await ensureAuthAllowlistPlatformSettingsExist(session.identityId);
  } catch {
    return ctx.errors.internal();
  }

  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(key);
  if (!doc) {
    return ctx.errors.notFound();
  }

  return success(toPublicSetting(doc));
});

async function upsertPlatformSettingHandler(ctx: RouteContext) {
  const session = await requireIdentitySession(ctx.request);
  if (!session) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.identityId))) {
    return ctx.errors.forbidden();
  }

  const key = decodeURIComponent(ctx.params.key ?? '');
  if (!isRegisteredPlatformSettingKey(key)) {
    return ctx.errors.validationFailed();
  }

  const parseResult = PutPlatformSettingSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { valueType, value, description } = parseResult.data;

  try {
    await upsertPlatformSetting({
      key,
      description,
      valueType: valueType as PlatformSettingValueType,
      value,
      lastUpdatedBy: session.identityId,
    });
  } catch {
    return ctx.errors.validationFailed();
  }

  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(key);
  if (!doc) {
    return ctx.errors.internal();
  }

  return success(toPublicSetting(doc));
}

router.put('/admin/platform-settings/:key', upsertPlatformSettingHandler);
router.patch('/admin/platform-settings/:key', upsertPlatformSettingHandler);

export const adminRoutes = router;
