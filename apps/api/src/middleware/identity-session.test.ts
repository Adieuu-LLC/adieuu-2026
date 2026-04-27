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
})) as AnyMock;
const mockHasActiveSubscriptionGrant = mock(() => false) as AnyMock;

mock.module('../services/billing/subscription-grants', () => ({
  evaluateSubscriptionGrants: mockEvaluateSubscriptionGrants,
  hasActiveSubscriptionGrant: mockHasActiveSubscriptionGrant,
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
