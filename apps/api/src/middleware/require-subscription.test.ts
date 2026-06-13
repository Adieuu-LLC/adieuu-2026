/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import type { UserBilling, SubscriptionOverride } from '../models/user';
import type { ResolvedAccess } from '../services/billing/resolve-access';

type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

// ---------------------------------------------------------------------------
// Mocks for middleware tests (must be registered before import)
// ---------------------------------------------------------------------------

const mockGetSessionFromRequest = mock(() => Promise.resolve(null)) as AnyMock;

mock.module('../services/session.service', () => ({
  getSessionFromRequest: mockGetSessionFromRequest,
}));

const mockFindById = mock(() => Promise.resolve(null)) as AnyMock;

mock.module('../repositories/user.repository', () => ({
  getUserRepository: () => ({ findById: mockFindById }),
}));

mock.module('../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { evaluateBillingAccess, PAST_DUE_GRACE_MS, requireActiveSubscription } from './require-subscription';

function makeBilling(overrides: Partial<UserBilling> = {}): UserBilling {
  return {
    activeSubscriptions: ['access'],
    entitlements: [],
    isLifetime: false,
    status: 'active',
    cancelAtPeriodEnd: false,
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeResolved(overrides: Partial<ResolvedAccess> = {}): ResolvedAccess {
  return {
    subscriptions: ['access'],
    entitlements: [],
    isLifetime: false,
    ...overrides,
  };
}

describe('evaluateBillingAccess', () => {
  // 7c. Subscription guard middleware
  test('active with subscriptions -> null (allowed)', () => {
    expect(evaluateBillingAccess(makeResolved(), makeBilling())).toBeNull();
  });

  test('active with access + insider -> null', () => {
    const billing = makeBilling({ activeSubscriptions: ['access', 'insider'] });
    const resolved = makeResolved({ subscriptions: ['access', 'insider'] });
    expect(evaluateBillingAccess(resolved, billing)).toBeNull();
  });

  test('empty subscriptions -> SUBSCRIPTION_REQUIRED', () => {
    const resolved = makeResolved({ subscriptions: [] });
    expect(evaluateBillingAccess(resolved, makeBilling({ activeSubscriptions: [] }))).toBe('SUBSCRIPTION_REQUIRED');
  });

  test('no billing and no overrides -> SUBSCRIPTION_REQUIRED', () => {
    const resolved = makeResolved({ subscriptions: [] });
    expect(evaluateBillingAccess(resolved, undefined)).toBe('SUBSCRIPTION_REQUIRED');
  });

  test('status canceled -> SUBSCRIPTION_EXPIRED', () => {
    const billing = makeBilling({ status: 'canceled' });
    const resolved = makeResolved();
    expect(evaluateBillingAccess(resolved, billing)).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('status unpaid -> SUBSCRIPTION_EXPIRED', () => {
    const billing = makeBilling({ status: 'unpaid' });
    const resolved = makeResolved();
    expect(evaluateBillingAccess(resolved, billing)).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('status incomplete_expired -> SUBSCRIPTION_EXPIRED', () => {
    const billing = makeBilling({ status: 'incomplete_expired' });
    const resolved = makeResolved();
    expect(evaluateBillingAccess(resolved, billing)).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('status past_due within 48h grace -> null (allowed)', () => {
    const billing = makeBilling({ status: 'past_due', updatedAt: new Date(Date.now() - PAST_DUE_GRACE_MS + 10000) });
    expect(evaluateBillingAccess(makeResolved(), billing)).toBeNull();
  });

  test('status past_due beyond 48h grace -> SUBSCRIPTION_EXPIRED', () => {
    const billing = makeBilling({ status: 'past_due', updatedAt: new Date(Date.now() - PAST_DUE_GRACE_MS - 10000) });
    expect(evaluateBillingAccess(makeResolved(), billing)).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('status trialing -> null (allowed)', () => {
    expect(evaluateBillingAccess(makeResolved(), makeBilling({ status: 'trialing' }))).toBeNull();
  });

  test('isLifetime + active subscription -> null (allowed)', () => {
    const resolved = makeResolved({ isLifetime: true });
    expect(evaluateBillingAccess(resolved, makeBilling({ isLifetime: true }))).toBeNull();
  });

  test('isLifetime + empty activeSubscriptions -> null (allowed)', () => {
    const resolved = makeResolved({ subscriptions: [], isLifetime: true });
    expect(evaluateBillingAccess(resolved, makeBilling({ isLifetime: true, activeSubscriptions: [] }))).toBeNull();
  });

  test('isLifetime + denied status -> null (lifetime overrides status)', () => {
    const resolved = makeResolved({ isLifetime: true });
    expect(evaluateBillingAccess(resolved, makeBilling({ isLifetime: true, status: 'canceled' }))).toBeNull();
  });

  test('overrides provide subscription with canceled billing -> null (allowed)', () => {
    const billing = makeBilling({ status: 'canceled', activeSubscriptions: ['access'] });
    const resolved = makeResolved({ subscriptions: ['access', 'insider'] });
    const overrides: SubscriptionOverride[] = [{ tier: 'insider', expiresAt: new Date(Date.now() + 86_400_000) }];
    expect(evaluateBillingAccess(resolved, billing, overrides)).toBeNull();
  });

  test('overrides provide subscription with no billing -> null (allowed)', () => {
    const resolved = makeResolved({ subscriptions: ['insider'] });
    expect(evaluateBillingAccess(resolved, undefined)).toBeNull();
  });

  test('same-tier override with canceled billing -> null (allowed)', () => {
    const billing = makeBilling({ status: 'canceled', activeSubscriptions: ['access'] });
    const resolved = makeResolved({ subscriptions: ['access'] });
    const overrides: SubscriptionOverride[] = [{ tier: 'access', expiresAt: new Date(Date.now() + 86_400_000) }];
    expect(evaluateBillingAccess(resolved, billing, overrides)).toBeNull();
  });

  test('expired override with canceled billing -> SUBSCRIPTION_EXPIRED', () => {
    const billing = makeBilling({ status: 'canceled', activeSubscriptions: ['access'] });
    const resolved = makeResolved({ subscriptions: ['access'] });
    const overrides: SubscriptionOverride[] = [{ tier: 'access', expiresAt: new Date(Date.now() - 86_400_000) }];
    expect(evaluateBillingAccess(resolved, billing, overrides)).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('no-expiry override with canceled billing -> null (allowed)', () => {
    const billing = makeBilling({ status: 'canceled', activeSubscriptions: ['access'] });
    const resolved = makeResolved({ subscriptions: ['access'] });
    const overrides: SubscriptionOverride[] = [{ tier: 'access' }];
    expect(evaluateBillingAccess(resolved, billing, overrides)).toBeNull();
  });

  test('same-tier override with past_due beyond grace -> null (allowed)', () => {
    const billing = makeBilling({ status: 'past_due', updatedAt: new Date(Date.now() - PAST_DUE_GRACE_MS - 10000) });
    const resolved = makeResolved({ subscriptions: ['access'] });
    const overrides: SubscriptionOverride[] = [{ tier: 'access', expiresAt: new Date(Date.now() + 86_400_000) }];
    expect(evaluateBillingAccess(resolved, billing, overrides)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7c (extended). requireActiveSubscription middleware
// ---------------------------------------------------------------------------

describe('requireActiveSubscription middleware', () => {
  const middleware = requireActiveSubscription();
  const nextOk = () => Promise.resolve(new Response(null, { status: 200 }));

  function makeCtx(pathname: string) {
    return {
      request: new Request('http://localhost' + pathname),
      url: new URL('http://localhost' + pathname),
    };
  }

  beforeEach(() => {
    mockGetSessionFromRequest.mockReset();
    mockFindById.mockReset();
  });

  test('exempt path /api/auth/session -> passes through without checking', async () => {
    const ctx = makeCtx('/api/auth/session');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(mockGetSessionFromRequest).not.toHaveBeenCalled();
  });

  test('exempt path /api/webhooks/stripe -> passes through', async () => {
    const ctx = makeCtx('/api/webhooks/stripe');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
  });

  test('exempt path /api/health -> passes through', async () => {
    const ctx = makeCtx('/api/health');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
  });

  test('exempt path /api/account/subscription -> passes through', async () => {
    const ctx = makeCtx('/api/account/subscription');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
  });

  test('exempt path /api/v1/releases -> passes through', async () => {
    const ctx = makeCtx('/api/v1/releases/latest/latest.yml');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
  });

  test('exempt path /api/users/me -> passes through', async () => {
    const ctx = makeCtx('/api/users/me');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(mockGetSessionFromRequest).not.toHaveBeenCalled();
  });

  test('exempt path /api/users/me/email/verify -> passes through', async () => {
    const ctx = makeCtx('/api/users/me/email/verify');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(mockGetSessionFromRequest).not.toHaveBeenCalled();
  });

  test('exempt path /api/geo/requirements -> passes through', async () => {
    const ctx = makeCtx('/api/geo/requirements');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(mockGetSessionFromRequest).not.toHaveBeenCalled();
  });

  test('no session -> passes through (identity or unauthenticated)', async () => {
    mockGetSessionFromRequest.mockResolvedValue(null);
    const ctx = makeCtx('/api/themes');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
  });

  test('identity session type -> passes through (enforced elsewhere)', async () => {
    mockGetSessionFromRequest.mockResolvedValue({
      type: 'identity',
      identityId: 'id-1',
      maxVideoDurationSeconds: 300,
      subscriptions: [],
      entitlements: [],
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    });
    const ctx = makeCtx('/api/themes');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  test('account session with active billing -> passes through and attaches context', async () => {
    mockGetSessionFromRequest.mockResolvedValue({
      type: 'account',
      userId: 'user-1',
      identifier: 'u@example.com',
      identifierType: 'email',
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    });
    const user = { _id: 'user-1', billing: makeBilling() };
    mockFindById.mockResolvedValue(user);

    const ctx = makeCtx('/api/themes') as any;
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(ctx.accountUser).toBe(user);
    expect(ctx.resolvedAccess).toBeDefined();
    expect(ctx.resolvedAccess.subscriptions).toContain('access');
  });

  test('account session with no billing -> 403 SUBSCRIPTION_REQUIRED', async () => {
    mockGetSessionFromRequest.mockResolvedValue({
      type: 'account',
      userId: 'user-1',
      identifier: 'u@example.com',
      identifierType: 'email',
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    });
    mockFindById.mockResolvedValue({
      _id: 'user-1',
      billing: undefined,
    });

    const ctx = makeCtx('/api/themes');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(403);

    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  test('account session with canceled status -> 403 SUBSCRIPTION_EXPIRED', async () => {
    mockGetSessionFromRequest.mockResolvedValue({
      type: 'account',
      userId: 'user-1',
      identifier: 'u@example.com',
      identifierType: 'email',
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    });
    mockFindById.mockResolvedValue({
      _id: 'user-1',
      billing: makeBilling({ status: 'canceled' }),
    });

    const ctx = makeCtx('/api/themes');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(403);

    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('account session with user not found -> passes through', async () => {
    mockGetSessionFromRequest.mockResolvedValue({
      type: 'account',
      userId: 'user-1',
      identifier: 'u@example.com',
      identifierType: 'email',
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    });
    mockFindById.mockResolvedValue(null);

    const ctx = makeCtx('/api/themes');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
  });
});
