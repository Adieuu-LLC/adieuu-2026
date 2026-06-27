/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { IdentitySessionData } from '../services/session.service';

type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSessionIdFromRequest = mock(() => null) as AnyMock;
const mockGetSessionFromRequest = mock(() => Promise.resolve(null)) as AnyMock;
const mockGetGrantKeyFromRequest = mock(() => null) as AnyMock;
const mockDestroySession = mock(() => Promise.resolve()) as AnyMock;

mock.module('../services/session.service', () => ({
  getSessionIdFromRequest: mockGetSessionIdFromRequest,
  getSessionFromRequest: mockGetSessionFromRequest,
  getGrantKeyFromRequest: mockGetGrantKeyFromRequest,
  destroySession: mockDestroySession,
}));

const mockLoadIdentityFromIdentitySession = mock(() => Promise.resolve(null)) as AnyMock;

mock.module('../services/identity.service', () => ({
  loadIdentityFromIdentitySession: mockLoadIdentityFromIdentitySession,
}));

const mockEvaluateSubscriptionGrants = mock(() => ({
  subscriptions: {},
  entitlements: {},
  isLifetime: false,
})) as AnyMock;
const mockHasActiveSubscriptionGrant = mock(() => false) as AnyMock;

mock.module('../services/billing/subscription-grants', () => ({
  evaluateSubscriptionGrants: mockEvaluateSubscriptionGrants,
  hasActiveSubscriptionGrant: mockHasActiveSubscriptionGrant,
  activeLabelsFromEvaluatedGrants: (grants: { subscriptions: Record<string, string>; entitlements: Record<string, string> }) => {
    const subscriptions: string[] = [];
    const entitlements: string[] = [];
    for (const [k, v] of Object.entries(grants.subscriptions ?? {})) {
      if (v === 'current' || v === 'expiring_soon') subscriptions.push(k);
    }
    for (const [k, v] of Object.entries(grants.entitlements ?? {})) {
      if (v === 'current' || v === 'expiring_soon') entitlements.push(k);
    }
    return { subscriptions, entitlements };
  },
}));

const mockResolveIdentityOverrides = mock(() => ({
  subscriptions: [] as string[],
  entitlements: [] as string[],
})) as AnyMock;
const mockHasLifetimeIdentityOverrides = mock(() => false) as AnyMock;

mock.module('../services/billing/resolve-access', () => ({
  resolveIdentityOverrides: mockResolveIdentityOverrides,
  hasLifetimeIdentityOverrides: mockHasLifetimeIdentityOverrides,
}));

mock.module('../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { enrichIdentitySession, requireIdentitySession } from './identity-session';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_IDENTITY_ID = new ObjectId();

function makeIdentitySession(overrides: Partial<IdentitySessionData> = {}): IdentitySessionData {
  return {
    type: 'identity',
    identityId: TEST_IDENTITY_ID.toHexString(),
    maxVideoDurationSeconds: 300,
    subscriptions: [],
    entitlements: [],
    isLifetime: false,
    lastActivityAt: Date.now(),
    expiresAt: Date.now() + 86_400_000,
    ...overrides,
  };
}

function makeIdentity(overrides: Record<string, unknown> = {}) {
  return {
    _id: TEST_IDENTITY_ID,
    username: 'testuser',
    displayName: 'Test User',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeCtx(pathname = '/api/identity/profile') {
  return {
    request: new Request('http://localhost' + pathname),
    url: new URL('http://localhost' + pathname),
    identitySession: null as any,
  };
}

const nextOk = () => Promise.resolve(new Response(null, { status: 200 }));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enrichIdentitySession', () => {
  const middleware = enrichIdentitySession();

  beforeEach(() => {
    mockGetSessionIdFromRequest.mockReset();
    mockGetSessionFromRequest.mockReset();
    mockGetGrantKeyFromRequest.mockReset();
    mockDestroySession.mockReset();
    mockLoadIdentityFromIdentitySession.mockReset();
    mockEvaluateSubscriptionGrants.mockReset();
    mockHasActiveSubscriptionGrant.mockReset();

    mockGetSessionIdFromRequest.mockReturnValue(null);
    mockGetSessionFromRequest.mockResolvedValue(null);
    mockGetGrantKeyFromRequest.mockReturnValue(null);
    mockDestroySession.mockResolvedValue(undefined);
    mockLoadIdentityFromIdentitySession.mockResolvedValue(null);
    mockResolveIdentityOverrides.mockReturnValue({ subscriptions: [], entitlements: [] });
    mockHasLifetimeIdentityOverrides.mockReturnValue(false);
  });

  test('no cookie -> identitySession = null, calls next()', async () => {
    const ctx = makeCtx();
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(ctx.identitySession).toBeNull();
  });

  test('account session -> identitySession = null, calls next()', async () => {
    mockGetSessionIdFromRequest.mockReturnValue('sess-1');
    mockGetSessionFromRequest.mockResolvedValue({
      type: 'account',
      userId: 'u1',
      identifier: 'u@example.com',
      identifierType: 'email',
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    });

    const ctx = makeCtx();
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(ctx.identitySession).toBeNull();
  });

  test('valid identity session without grants -> enriches context', async () => {
    const identity = makeIdentity();
    const session = makeIdentitySession();

    mockGetSessionIdFromRequest.mockReturnValue('sess-1');
    mockGetSessionFromRequest.mockResolvedValue(session);
    mockLoadIdentityFromIdentitySession.mockResolvedValue(identity);

    const ctx = makeCtx();
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(ctx.identitySession).not.toBeNull();
    expect(ctx.identitySession.identity._id).toEqual(TEST_IDENTITY_ID);
    expect(ctx.identitySession.sessionId).toBe('sess-1');
    expect(ctx.identitySession.maxVideoDurationSeconds).toBe(300);
  });

  test('valid identity session with active grants -> enriches with grants', async () => {
    const identity = makeIdentity();
    const session = makeIdentitySession({
      encryptedSubscriptionGrants: 'ciphertext-base64',
    });
    const grants = { subscriptions: { access: 'current' }, entitlements: {} };

    mockGetSessionIdFromRequest.mockReturnValue('sess-1');
    mockGetSessionFromRequest.mockResolvedValue(session);
    mockGetGrantKeyFromRequest.mockReturnValue('grant-key-base64');
    mockEvaluateSubscriptionGrants.mockReturnValue(grants);
    mockHasActiveSubscriptionGrant.mockReturnValue(true);
    mockLoadIdentityFromIdentitySession.mockResolvedValue(identity);

    const ctx = makeCtx();
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(ctx.identitySession.grants).toEqual(grants);
    expect(ctx.identitySession.subscriptions).toContain('access');
  });

  test('encrypted grants but missing grant key -> 401, session destroyed', async () => {
    const session = makeIdentitySession({
      encryptedSubscriptionGrants: 'ciphertext-base64',
    });

    mockGetSessionIdFromRequest.mockReturnValue('sess-1');
    mockGetSessionFromRequest.mockResolvedValue(session);
    mockGetGrantKeyFromRequest.mockReturnValue(null);

    const ctx = makeCtx();
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(401);
    expect(mockDestroySession).toHaveBeenCalledWith('sess-1');

    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('expired grants (no active subscription) -> 401, session destroyed', async () => {
    const session = makeIdentitySession({
      encryptedSubscriptionGrants: 'ciphertext-base64',
    });
    const grants = { subscriptions: { access: 'expired' }, entitlements: {} };

    mockGetSessionIdFromRequest.mockReturnValue('sess-1');
    mockGetSessionFromRequest.mockResolvedValue(session);
    mockGetGrantKeyFromRequest.mockReturnValue('grant-key-base64');
    mockEvaluateSubscriptionGrants.mockReturnValue(grants);
    mockHasActiveSubscriptionGrant.mockReturnValue(false);

    const ctx = makeCtx();
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(401);
    expect(mockDestroySession).toHaveBeenCalledWith('sess-1');
  });

  test('expiring_soon grant with at least one current -> allowed', async () => {
    const identity = makeIdentity();
    const session = makeIdentitySession({
      encryptedSubscriptionGrants: 'ciphertext-base64',
    });
    const grants = {
      subscriptions: { access: 'current', insider: 'expiring_soon' },
      entitlements: {},
    };

    mockGetSessionIdFromRequest.mockReturnValue('sess-1');
    mockGetSessionFromRequest.mockResolvedValue(session);
    mockGetGrantKeyFromRequest.mockReturnValue('grant-key-base64');
    mockEvaluateSubscriptionGrants.mockReturnValue(grants);
    mockHasActiveSubscriptionGrant.mockReturnValue(true);
    mockLoadIdentityFromIdentitySession.mockResolvedValue(identity);

    const ctx = makeCtx();
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(ctx.identitySession).not.toBeNull();
  });

  test('banned identity -> 403 IDENTITY_BANNED with details', async () => {
    const session = makeIdentitySession();

    mockGetSessionIdFromRequest.mockReturnValue('sess-1');
    mockGetSessionFromRequest.mockResolvedValue(session);
    mockLoadIdentityFromIdentitySession.mockResolvedValue({
      blocked: {
        type: 'banned',
        moderationReason: 'spam',
        moderationReportId: 'rpt-123',
      },
    });

    const ctx = makeCtx();
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(403);

    const body = await res.json() as { error: { code: string; details: Record<string, string> } };
    expect(body.error.code).toBe('IDENTITY_BANNED');
    expect(body.error.details.moderationReason).toBe('spam');
  });

  test('suspended identity -> 403 IDENTITY_SUSPENDED with details', async () => {
    const session = makeIdentitySession();
    const until = new Date(Date.now() + 86_400_000).toISOString();

    mockGetSessionIdFromRequest.mockReturnValue('sess-1');
    mockGetSessionFromRequest.mockResolvedValue(session);
    mockLoadIdentityFromIdentitySession.mockResolvedValue({
      blocked: {
        type: 'suspended',
        moderationReason: 'harassment',
        suspendedUntil: until,
      },
    });

    const ctx = makeCtx();
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(403);

    const body = await res.json() as { error: { code: string; details: Record<string, string> } };
    expect(body.error.code).toBe('IDENTITY_SUSPENDED');
    expect(body.error.details.suspendedUntil).toBe(until);
  });

  test('exempt path with banned identity -> next(), no context', async () => {
    const session = makeIdentitySession();

    mockGetSessionIdFromRequest.mockReturnValue('sess-1');
    mockGetSessionFromRequest.mockResolvedValue(session);
    mockLoadIdentityFromIdentitySession.mockResolvedValue({
      blocked: { type: 'banned', moderationReason: 'spam' },
    });

    const ctx = makeCtx('/api/identity/logout');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(ctx.identitySession).toBeNull();
  });

  test('exempt path with encrypted grants -> skips grant enforcement', async () => {
    const session = makeIdentitySession({
      encryptedSubscriptionGrants: 'ciphertext-base64',
    });

    mockGetSessionIdFromRequest.mockReturnValue('sess-1');
    mockGetSessionFromRequest.mockResolvedValue(session);
    mockLoadIdentityFromIdentitySession.mockResolvedValue({
      blocked: { type: 'suspended', moderationReason: 'test' },
    });

    const ctx = makeCtx('/api/identity/logout');
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(mockEvaluateSubscriptionGrants).not.toHaveBeenCalled();
  });

  test('identity not found -> next(), identitySession = null', async () => {
    const session = makeIdentitySession();

    mockGetSessionIdFromRequest.mockReturnValue('sess-1');
    mockGetSessionFromRequest.mockResolvedValue(session);
    mockLoadIdentityFromIdentitySession.mockResolvedValue(null);

    const ctx = makeCtx();
    const res = await middleware(ctx, nextOk);
    expect(res.status).toBe(200);
    expect(ctx.identitySession).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Merge logic: grants + identity overrides + isLifetime
// ---------------------------------------------------------------------------

describe('enrichIdentitySession — merge logic', () => {
  const middleware = enrichIdentitySession();

  beforeEach(() => {
    mockGetSessionIdFromRequest.mockReset();
    mockGetSessionFromRequest.mockReset();
    mockGetGrantKeyFromRequest.mockReset();
    mockDestroySession.mockReset();
    mockLoadIdentityFromIdentitySession.mockReset();
    mockEvaluateSubscriptionGrants.mockReset();
    mockHasActiveSubscriptionGrant.mockReset();
    mockResolveIdentityOverrides.mockReset();
    mockHasLifetimeIdentityOverrides.mockReset();

    mockGetSessionIdFromRequest.mockReturnValue(null);
    mockGetSessionFromRequest.mockResolvedValue(null);
    mockGetGrantKeyFromRequest.mockReturnValue(null);
    mockDestroySession.mockResolvedValue(undefined);
    mockLoadIdentityFromIdentitySession.mockResolvedValue(null);
    mockResolveIdentityOverrides.mockReturnValue({ subscriptions: [], entitlements: [] });
    mockHasLifetimeIdentityOverrides.mockReturnValue(false);
  });

  function setupWithGrants(
    grantSubs: Record<string, string>,
    grantEnts: Record<string, string>,
    overrideSubs: string[] = [],
    overrideEnts: string[] = [],
    sessionOverrides: Partial<IdentitySessionData> = {},
    grantIsLifetime = false,
  ) {
    const identity = makeIdentity();
    const session = makeIdentitySession({
      encryptedSubscriptionGrants: 'ciphertext',
      ...sessionOverrides,
    });

    mockGetSessionIdFromRequest.mockReturnValue('sess-1');
    mockGetSessionFromRequest.mockResolvedValue(session);
    mockGetGrantKeyFromRequest.mockReturnValue('key');
    mockEvaluateSubscriptionGrants.mockReturnValue({
      subscriptions: grantSubs,
      entitlements: grantEnts,
      isLifetime: grantIsLifetime,
    });
    mockHasActiveSubscriptionGrant.mockReturnValue(true);
    mockLoadIdentityFromIdentitySession.mockResolvedValue(identity);
    mockResolveIdentityOverrides.mockReturnValue({
      subscriptions: overrideSubs,
      entitlements: overrideEnts,
    });
  }

  test('identity override adds tier not present in grants (union)', async () => {
    setupWithGrants(
      { access: 'current' }, {},
      ['insider'], [],
    );

    const ctx = makeCtx();
    await middleware(ctx, nextOk);
    expect(ctx.identitySession.subscriptions).toContain('access');
    expect(ctx.identitySession.subscriptions).toContain('insider');
  });

  test('identity override adds entitlement not present in grants', async () => {
    setupWithGrants(
      { insider: 'current' }, {},
      [], ['founder'],
    );

    const ctx = makeCtx();
    await middleware(ctx, nextOk);
    expect(ctx.identitySession.entitlements).toContain('founder');
  });

  test('duplicate tiers from grants and overrides are deduplicated', async () => {
    setupWithGrants(
      { insider: 'current' }, {},
      ['insider'], [],
    );

    const ctx = makeCtx();
    await middleware(ctx, nextOk);
    const insiderCount = ctx.identitySession.subscriptions.filter(
      (s: string) => s === 'insider',
    ).length;
    expect(insiderCount).toBe(1);
  });

  test('isLifetime true when encrypted grants carry lifetime flag', async () => {
    setupWithGrants(
      { insider: 'current' }, {},
      [], [],
      {},
      true,
    );
    mockHasLifetimeIdentityOverrides.mockReturnValue(false);

    const ctx = makeCtx();
    await middleware(ctx, nextOk);
    expect(ctx.identitySession.isLifetime).toBe(true);
  });

  test('isLifetime derived from identity overrides when grants say false', async () => {
    setupWithGrants(
      { insider: 'current' }, {},
      [], [],
      {},
      false,
    );
    mockHasLifetimeIdentityOverrides.mockReturnValue(true);

    const ctx = makeCtx();
    await middleware(ctx, nextOk);
    expect(ctx.identitySession.isLifetime).toBe(true);
  });

  test('isLifetime false when both grants and overrides say false', async () => {
    setupWithGrants(
      { access: 'current' }, {},
      [], [],
      {},
      false,
    );
    mockHasLifetimeIdentityOverrides.mockReturnValue(false);

    const ctx = makeCtx();
    await middleware(ctx, nextOk);
    expect(ctx.identitySession.isLifetime).toBe(false);
  });

  test('no grants, no overrides -> empty subscriptions and entitlements', async () => {
    const identity = makeIdentity();
    const session = makeIdentitySession();

    mockGetSessionIdFromRequest.mockReturnValue('sess-1');
    mockGetSessionFromRequest.mockResolvedValue(session);
    mockLoadIdentityFromIdentitySession.mockResolvedValue(identity);

    const ctx = makeCtx();
    await middleware(ctx, nextOk);
    expect(ctx.identitySession.subscriptions).toEqual([]);
    expect(ctx.identitySession.entitlements).toEqual([]);
  });

  test('grants with entitlements + overrides with entitlements -> union', async () => {
    setupWithGrants(
      { insider: 'current' },
      { vanguard: 'current' },
      [],
      ['founder'],
    );

    const ctx = makeCtx();
    await middleware(ctx, nextOk);
    expect(ctx.identitySession.entitlements).toContain('vanguard');
    expect(ctx.identitySession.entitlements).toContain('founder');
  });
});

describe('requireIdentitySession', () => {
  test('returns null when identitySession is present', () => {
    const ctx = {
      identitySession: { identity: makeIdentity(), sessionId: 's1' } as any,
      errors: { unauthorized: () => new Response(null, { status: 401 }) },
    };
    expect(requireIdentitySession(ctx)).toBeNull();
  });

  test('returns 401 when identitySession is null', () => {
    const ctx = {
      identitySession: null,
      errors: { unauthorized: () => new Response(null, { status: 401 }) },
    };
    const res = requireIdentitySession(ctx);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  test('returns 401 when identitySession is undefined', () => {
    const ctx = {
      errors: { unauthorized: () => new Response(null, { status: 401 }) },
    };
    const res = requireIdentitySession(ctx);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });
});
