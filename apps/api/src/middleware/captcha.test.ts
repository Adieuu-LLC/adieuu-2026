import { describe, expect, test, mock, beforeEach } from 'bun:test';
import type { ObjectId } from 'mongodb';

const mockVerifyCaptcha = mock((_r: string | undefined) => Promise.resolve({ valid: true }));
const mockGetSessionFromRequest = mock(() => Promise.resolve(null));
const mockFindById = mock(() => Promise.resolve(null));

mock.module('../services/captcha.service', () => ({
  verifyCaptcha: mockVerifyCaptcha,
}));

mock.module('../services/captcha-session.service', () => ({
  isCaptchaVerifiedRecently: mock(() => Promise.resolve(false)),
  markCaptchaVerified: mock(() => Promise.resolve()),
}));

mock.module('../services/session.service', () => ({
  getSessionFromRequest: mockGetSessionFromRequest,
  requireAccountSession: mock(() => Promise.resolve(null)),
  getSessionIdFromRequest: mock(() => null),
}));

mock.module('../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
  }),
}));

mock.module('../config', () => ({
  config: {
    friendlyCaptcha: {
      enabled: true,
      apiKey: 'test-key',
      sitekey: 'test-sitekey',
    },
  },
}));

mock.module('../utils/response', () => ({
  error: (code: string, message: string, status: number, details?: unknown) =>
    new Response(JSON.stringify({ error: { code, message, details } }), { status }),
}));

const { requireCaptchaForFreeTier } = await import('./captcha');

function makeCtx(opts?: { body?: unknown; accountUser?: unknown }) {
  return {
    request: new Request('http://localhost:4000/test', { method: 'POST' }),
    url: new URL('http://localhost:4000/test'),
    body: opts?.body,
    accountUser: opts?.accountUser,
  } as any;
}

function makeFreeUser(overrides?: Record<string, unknown>) {
  return {
    _id: '000000000000000000000001' as unknown as ObjectId,
    billing: {
      activeSubscriptions: ['free'],
      entitlements: [],
      isLifetime: false,
      status: 'active',
      updatedAt: new Date(),
    },
    ...overrides,
  };
}

function makePaidUser(tier: string = 'access') {
  return {
    _id: '000000000000000000000002' as unknown as ObjectId,
    billing: {
      activeSubscriptions: [tier],
      entitlements: [],
      isLifetime: false,
      status: 'active',
      updatedAt: new Date(),
    },
  };
}

function makeLifetimeUser() {
  return {
    _id: '000000000000000000000003' as unknown as ObjectId,
    billing: {
      activeSubscriptions: [],
      entitlements: ['vanguard'],
      isLifetime: true,
      status: undefined,
      updatedAt: new Date(),
    },
  };
}

beforeEach(() => {
  mockVerifyCaptcha.mockReset();
  mockGetSessionFromRequest.mockReset();
  mockFindById.mockReset();

  mockVerifyCaptcha.mockImplementation(() => Promise.resolve({ valid: true }));
});

describe('requireCaptchaForFreeTier', () => {
  test('free-tier user with valid captcha passes', async () => {
    const user = makeFreeUser();
    const ctx = makeCtx({
      body: { 'frc-captcha-response': 'valid-token' },
      accountUser: user,
    });
    const result = await requireCaptchaForFreeTier(ctx, user as any);
    expect(result).toBeNull();
  });

  test('free-tier user with missing captcha is rejected (422)', async () => {
    mockVerifyCaptcha.mockImplementation(() => Promise.resolve({ valid: false, error: 'response_missing' }));
    const user = makeFreeUser();
    const ctx = makeCtx({ body: {}, accountUser: user });
    const result = await requireCaptchaForFreeTier(ctx, user as any);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(422);
  });

  test('free-tier user with invalid captcha is rejected (422)', async () => {
    mockVerifyCaptcha.mockImplementation(() => Promise.resolve({ valid: false, error: 'response_invalid' }));
    const user = makeFreeUser();
    const ctx = makeCtx({
      body: { 'frc-captcha-response': 'bad-token' },
      accountUser: user,
    });
    const result = await requireCaptchaForFreeTier(ctx, user as any);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(422);
  });

  test('paid-tier user (access) passes without captcha', async () => {
    const user = makePaidUser('access');
    const ctx = makeCtx({ body: {}, accountUser: user });
    const result = await requireCaptchaForFreeTier(ctx, user as any);
    expect(result).toBeNull();
  });

  test('paid-tier user (insider) passes without captcha', async () => {
    const user = makePaidUser('insider');
    const ctx = makeCtx({
      body: { 'frc-captcha-response': 'invalid' },
      accountUser: user,
    });
    const result = await requireCaptchaForFreeTier(ctx, user as any);
    expect(result).toBeNull();
    expect(mockVerifyCaptcha).not.toHaveBeenCalled();
  });

  test('lifetime user passes without captcha', async () => {
    const user = makeLifetimeUser();
    const ctx = makeCtx({ body: {}, accountUser: user });
    const result = await requireCaptchaForFreeTier(ctx, user as any);
    expect(result).toBeNull();
  });

  test('returns null when no user can be resolved (no session)', async () => {
    const ctx = makeCtx({ body: {} });
    const result = await requireCaptchaForFreeTier(ctx);
    expect(result).toBeNull();
  });

  test('user with no billing is not treated as free-tier', async () => {
    const user = { _id: '000000000000000000000004' as unknown as ObjectId };
    const ctx = makeCtx({ body: {}, accountUser: user });
    const result = await requireCaptchaForFreeTier(ctx, user as any);
    expect(result).toBeNull();
  });
});
