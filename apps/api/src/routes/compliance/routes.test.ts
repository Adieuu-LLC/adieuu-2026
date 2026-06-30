/**
 * Compliance HTTP routes — integration tests with mocks.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument } from '../../models/user';

const testUserId = new ObjectId();

const mockRequireAccountSession = mock(() =>
  Promise.resolve({
    type: 'account' as const,
    userId: testUserId.toHexString(),
    identifier: 'u@example.com',
    identifierType: 'email' as const,
  }),
);

const mockAppendAuthClearCookies = mock((headers: Headers) => {
  headers.append('Set-Cookie', 'adieuu_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
  headers.append('Set-Cookie', 'adieuu_csrf=; Max-Age=0; Path=/; SameSite=Lax');
});

mock.module('../../services/session.service', () => ({
  requireAccountSession: mockRequireAccountSession,
  appendAuthClearCookies: mockAppendAuthClearCookies,
}));

const mockFindById = mock(() => Promise.resolve(null as UserDocument | null));

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
  }),
}));

type MockVpnAttestationHandlerResult =
  | { ok: true; next?: 'utah_notice' | 'continue' }
  | { ok: false; reason: 'validation_failed' }
  | { ok: false; banned: true; silent: true };

const mockPostVpnAttestationHandler = mock(
  (): Promise<MockVpnAttestationHandlerResult> => Promise.resolve({ ok: true, next: 'continue' }),
);

mock.module('./controller', () => ({
  postVpnAttestationHandler: mockPostVpnAttestationHandler,
  VpnAttestationSchema: {},
}));

mock.module('../auth/controller', () => ({
  getClientIp: mock(() => '1.2.3.4'),
}));

mock.module('../../config', () => ({
  config: {
    env: 'test',
    cookie: { domain: '' },
    email: { fromName: 'Adieuu' },
  },
}));

mock.module('../../services/compliance/compliance-enforcement.service', () => ({
  submitVpnAttestation: mock(() => Promise.resolve({ ok: true, next: 'continue' })),
}));

import { Router } from '../../router';

const { complianceRoutes } = await import('./index');

function handler() {
  const app = new Router();
  app.merge(complianceRoutes, '/api');
  return app.handler();
}

const h = handler();

function makeUser(): UserDocument {
  return {
    _id: testUserId,
    emailVerified: false,
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

describe('POST /api/compliance/vpn-attestation', () => {
  beforeEach(() => {
    mockRequireAccountSession.mockReset();
    mockAppendAuthClearCookies.mockReset();
    mockFindById.mockReset();
    mockPostVpnAttestationHandler.mockReset();

    mockRequireAccountSession.mockResolvedValue({
      type: 'account' as const,
      userId: testUserId.toHexString(),
      identifier: 'u@example.com',
      identifierType: 'email' as const,
    });
    mockAppendAuthClearCookies.mockImplementation((headers: Headers) => {
      headers.append('Set-Cookie', 'adieuu_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
      headers.append('Set-Cookie', 'adieuu_csrf=; Max-Age=0; Path=/; SameSite=Lax');
    });
    mockFindById.mockResolvedValue(makeUser());
    mockPostVpnAttestationHandler.mockResolvedValue({ ok: true, next: 'continue' });
  });

  test('clears auth cookies when attestation self-ban is returned', async () => {
    mockPostVpnAttestationHandler.mockResolvedValueOnce({
      ok: false,
      banned: true,
      silent: true,
    });

    const response = await h(
      new Request('http://localhost/api/compliance/vpn-attestation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'adieuu_session=test-session',
        },
        body: JSON.stringify({ step: 'sanctioned_membership', answer: 'yes' }),
      }),
    );

    expect(response.status).toBe(403);
    const body = await response.json() as {
      error: { code: string; message: string; details?: { moderationReason?: string } };
    };
    expect(body.error.code).toBe('ACCOUNT_BANNED');
    expect(body.error.message).toContain('export-control self-attestation');
    expect(body.error.details?.moderationReason).toContain('export-control self-attestation');
    expect(mockAppendAuthClearCookies).toHaveBeenCalledTimes(1);

    const setCookies = response.headers.getSetCookie?.() ?? [];
    expect(setCookies.some((cookie) => cookie.includes('adieuu_session=') && cookie.includes('Max-Age=0'))).toBe(true);
    expect(setCookies.some((cookie) => cookie.includes('adieuu_csrf=') && cookie.includes('Max-Age=0'))).toBe(true);
  });
});
