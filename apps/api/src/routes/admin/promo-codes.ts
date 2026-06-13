/**
 * Admin promotional code routes.
 */

import { Router } from '../../router';
import { success } from '../../utils/response';
import { PLATFORM_PERMISSIONS } from '../../constants/platform-permissions';
import { requireAdminRouteContext } from './guards';
import { safeDecodeUriComponent } from './controller';
import { getAuditLogRepository } from '../../repositories/audit.repository';
import {
  listPromoCodesAdmin,
  createPromoCodeAdmin,
  updatePromoCodeAdmin,
  deletePromoCodeAdmin,
  listPromoRedemptionsAdmin,
} from '../../services/promo-code.service';

const router = new Router();

function parseShortcodeParam(segment: string | undefined): string | null {
  const decoded = safeDecodeUriComponent(segment);
  return decoded || null;
}

router.get('/admin/promo-codes', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
  if (!auth.ok) return auth.response;

  const result = await listPromoCodesAdmin(ctx.query);
  if (!result.ok) {
    if (result.reason === 'validation_failed') return ctx.errors.validationFailed();
    return ctx.errors.internal();
  }

  return success(result.data);
});

router.post('/admin/promo-codes', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
  if (!auth.ok) return auth.response;

  const result = await createPromoCodeAdmin(ctx.body);
  if (!result.ok) {
    if (result.reason === 'validation_failed') return ctx.errors.validationFailed();
    if (result.reason === 'conflict') return ctx.errors.validationFailed();
    return ctx.errors.internal();
  }

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    action: 'admin_create_promo_code',
    ipHash: 'admin',
    metadata: {
      shortcode: result.data.shortcode,
      adminIdentityId: auth.session.identityId,
    },
  });

  return success(result.data);
});

router.put('/admin/promo-codes/:shortcode', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
  if (!auth.ok) return auth.response;

  const shortcode = parseShortcodeParam(ctx.params.shortcode);
  if (!shortcode) return ctx.errors.validationFailed();

  const result = await updatePromoCodeAdmin(shortcode, ctx.body);
  if (!result.ok) {
    if (result.reason === 'validation_failed') return ctx.errors.validationFailed();
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.internal();
  }

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    action: 'admin_update_promo_code',
    ipHash: 'admin',
    metadata: {
      shortcode: result.data.shortcode,
      adminIdentityId: auth.session.identityId,
    },
  });

  return success(result.data);
});

router.delete('/admin/promo-codes/:shortcode', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
  if (!auth.ok) return auth.response;

  const shortcode = parseShortcodeParam(ctx.params.shortcode);
  if (!shortcode) return ctx.errors.validationFailed();

  const result = await deletePromoCodeAdmin(shortcode);
  if (!result.ok) {
    if (result.reason === 'validation_failed') return ctx.errors.validationFailed();
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.internal();
  }

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    action: 'admin_delete_promo_code',
    ipHash: 'admin',
    metadata: {
      shortcode,
      adminIdentityId: auth.session.identityId,
    },
  });

  return success(result.data);
});

router.get('/admin/promo-codes/:shortcode/redemptions', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
  if (!auth.ok) return auth.response;

  const shortcode = parseShortcodeParam(ctx.params.shortcode);
  if (!shortcode) return ctx.errors.validationFailed();

  const result = await listPromoRedemptionsAdmin(shortcode, ctx.query);
  if (!result.ok) {
    if (result.reason === 'validation_failed') return ctx.errors.validationFailed();
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.internal();
  }

  return success(result.data);
});

export const adminPromoCodesRoutes = router;
