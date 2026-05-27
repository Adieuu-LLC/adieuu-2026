/**
 * Admin identity management routes — identity session + platform permission gates.
 */

import { Router } from '../../router';
import { success } from '../../utils/response';
import { PLATFORM_PERMISSIONS } from '../../constants/platform-permissions';
import { requireAdminRouteContext } from './guards';
import {
  searchIdentities,
  getIdentityProfile,
  getIdentitySessions,
  getIdentityReports,
  getIdentityEntitlements,
  addIdentityEntitlement,
  removeIdentityEntitlement,
  suspendIdentity,
  unsuspendIdentity,
  banIdentity,
  unbanIdentity,
} from './identities.controller';

const router = new Router();

// Search
router.get('/admin/identities/search', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_IDENTITIES);
  if (!auth.ok) return auth.response;

  const result = await searchIdentities(ctx.query);
  if (!result.ok) return ctx.errors.validationFailed();
  return success({ identities: result.identities });
});

// Profile
router.get('/admin/identities/:id', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_IDENTITIES);
  if (!auth.ok) return auth.response;

  const result = await getIdentityProfile(ctx.params.id);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success(result.profile);
});

// Sessions
router.get('/admin/identities/:id/sessions', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_IDENTITIES);
  if (!auth.ok) return auth.response;

  const result = await getIdentitySessions(ctx.params.id);
  if (!result.ok) return ctx.errors.validationFailed();
  return success({ sessions: result.sessions });
});

// Reports
router.get('/admin/identities/:id/reports', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_IDENTITIES);
  if (!auth.ok) return auth.response;

  const result = await getIdentityReports(ctx.params.id, ctx.query);
  if (!result.ok) return ctx.errors.validationFailed();
  return success({ against: result.against, by: result.by });
});

// Entitlements
router.get('/admin/identities/:id/entitlements', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_IDENTITIES);
  if (!auth.ok) return auth.response;

  const result = await getIdentityEntitlements(ctx.params.id);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ overrides: result.overrides });
});

router.post('/admin/identities/:id/entitlements', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_IDENTITIES);
  if (!auth.ok) return auth.response;

  const result = await addIdentityEntitlement(auth.session.identityId, ctx.params.id, ctx.body);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Entitlement added' });
});

router.delete('/admin/identities/:id/entitlements/:name', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_IDENTITIES);
  if (!auth.ok) return auth.response;

  const result = await removeIdentityEntitlement(auth.session.identityId, ctx.params.id, ctx.params.name);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Entitlement removed' });
});

// Suspend
router.post('/admin/identities/:id/suspend', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_IDENTITIES);
  if (!auth.ok) return auth.response;

  const result = await suspendIdentity(auth.session.identityId, ctx.params.id, ctx.body);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Identity suspended' });
});

router.delete('/admin/identities/:id/suspend', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_IDENTITIES);
  if (!auth.ok) return auth.response;

  const result = await unsuspendIdentity(auth.session.identityId, ctx.params.id);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Suspension lifted' });
});

// Ban
router.post('/admin/identities/:id/ban', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_IDENTITIES);
  if (!auth.ok) return auth.response;

  const result = await banIdentity(auth.session.identityId, ctx.params.id, ctx.body);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Identity banned' });
});

router.delete('/admin/identities/:id/ban', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_IDENTITIES);
  if (!auth.ok) return auth.response;

  const result = await unbanIdentity(auth.session.identityId, ctx.params.id);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Ban lifted' });
});

export const adminIdentitiesRoutes = router;
