/**
 * Platform admin routes — session + platform admin list only.
 */

import { ObjectId } from 'mongodb';
import { Router, type RouteContext } from '../../router';
import { success } from '../../utils/response';
import { getSessionFromRequest } from '../../services/session.service';
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
import { sanitizeString } from '../../utils/sanitize';
import { z } from '@adieuu/shared/schemas';

const router = new Router();

const PutPlatformSettingSchema = z.object({
  valueType: z.enum(['boolean', 'string', 'number', 'stringArray', 'objectIdArray']),
  value: z.unknown(),
  description: z.string().optional(),
});

const AddPlatformAdminSchema = z.object({
  identifier: z.string().min(1).max(512),
});

/** Non-deleted identities only (matches identity search filter). */
function activeIdentityBaseFilter() {
  return {
    ident: { $not: { $regex: `^${DELETED_IDENT_PREFIX}` } },
  };
}

function normalizeAdminIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) {
    return sanitizeString(trimmed, 'email').value;
  }
  return sanitizeString(trimmed, 'phone').value;
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
    updatedAt: doc.updatedAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
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
  userId: string;
  email?: string;
  phone?: string;
  displayName?: string;
  stale?: boolean;
};

async function buildPlatformAdminsList(): Promise<{ admins: PlatformAdminRow[] }> {
  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.ADMIN_ACCOUNT_LIST);
  const ids = readAdminObjectIds(doc);
  const userRepo = getUserRepository();
  const admins: PlatformAdminRow[] = [];

  for (const oid of ids) {
    const user = await userRepo.findById(oid);
    if (!user) {
      admins.push({ userId: oid.toHexString(), stale: true });
      continue;
    }
    admins.push({
      userId: oid.toHexString(),
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
    });
  }

  return { admins };
}

router.get('/admin/metrics', async (ctx) => {
  const session = await getSessionFromRequest(ctx.request);
  if (!session?.userId) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.userId))) {
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
  const session = await getSessionFromRequest(ctx.request);
  if (!session?.userId) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.userId))) {
    return ctx.errors.forbidden();
  }

  const payload = await buildPlatformAdminsList();
  return success(payload);
});

router.post('/admin/platform-admins', async (ctx) => {
  const session = await getSessionFromRequest(ctx.request);
  if (!session?.userId) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.userId))) {
    return ctx.errors.forbidden();
  }

  const rl = await checkRateLimit('admin:platform-admins:add', session.userId, {
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

  const identifier = normalizeAdminIdentifier(parseResult.data.identifier);
  if (!identifier) {
    return ctx.errors.validationFailed();
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findByIdentifier(identifier);
  if (!user) {
    return ctx.errors.notFound('User not found');
  }

  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.ADMIN_ACCOUNT_LIST);
  const existing = readAdminObjectIds(doc);
  const targetHex = user._id instanceof ObjectId ? user._id.toHexString() : String(user._id);
  if (existing.some((id) => id.toHexString() === targetHex)) {
    const payload = await buildPlatformAdminsList();
    return success(payload);
  }

  const nextIds = [...existing.map((id) => id.toHexString()), targetHex];

  try {
    await upsertPlatformSetting({
      key: PLATFORM_SETTING_KEYS.ADMIN_ACCOUNT_LIST,
      description: doc?.description ?? 'Platform administrator user IDs',
      valueType: 'objectIdArray',
      value: nextIds,
      lastUpdatedBy: session.userId,
    });
  } catch {
    return ctx.errors.validationFailed();
  }

  const payload = await buildPlatformAdminsList();
  return success(payload);
});

router.delete('/admin/platform-admins/:userId', async (ctx) => {
  const session = await getSessionFromRequest(ctx.request);
  if (!session?.userId) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.userId))) {
    return ctx.errors.forbidden();
  }

  const rawId = decodeURIComponent(ctx.params.userId ?? '');
  let removeId: ObjectId;
  try {
    removeId = new ObjectId(rawId);
  } catch {
    return ctx.errors.validationFailed();
  }

  if (removeId.toHexString() === session.userId.toLowerCase()) {
    return ctx.errors.validationFailed();
  }

  const repo = getPlatformSettingsRepository();
  const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.ADMIN_ACCOUNT_LIST);
  const existing = readAdminObjectIds(doc);
  const nextHex = existing
    .map((id) => id.toHexString())
    .filter((hex) => hex !== removeId.toHexString());

  if (nextHex.length === existing.length) {
    return ctx.errors.notFound('User not found');
  }

  try {
    await upsertPlatformSetting({
      key: PLATFORM_SETTING_KEYS.ADMIN_ACCOUNT_LIST,
      description: doc?.description ?? 'Platform administrator user IDs',
      valueType: 'objectIdArray',
      value: nextHex,
      lastUpdatedBy: session.userId,
    });
  } catch {
    return ctx.errors.validationFailed();
  }

  const payload = await buildPlatformAdminsList();
  return success(payload);
});

router.get('/admin/platform-settings', async (ctx) => {
  const session = await getSessionFromRequest(ctx.request);
  if (!session?.userId) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.userId))) {
    return ctx.errors.forbidden();
  }

  try {
    await ensureAuthAllowlistPlatformSettingsExist(session.userId);
  } catch {
    return ctx.errors.internal();
  }

  const repo = getPlatformSettingsRepository();
  const docs = await repo.findAll();
  return success(docs.map(toPublicSetting));
});

router.get('/admin/platform-settings/:key', async (ctx) => {
  const session = await getSessionFromRequest(ctx.request);
  if (!session?.userId) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.userId))) {
    return ctx.errors.forbidden();
  }

  const key = decodeURIComponent(ctx.params.key ?? '');
  if (!isRegisteredPlatformSettingKey(key)) {
    return ctx.errors.notFound();
  }

  try {
    await ensureAuthAllowlistPlatformSettingsExist(session.userId);
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
  const session = await getSessionFromRequest(ctx.request);
  if (!session?.userId) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.userId))) {
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
      lastUpdatedBy: session.userId,
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
