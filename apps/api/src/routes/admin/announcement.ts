import { Router } from '../../router';
import { success } from '../../utils/response';
import { PLATFORM_PERMISSIONS } from '../../constants/platform-permissions';
import { requireAdminRouteContext } from './guards';
import {
  listAnnouncementsResult,
  createAnnouncementResult,
  updateAnnouncementResult,
  toggleAnnouncementActiveResult,
  deleteAnnouncementResult,
  toAdminAnnouncement,
} from './announcement.controller';

const router = new Router();

router.get('/admin/announcements', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
  if (!auth.ok) return auth.response;

  const result = await listAnnouncementsResult();
  return success({ announcements: result.announcements.map(toAdminAnnouncement) });
});

router.post('/admin/announcements', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
  if (!auth.ok) return auth.response;

  const result = await createAnnouncementResult(auth.session.identityId, ctx.body);
  if (!result.ok) {
    if (result.reason === 'validation_failed') return ctx.errors.validationFailed();
    return ctx.errors.internal();
  }
  return success({ announcement: toAdminAnnouncement(result.announcement) }, undefined, 201);
});

router.put('/admin/announcements/:id', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
  if (!auth.ok) return auth.response;

  const id = ctx.params.id;
  if (!id) return ctx.errors.validationFailed();

  const result = await updateAnnouncementResult(id, ctx.body);
  if (!result.ok) {
    if (result.reason === 'validation_failed') return ctx.errors.validationFailed();
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.internal();
  }
  return success({ announcement: toAdminAnnouncement(result.announcement) });
});

router.patch('/admin/announcements/:id/active', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
  if (!auth.ok) return auth.response;

  const id = ctx.params.id;
  if (!id) return ctx.errors.validationFailed();

  const result = await toggleAnnouncementActiveResult(id, ctx.body);
  if (!result.ok) {
    if (result.reason === 'validation_failed') return ctx.errors.validationFailed();
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.internal();
  }
  return success({ announcement: toAdminAnnouncement(result.announcement) });
});

router.delete('/admin/announcements/:id', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
  if (!auth.ok) return auth.response;

  const id = ctx.params.id;
  if (!id) return ctx.errors.validationFailed();

  const result = await deleteAnnouncementResult(id);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.internal();
  }
  return success({ deleted: true });
});

export const adminAnnouncementRoutes = router;
