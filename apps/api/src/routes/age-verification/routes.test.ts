/**
 * Age-verification HTTP routes — integration tests with mocks.
 */

import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import { createHmac } from 'crypto';

const testUserId = new ObjectId();

const mockRequireAccountSession = mock(() =>
  Promise.resolve({
    type: 'account' as const,
    userId: testUserId.toHexString(),
    identifier: 'u@example.com',
    identifierType: 'email' as const,
  }),
);

mock.module('../../services/session.service', () => ({
  requireAccountSession: mockRequireAccountSession,
  getSessionFromRequest: mock(() => Promise.resolve(null)),
  getSessionIdFromRequest: mock(() => null),
  createAccountSession: mock(() => Promise.resolve({ sessionId: 'test', cookie: '' })),
  destroySession: mock(() => Promise.resolve()),
  destroyAllSessions: mock(() => Promise.resolve(0)),
  buildLogoutCookie: mock(() => ''),
}));

const mockFindById = mock((_id?: unknown) => Promise.resolve(null as unknown));

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
  }),
}));

const mockIsAgeVerificationEnabled = mock(() => Promise.resolve(true));

mock.module('../../services/age-verification/av-settings', () => ({
  isAgeVerificationEnabled: mockIsAgeVerificationEnabled,
  isAutoEmailBackgroundCheckEnabled: mock(() => Promise.resolve(false)),
  getBlockedJurisdictions: mock(() => Promise.resolve(new Set<string>())),
  getLawLinkForJurisdiction: mock((_jurisdiction: string) => Promise.resolve(undefined as string | undefined)),
  getRequiredMode: mock(() => Promise.resolve('jurisdictions' as const)),
}));

const mockStartVerification = mock(() =>
  Promise.resolve({
    verificationId: 'v-1',
    providerVerificationId: 'pv-1',
    status: 'started',
    redirectUrl: 'https://verify.example.com/x',
  }),
);

const mockCheckVerificationStatus = mock(() =>
  Promise.resolve({
    verificationId: testUserId.toHexString(),
    providerVerificationId: 'pv-1',
    status: 'approved',
  }),
);

mock.module('../../services/age-verification/age-verification.service', () => ({
  startVerification: mockStartVerification,
  checkVerificationStatus: mockCheckVerificationStatus,
}));

const mockFindByProviderVerificationId = mock(() => Promise.resolve(null));

mock.module('../../repositories/age-verification.repository', () => ({
  getAgeVerificationRepository: () => ({
    findByProviderVerificationId: mockFindByProviderVerificationId,
  }),
}));

mock.module('../../config', () => ({
  config: {
    apiBaseUrl: 'https://api.example.com',
    webAppUrl: 'http://localhost:3000',
    email: {
      fromName: 'TestApp',
    },
    verifymy: {
      apiKey: 'key',
      apiSecret: 'secret',
    },
  },
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { Router } from '../../router';

const { ageVerificationRoutes } = await import('./index');

function handler() {
  const app = new Router();
  app.merge(ageVerificationRoutes, '/api');
  return app.handler();
}

const h = handler();

function minimalUser() {
  return {
    _id: testUserId,
    email: 'u@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    maxIdentities: 2,
    geo: { jurisdiction: 'US-CA', countryCode: 'US', checkedAt: new Date() },
    billing: {
      activeSubscriptions: ['access'],
      entitlements: [],
      isLifetime: false,
      status: 'active',
      updatedAt: new Date(),
    },
  };
}

afterAll(() => {
  mock.restore();
});

describe('age-verification routes', () => {
  beforeEach(() => {
    mockRequireAccountSession.mockReset();
    mockFindById.mockReset();
    mockIsAgeVerificationEnabled.mockReset();
    mockStartVerification.mockReset();
    mockCheckVerificationStatus.mockReset();
    mockFindByProviderVerificationId.mockReset();

    mockRequireAccountSession.mockResolvedValue({
      type: 'account' as const,
      userId: testUserId.toHexString(),
      identifier: 'u@example.com',
      identifierType: 'email' as const,
    });
    mockIsAgeVerificationEnabled.mockResolvedValue(true);
    mockFindById.mockResolvedValue(minimalUser());
    mockStartVerification.mockResolvedValue({
      verificationId: 'v-1',
      providerVerificationId: 'pv-1',
      status: 'started',
      redirectUrl: 'https://verify.example.com/x',
    });
    mockCheckVerificationStatus.mockResolvedValue({
      verificationId: testUserId.toHexString(),
      providerVerificationId: 'pv-1',
      status: 'approved',
    });
    mockFindByProviderVerificationId.mockResolvedValue(null);
  });

  test('GET /api/age-verification/status returns 400 when id missing', async () => {
    const res = await h(new Request('http://localhost/api/age-verification/status'));
    expect(res.status).toBe(400);
  });

  test('GET /api/age-verification/status returns 400 when id invalid after sanitize', async () => {
    const longId = `${'a'.repeat(200)}`;
    const url = `http://localhost/api/age-verification/status?id=${encodeURIComponent(longId)}`;
    const res = await h(new Request(url));
    expect(res.status).toBe(400);
  });

  test('GET /api/age-verification/status returns 200 when id valid', async () => {
    const url = `http://localhost/api/age-verification/status?id=${encodeURIComponent('pv-safe-1')}`;
    const res = await h(new Request(url));
    expect(res.status).toBe(200);
    expect(mockCheckVerificationStatus).toHaveBeenCalled();
  });

  test('POST /api/age-verification/opt-in returns 400 for invalid country', async () => {
    const res = await h(
      new Request('http://localhost/api/age-verification/opt-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: 'USA' }),
      })
    );
    expect(res.status).toBe(400);
    expect(mockStartVerification).not.toHaveBeenCalled();
  });

  test('POST /api/age-verification/opt-in returns 200 for valid country', async () => {
    const res = await h(
      new Request('http://localhost/api/age-verification/opt-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: ' us ' }),
      })
    );
    expect(res.status).toBe(200);
    expect(mockStartVerification).toHaveBeenCalled();
  });

  test('POST /api/age-verification/webhook returns 503 when disabled', async () => {
    mockIsAgeVerificationEnabled.mockResolvedValue(false);
    const res = await h(
      new Request('http://localhost/api/age-verification/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    );
    expect(res.status).toBe(503);
  });

  test('POST /api/age-verification/webhook returns 401 when signature invalid', async () => {
    const raw = '{"verification_id":"pv-1"}';
    const res = await h(
      new Request('http://localhost/api/age-verification/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'hmac key:deadbeef',
        },
        body: raw,
      })
    );
    expect(res.status).toBe(401);
  });

  test('POST /api/age-verification/webhook returns 400 when verification_id missing after verify', async () => {
    const raw = '{}';
    const digest = createHmac('sha256', 'secret').update(raw).digest('hex');
    const res = await h(
      new Request('http://localhost/api/age-verification/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `hmac key:${digest}`,
        },
        body: raw,
      })
    );
    expect(res.status).toBe(400);
  });

  test('POST /api/age-verification/webhook returns 200 when verification unknown', async () => {
    const raw = '{"verification_id":"pv-unknown"}';
    const digest = createHmac('sha256', 'secret').update(raw).digest('hex');
    const res = await h(
      new Request('http://localhost/api/age-verification/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `hmac key:${digest}`,
        },
        body: raw,
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received?: boolean };
    expect(body.received).toBe(true);
  });
});
