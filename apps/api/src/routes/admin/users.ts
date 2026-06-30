/**
 * Admin user management routes — identity session + platform permission gates.
 */

import { Router } from '../../router';
import { success } from '../../utils/response';
import { PLATFORM_PERMISSIONS } from '../../constants/platform-permissions';
import { requireAdminRouteContext } from './guards';
import {
  searchUsers,
  getUserProfile,
  getUserSessions,
  getUserAuditLog,
  giftSubscription,
  approveAge,
  getEntitlements,
  addEntitlement,
  removeEntitlement,
  getSubscriptionOverrides,
  addSubscriptionOverride,
  updateSubscriptionOverride,
  removeSubscriptionOverride,
  suspendAccount,
  unsuspendAccount,
  banAccount,
  unbanAccount,
} from './users.controller';

const router = new Router();

// Search
router.get('/admin/users/search', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await searchUsers(ctx.query);
  if (!result.ok) return ctx.errors.validationFailed();
  return success({ users: result.users });
});

// Profile
router.get('/admin/users/:id', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await getUserProfile(ctx.params.id);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success(result.profile);
});

// Sessions
router.get('/admin/users/:id/sessions', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await getUserSessions(ctx.params.id);
  if (!result.ok) return ctx.errors.validationFailed();
  return success({ sessions: result.sessions });
});

// Audit log
router.get('/admin/users/:id/audit-log', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await getUserAuditLog(ctx.params.id, ctx.query);
  if (!result.ok) return ctx.errors.validationFailed();
  return success({ entries: result.entries, total: result.total });
});

// Gift subscription
router.post('/admin/users/:id/gift-subscription', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await giftSubscription(auth.session.identityId, ctx.params.id, ctx.body);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Subscription gifted' });
});

// Approve age
router.post('/admin/users/:id/approve-age', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await approveAge(auth.session.identityId, ctx.params.id);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Age verification approved' });
});

// Entitlements
router.get('/admin/users/:id/entitlements', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await getEntitlements(ctx.params.id);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ effective: result.effective, overrides: result.overrides });
});

router.post('/admin/users/:id/entitlements', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await addEntitlement(auth.session.identityId, ctx.params.id, ctx.body);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Entitlement added' });
});

router.delete('/admin/users/:id/entitlements/:name', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await removeEntitlement(auth.session.identityId, ctx.params.id, ctx.params.name);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Entitlement removed' });
});

// Subscription overrides
router.get('/admin/users/:id/subscription-overrides', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await getSubscriptionOverrides(ctx.params.id);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ effective: result.effective, overrides: result.overrides });
});

router.post('/admin/users/:id/subscription-overrides', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await addSubscriptionOverride(auth.session.identityId, ctx.params.id, ctx.body);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Subscription override added' });
});

router.patch('/admin/users/:id/subscription-overrides/:tierId', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await updateSubscriptionOverride(
    auth.session.identityId,
    ctx.params.id,
    ctx.params.tierId,
    ctx.body,
  );
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Subscription override updated' });
});

router.delete('/admin/users/:id/subscription-overrides/:tierId', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await removeSubscriptionOverride(
    auth.session.identityId,
    ctx.params.id,
    ctx.params.tierId,
  );
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Subscription override removed' });
});

// Suspend
router.post('/admin/users/:id/suspend', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await suspendAccount(auth.session.identityId, ctx.params.id, ctx.body);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Account suspended' });
});

router.delete('/admin/users/:id/suspend', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await unsuspendAccount(auth.session.identityId, ctx.params.id);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Suspension lifted' });
});

// Ban
router.post('/admin/users/:id/ban', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await banAccount(auth.session.identityId, ctx.params.id, ctx.body);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Account banned' });
});

router.delete('/admin/users/:id/ban', async (ctx) => {
  const auth = await requireAdminRouteContext(ctx, PLATFORM_PERMISSIONS.MANAGE_USERS);
  if (!auth.ok) return auth.response;

  const result = await unbanAccount(auth.session.identityId, ctx.params.id);
  if (!result.ok) {
    if (result.reason === 'not_found') return ctx.errors.notFound();
    return ctx.errors.validationFailed();
  }
  return success({ message: 'Ban lifted' });
});

export const adminUsersRoutes = router;
