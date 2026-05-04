/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests that POST /age-verification/start denies access when the user
 * lacks an active subscription or lifetime entitlement.
 */
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const testUserId = new ObjectId();

const mockRequireAccountSession = mock(() =>
  Promise.resolve({
    type: 'account' as const,
    userId: testUserId.toHexString(),
    identifier: 'u@example.com',
    identifierType: 'email' as const,
  }),
) as AnyMock;

mock.module('../../services/session.service', () => ({
  requireAccountSession: mockRequireAccountSession,
  getSessionFromRequest: mock(() => Promise.resolve(null)),
  getSessionIdFromRequest: mock(() => null),
  createAccountSession: mock(() => Promise.resolve({ sessionId: 'test', cookie: '' })),
  destroySession: mock(() => Promise.resolve()),
  buildLogoutCookie: mock(() => ''),
}));

const mockFindById = mock(() => Promise.resolve(null)) as AnyMock;

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
  }),
}));

const mockIsAgeVerificationEnabled = mock(() => Promise.resolve(true)) as AnyMock;

mock.module('../../services/age-verification/av-settings', () => ({
  isAgeVerificationEnabled: mockIsAgeVerificationEnabled,
}));

const mockStartVerification = mock(() =>
  Promise.resolve({
    verificationId: 'v-123',
    providerVerificationId: 'pv-123',
    status: 'started',
    redirectUrl: 'https://verify.example.com/flow/pv-123',
  }),
) as AnyMock;

mock.module('../../services/age-verification/age-verification.service', () => ({
  startVerification: mockStartVerification,
  checkVerificationStatus: mock(() => Promise.resolve()),
}));

mock.module('../../config', () => ({
  config: {
    apiBaseUrl: 'https://api.example.com',
    webAppUrl: 'http://localhost:3000',
    verifymy: {
      apiKey: 'key',
      apiSecret: 'secret',
    },
  },
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

mock.module('../../utils/crypto', () => ({
  constantTimeCompare: mock(() => false),
}));

// Import module under test after mocks are set up
const { ageVerificationRoutes } = await import('./index');
const handler = ageVerificationRoutes.handler();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides?: Record<string, unknown>) {
  return {
    _id: testUserId,
    email: 'u@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    maxIdentities: 2,
    geo: { jurisdiction: 'US-CA', countryCode: 'US', checkedAt: new Date() },
    ...overrides,
  };
}

function makeRequest() {
  return new Request('http://localhost:4000/age-verification/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'adieuu_session=test-session',
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /age-verification/start subscription gate', () => {
  beforeEach(() => {
    mockRequireAccountSession.mockReset();
    mockFindById.mockReset();
    mockIsAgeVerificationEnabled.mockReset();
    mockStartVerification.mockReset();

    mockRequireAccountSession.mockResolvedValue({
      type: 'account' as const,
      userId: testUserId.toHexString(),
      identifier: 'u@example.com',
      identifierType: 'email' as const,
    });
    mockIsAgeVerificationEnabled.mockResolvedValue(true);
    mockStartVerification.mockResolvedValue({
      verificationId: 'v-123',
      providerVerificationId: 'pv-123',
      status: 'started',
      redirectUrl: 'https://verify.example.com/flow/pv-123',
    });
  });

  test('denies with SUBSCRIPTION_REQUIRED when user has no subscription', async () => {
    mockFindById.mockResolvedValue(makeUser({ billing: undefined }));

    const response = await handler(makeRequest());
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(mockStartVerification).not.toHaveBeenCalled();
  });

  test('denies with SUBSCRIPTION_EXPIRED when subscription is canceled', async () => {
    mockFindById.mockResolvedValue(makeUser({
      billing: {
        activeSubscriptions: ['access'],
        entitlements: [],
        isLifetime: false,
        status: 'canceled',
        updatedAt: new Date(),
      },
    }));

    const response = await handler(makeRequest());
    const body = (await response.json()) as { error?: { code?: string } };

    expect(response.status).toBe(403);
    expect(body.error?.code).toBe('SUBSCRIPTION_EXPIRED');
    expect(mockStartVerification).not.toHaveBeenCalled();
  });

  test('allows when user has active subscription', async () => {
    mockFindById.mockResolvedValue(makeUser({
      billing: {
        activeSubscriptions: ['access'],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        updatedAt: new Date(),
      },
    }));

    const response = await handler(makeRequest());

    expect(response.status).toBe(200);
    expect(mockStartVerification).toHaveBeenCalledTimes(1);
  });

  test('allows when user has lifetime entitlement (no billing)', async () => {
    mockFindById.mockResolvedValue(makeUser({
      billing: undefined,
      subscriptionOverrides: [
        { tierId: 'access', reason: 'lifetime', grantedAt: new Date() },
      ],
    }));

    const response = await handler(makeRequest());

    expect(response.status).toBe(200);
    expect(mockStartVerification).toHaveBeenCalledTimes(1);
  });
});
