/**
 * Account data HTTP routes — integration tests with mocks.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument } from '../../../models/user';

const testUserId = new ObjectId();

const mockRequireAccountSession = mock(() =>
  Promise.resolve({
    type: 'account' as const,
    userId: testUserId.toHexString(),
    identifier: 'test@example.com',
    identifierType: 'email' as const,
  }),
);

mock.module('../../../services/session.service', () => ({
  requireAccountSession: mockRequireAccountSession,
}));

const mockFindById = mock(() => Promise.resolve(null as UserDocument | null));

mock.module('../../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
  }),
}));

type MockGatherResult = { account: Record<string, unknown>; exportedAt: string };
type MockRequestResult =
  | { ok: true }
  | { ok: false; reason: 'rate_limited' | 'no_email' | 'internal' };
type MockConfirmResult =
  | { ok: true; cookies: string[] }
  | { ok: false; reason: 'invalid_code' | 'user_not_found' | 'no_email' | 'internal' };

const mockGatherAccountData = mock(
  (_userId: string, _user: UserDocument): Promise<MockGatherResult> =>
    Promise.resolve({ account: {}, exportedAt: new Date().toISOString() }),
);
const mockRequestAccountDeletion = mock(
  (_userId: string, _ip: string): Promise<MockRequestResult> =>
    Promise.resolve({ ok: true }),
);
const mockConfirmAccountDeletion = mock(
  (_userId: string, _identifier: string, _identifierType: string, _code: string): Promise<MockConfirmResult> =>
    Promise.resolve({ ok: true, cookies: ['adieuu_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax'] }),
);

mock.module('./controller', () => ({
  gatherAccountData: mockGatherAccountData,
  requestAccountDeletion: mockRequestAccountDeletion,
  confirmAccountDeletion: mockConfirmAccountDeletion,
}));

mock.module('../../auth/controller', () => ({
  getClientIp: mock(() => '127.0.0.1'),
}));

mock.module('../../../config', () => ({
  config: { env: 'test', cookie: { domain: '' } },
}));

mock.module('../../../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { Router } from '../../../router';

const { accountDataRoutes } = await import('./index');

function handler() {
  const app = new Router();
  app.merge(accountDataRoutes, '/api');
  return app.handler();
}

const h = handler();

function makeUser(): UserDocument {
  return {
    _id: testUserId,
    email: 'test@example.com',
    emailVerified: true,
    phoneVerified: false,
    failedAttempts: 0,
    identityCount: 0,
    identityLockoutDuration: 3600000,
    identityLoginAttempts: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as UserDocument;
}

afterAll(() => {
  mock.restore();
});

describe('GET /api/account/data-export', () => {
  beforeEach(() => {
    mockRequireAccountSession.mockReset();
    mockFindById.mockReset();
    mockGatherAccountData.mockReset();

    mockRequireAccountSession.mockResolvedValue({
      type: 'account' as const,
      userId: testUserId.toHexString(),
      identifier: 'test@example.com',
      identifierType: 'email' as const,
    });
    mockFindById.mockResolvedValue(makeUser());
    mockGatherAccountData.mockResolvedValue({
      account: { email: 'test@example.com' },
      exportedAt: new Date().toISOString(),
    });
  });

  test('returns 401 when no session', async () => {
    mockRequireAccountSession.mockResolvedValueOnce(null as never);

    const response = await h(
      new Request('http://localhost/api/account/data-export', {
        method: 'GET',
        headers: { Cookie: 'adieuu_session=invalid' },
      }),
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('returns 404 when user not found', async () => {
    mockFindById.mockResolvedValueOnce(null);

    const response = await h(
      new Request('http://localhost/api/account/data-export', {
        method: 'GET',
        headers: { Cookie: 'adieuu_session=valid-session' },
      }),
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('returns 200 with account data on success', async () => {
    const response = await h(
      new Request('http://localhost/api/account/data-export', {
        method: 'GET',
        headers: { Cookie: 'adieuu_session=valid-session' },
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: MockGatherResult };
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.account).toBeDefined();
  });

  test('calls gatherAccountData with userId and user', async () => {
    await h(
      new Request('http://localhost/api/account/data-export', {
        method: 'GET',
        headers: { Cookie: 'adieuu_session=valid-session' },
      }),
    );

    expect(mockGatherAccountData).toHaveBeenCalledTimes(1);
    const [userId, user] = mockGatherAccountData.mock.calls[0]!;
    expect(userId).toBe(testUserId.toHexString());
    expect(user._id).toEqual(testUserId);
  });
});

describe('POST /api/account/delete/request', () => {
  beforeEach(() => {
    mockRequireAccountSession.mockReset();
    mockRequestAccountDeletion.mockReset();

    mockRequireAccountSession.mockResolvedValue({
      type: 'account' as const,
      userId: testUserId.toHexString(),
      identifier: 'test@example.com',
      identifierType: 'email' as const,
    });
    mockRequestAccountDeletion.mockResolvedValue({ ok: true });
  });

  test('returns 401 when no session', async () => {
    mockRequireAccountSession.mockResolvedValueOnce(null as never);

    const response = await h(
      new Request('http://localhost/api/account/delete/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'adieuu_session=invalid',
        },
      }),
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('returns 200 with { success: true } on success', async () => {
    const response = await h(
      new Request('http://localhost/api/account/delete/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'adieuu_session=valid-session',
        },
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: { success: boolean } };
    expect(body.success).toBe(true);
    expect(body.data.success).toBe(true);
  });

  test('returns 429 when rate limited', async () => {
    mockRequestAccountDeletion.mockResolvedValueOnce({ ok: false, reason: 'rate_limited' });

    const response = await h(
      new Request('http://localhost/api/account/delete/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'adieuu_session=valid-session',
        },
      }),
    );

    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  test('returns 400 when no email', async () => {
    mockRequestAccountDeletion.mockResolvedValueOnce({ ok: false, reason: 'no_email' });

    const response = await h(
      new Request('http://localhost/api/account/delete/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'adieuu_session=valid-session',
        },
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  test('returns 500 when internal error', async () => {
    mockRequestAccountDeletion.mockResolvedValueOnce({ ok: false, reason: 'internal' });

    const response = await h(
      new Request('http://localhost/api/account/delete/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'adieuu_session=valid-session',
        },
      }),
    );

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  test('passes session data and IP to requestAccountDeletion', async () => {
    await h(
      new Request('http://localhost/api/account/delete/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'adieuu_session=valid-session',
        },
      }),
    );

    expect(mockRequestAccountDeletion).toHaveBeenCalledTimes(1);
    const [userId, ip] = mockRequestAccountDeletion.mock.calls[0]!;
    expect(userId).toBe(testUserId.toHexString());
    expect(ip).toBe('127.0.0.1');
  });
});

describe('POST /api/account/delete/confirm', () => {
  beforeEach(() => {
    mockRequireAccountSession.mockReset();
    mockConfirmAccountDeletion.mockReset();

    mockRequireAccountSession.mockResolvedValue({
      type: 'account' as const,
      userId: testUserId.toHexString(),
      identifier: 'test@example.com',
      identifierType: 'email' as const,
    });
    mockConfirmAccountDeletion.mockResolvedValue({
      ok: true,
      cookies: [
        'adieuu_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
        'adieuu_csrf=; Max-Age=0; Path=/; SameSite=Lax',
      ],
    });
  });

  test('returns 401 when no session', async () => {
    mockRequireAccountSession.mockResolvedValueOnce(null as never);

    const response = await h(
      new Request('http://localhost/api/account/delete/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'adieuu_session=invalid',
        },
        body: JSON.stringify({ code: '123456' }),
      }),
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  test('returns 422 when code is missing', async () => {
    const response = await h(
      new Request('http://localhost/api/account/delete/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'adieuu_session=valid-session',
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  test('returns 422 when code is wrong length', async () => {
    const response = await h(
      new Request('http://localhost/api/account/delete/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'adieuu_session=valid-session',
        },
        body: JSON.stringify({ code: '123' }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  test('returns 200 with Set-Cookie headers on success', async () => {
    const response = await h(
      new Request('http://localhost/api/account/delete/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'adieuu_session=valid-session',
        },
        body: JSON.stringify({ code: '123456' }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean };
    expect(body.success).toBe(true);

    const setCookies = response.headers.getSetCookie?.() ?? [];
    expect(setCookies.some((c) => c.includes('adieuu_session=') && c.includes('Max-Age=0'))).toBe(true);
    expect(setCookies.some((c) => c.includes('adieuu_csrf=') && c.includes('Max-Age=0'))).toBe(true);
  });

  test('returns verification failed error when invalid code', async () => {
    mockConfirmAccountDeletion.mockResolvedValueOnce({ ok: false, reason: 'invalid_code' });

    const response = await h(
      new Request('http://localhost/api/account/delete/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'adieuu_session=valid-session',
        },
        body: JSON.stringify({ code: '999999' }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('VERIFICATION_FAILED');
  });

  test('returns 404 when user not found during confirm', async () => {
    mockConfirmAccountDeletion.mockResolvedValueOnce({ ok: false, reason: 'user_not_found' });

    const response = await h(
      new Request('http://localhost/api/account/delete/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'adieuu_session=valid-session',
        },
        body: JSON.stringify({ code: '123456' }),
      }),
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
