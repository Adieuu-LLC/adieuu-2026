/**
 * Platform admin routes — identity session + platform admin list only.
 */

import { Router, type RouteContext } from '../../router';
import { success } from '../../utils/response';
import { requireIdentitySession } from '../../services/session.service';
import { ensureAuthAllowlistPlatformSettingsExist } from '../../services/platform-settings.service';
import {
  gatePlatformAdminSession,
  addPlatformAdminResult,
  removePlatformAdminResult,
  parseRegisteredPlatformSettingKey,
  upsertPlatformSettingAdminResult,
  getAdminMetricsCounts,
  buildPlatformAdminsList,
  listPlatformSettingDocuments,
  findPlatformSettingDocument,
  toPublicSetting,
} from './controller';

const router = new Router();

async function requireAdminRouteContext(ctx: RouteContext) {
  const session = await requireIdentitySession(ctx.request);
  const gate = await gatePlatformAdminSession(session);
  if (!gate.ok) {
    return {
      ok: false as const,
      response:
        gate.reason === 'unauthorized' ? ctx.errors.unauthorized() : ctx.errors.forbidden(),
    };
  }
  return { ok: true as const, session: gate.session };
}

router.get('/admin/metrics', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const data = await getAdminMetricsCounts();
  return success(data);
});

router.get('/admin/platform-admins', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const payload = await buildPlatformAdminsList();
  return success(payload);
});

router.post('/admin/platform-admins', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await addPlatformAdminResult(auth.session.identityId, ctx.body);
  if (!result.ok) {
    if (result.reason === 'validation_failed') return ctx.errors.validationFailed();
    if (result.reason === 'rate_limited') return ctx.errors.rateLimited();
    return ctx.errors.notFound();
  }
  return success({ admins: result.admins });
});

router.delete('/admin/platform-admins/:identityId', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await removePlatformAdminResult(auth.session.identityId, ctx.params.identityId);
  if (!result.ok) {
    if (result.reason === 'validation_failed') return ctx.errors.validationFailed();
    return ctx.errors.notFound();
  }
  return success({ admins: result.admins });
});

router.get('/admin/platform-settings', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx);
  if (!auth.ok) return auth.response;

  try {
    await ensureAuthAllowlistPlatformSettingsExist(auth.session.identityId);
  } catch {
    return ctx.errors.internal();
  }

  const docs = await listPlatformSettingDocuments();
  return success(docs.map(toPublicSetting));
});

router.get('/admin/platform-settings/:key', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const key = parseRegisteredPlatformSettingKey(ctx.params.key);
  if (!key) {
    return ctx.errors.notFound();
  }

  try {
    await ensureAuthAllowlistPlatformSettingsExist(auth.session.identityId);
  } catch {
    return ctx.errors.internal();
  }

  const doc = await findPlatformSettingDocument(key);
  if (!doc) {
    return ctx.errors.notFound();
  }

  return success(toPublicSetting(doc));
});

async function upsertPlatformSettingHandler(ctx: RouteContext) {
  const auth = await requireAdminRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const key = parseRegisteredPlatformSettingKey(ctx.params.key);
  if (!key) {
    return ctx.errors.validationFailed();
  }

  const result = await upsertPlatformSettingAdminResult(auth.session.identityId, key, ctx.body);
  if (!result.ok) {
    if (result.reason === 'validation_failed') return ctx.errors.validationFailed();
    return ctx.errors.internal();
  }

  return success(toPublicSetting(result.doc));
}

router.put('/admin/platform-settings/:key', upsertPlatformSettingHandler);
router.patch('/admin/platform-settings/:key', upsertPlatformSettingHandler);

export const adminRoutes = router;
