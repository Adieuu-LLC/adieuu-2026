/**
 * Platform admin routes — session + platform admin list only.
 */

import { ObjectId } from 'mongodb';
import { Router, type RouteContext } from '../../router';
import { success } from '../../utils/response';
import { getSessionFromRequest } from '../../services/session.service';
import {
  isPlatformAdmin,
  upsertPlatformSetting,
} from '../../services/platform-settings.service';
import { isRegisteredPlatformSettingKey } from '../../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../../repositories/platform-settings.repository';
import type { PlatformSettingsDocument, PlatformSettingValueType } from '../../models/platform-settings';
import { z } from '@adieuu/shared/schemas';

const router = new Router();

const PutPlatformSettingSchema = z.object({
  valueType: z.enum(['boolean', 'string', 'number', 'stringArray', 'objectIdArray']),
  value: z.unknown(),
  description: z.string().optional(),
});

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

router.get('/admin/platform-settings', async (ctx) => {
  const session = await getSessionFromRequest(ctx.request);
  if (!session?.userId) {
    return ctx.errors.unauthorized();
  }
  if (!(await isPlatformAdmin(session.userId))) {
    return ctx.errors.forbidden();
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
