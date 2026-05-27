/**
 * Platform admin routes — identity session + platform permission gates.
 */

import { Router } from '../../router';
import { success } from '../../utils/response';
import { PLATFORM_PERMISSIONS, PLATFORM_ROLES } from '../../constants/platform-permissions';
import { ensureAuthAllowlistPlatformSettingsExist } from '../../services/platform-settings.service';
import { requireAdminRouteContext } from './guards';
import {
  parseRegisteredPlatformSettingKey,
  upsertPlatformSettingAdminResult,
  getAdminMetricsCounts,
  listPlatformSettingDocuments,
  findPlatformSettingDocument,
  toPublicSetting,
} from './controller';
import {
  grantPlatformRoleResult,
  listPlatformRoleHoldersResult,
  revokePlatformRoleResult,
  grantPlatformAttributeResult,
  revokePlatformAttributeResult,
} from './roles.controller';

const router = new Router();

router.get('/admin/metrics', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.VIEW_ADMIN_METRICS);
  if (!auth.ok) return auth.response;

  const data = await getAdminMetricsCounts();
  return success(data);
});

router.get('/admin/platform-roles/:role', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_ROLES);
  if (!auth.ok) return auth.response;

  const result = await listPlatformRoleHoldersResult(ctx.params.role, auth.caps);
  if (!result.ok) {
    if (result.reason === 'forbidden') return ctx.errors.forbidden();
    return ctx.errors.validationFailed();
  }
  return success({ identities: result.identities });
});

router.post('/admin/identities/:id/roles', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_ROLES);
  if (!auth.ok) return auth.response;

  const result = await grantPlatformRoleResult(
    auth.session.identityId,
    ctx.params.id,
    ctx.body,
    auth.caps,
  );
  if (!result.ok) {
    if (result.reason === 'forbidden') return ctx.errors.forbidden();
    if (result.reason === 'rate_limited') return ctx.errors.rateLimited();
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ identityId: result.identityId, roles: result.roles });
});

router.delete('/admin/identities/:id/roles/:role', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_ROLES);
  if (!auth.ok) return auth.response;

  const result = await revokePlatformRoleResult(
    auth.session.identityId,
    ctx.params.id,
    ctx.params.role,
    auth.caps,
  );
  if (!result.ok) {
    if (result.reason === 'forbidden') return ctx.errors.forbidden();
    if (result.reason === 'rate_limited') return ctx.errors.rateLimited();
    if (result.reason === 'last_admin') return ctx.errors.validationFailed();
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ identityId: result.identityId, roles: result.roles });
});

router.post('/admin/identities/:id/platform-attributes', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_ROLES);
  if (!auth.ok) return auth.response;

  const result = await grantPlatformAttributeResult(
    auth.session.identityId,
    ctx.params.id,
    ctx.body,
    auth.caps,
  );
  if (!result.ok) {
    if (result.reason === 'forbidden') return ctx.errors.forbidden();
    if (result.reason === 'rate_limited') return ctx.errors.rateLimited();
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ identityId: result.identityId, attributes: result.attributes });
});

router.delete('/admin/identities/:id/platform-attributes/:attribute', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_ROLES);
  if (!auth.ok) return auth.response;

  const result = await revokePlatformAttributeResult(
    auth.session.identityId,
    ctx.params.id,
    ctx.params.attribute,
    auth.caps,
  );
  if (!result.ok) {
    if (result.reason === 'forbidden') return ctx.errors.forbidden();
    if (result.reason === 'rate_limited') return ctx.errors.rateLimited();
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ identityId: result.identityId, attributes: result.attributes });
});

/** Backward-compatible alias for admin role listing. */
router.get('/admin/platform-admins', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_ROLES);
  if (!auth.ok) return auth.response;

  const result = await listPlatformRoleHoldersResult(PLATFORM_ROLES.ADMIN, auth.caps);
  if (!result.ok) {
    if (result.reason === 'forbidden') return ctx.errors.forbidden();
    return ctx.errors.validationFailed();
  }

  const admins = result.identities.map((identity) => ({
    identityId: identity.identityId,
    displayName: identity.displayName,
    username: identity.username,
    avatarUrl: identity.avatarUrl,
  }));
  return success({ admins });
});

router.get('/admin/platform-settings', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
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
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
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

async function upsertPlatformSettingHandler(ctx: import('../../router').RouteContext) {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
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
