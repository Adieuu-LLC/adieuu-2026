/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests that getSessionHandler withholds the bridging signedToken
 * when the alias gate blocks (age verification required, failed, cooldown,
 * or geofence blocked).
 */
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireAccountSession = mock(() => Promise.resolve(null)) as AnyMock;

mock.module('../../services/session.service', () => ({
  createAccountSession: mock(() =>
    Promise.resolve({ sessionId: 'test-session', cookie: 'mock-cookie' }),
  ),
  requireAccountSession: mockRequireAccountSession,
  getSessionIdFromRequest: mock(() => null),
  destroySession: mock(() => Promise.resolve()),
  destroyAllSessions: mock(() => Promise.resolve(0)),
  buildLogoutCookie: mock(() => 'mock-logout-cookie'),
  getSessionFromRequest: mock(() => Promise.resolve(null)),
}));

const testUserId = new ObjectId();
const mockFindById = mock(() => Promise.resolve(null)) as AnyMock;

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
    updateBilling: mock(() => Promise.resolve()),
    updateAgeVerification: mock(() => Promise.resolve()),
  }),
}));

mock.module('../../repositories/identity-count.repository', () => ({
  getIdentityCountRepository: () => ({
    getCount: mock(() => Promise.resolve(0)),
  }),
}));

mock.module('../../services/account-token.service', () => ({
  generateAccountHash: mock(() => 'a'.repeat(64)),
  createSignedToken: mock(() => 'mock-signed-token'),
}));

mock.module('../../services/media-limits.service', () => ({
  getPlatformMaxVideoDurationSeconds: mock(() => Promise.resolve(300)),
  resolveMaxVideoDurationSecondsForAccount: mock(() => 300),
}));

mock.module('../../services/billing/stripe.client', () => ({
  getStripe: mock(() => ({})),
}));

mock.module('../../services/billing/billing.service', () => ({
  deriveSubscriptionBilling: mock(() => Promise.resolve(null)),
  billingErrorLogFields: mock(() => ({})),
}));

const mockEvaluateAliasGate = mock(() => Promise.resolve({ allowed: true })) as AnyMock;

mock.module('../../services/age-verification/alias-gate', () => ({
  evaluateAliasGate: mockEvaluateAliasGate,
}));

const mockIsAgeVerificationEnabled = mock(() => Promise.resolve(true)) as AnyMock;

mock.module('../../services/age-verification/av-settings', () => ({
  isAgeVerificationEnabled: mockIsAgeVerificationEnabled,
  isAutoEmailBackgroundCheckEnabled: mock(() => Promise.resolve(false)),
  getBlockedJurisdictions: mock(() => Promise.resolve(new Set<string>())),
  getLawLinkForJurisdiction: mock((_jurisdiction: string) => Promise.resolve(undefined as string | undefined)),
  getRequiredMode: mock(() => Promise.resolve('jurisdictions' as const)),
}));

mock.module('../../services/age-verification/age-verification.service', () => ({
  checkVerificationStatus: mock(() => Promise.resolve()),
}));

mock.module('../../services/age-verification/background-check.service', () => ({
  initiateBackgroundCheck: mock(() => Promise.resolve()),
}));

mock.module('../../config', () => ({
  config: {
    env: 'test',
    stripe: { enabled: false },
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
    security: { sessionSecret: 'test-secret', otpSecret: 'test-otp-secret', accountHashSecret: 'hash-secret', tokenSigningKey: 'sign-key' },
    cookie: { domain: '' },
    webAppUrl: 'http://localhost:3000',
  },
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

mock.module('../../services/geo/geo.service', () => ({
  refreshUserGeoIfStale: mock(() => Promise.resolve()),
}));

mock.module('../../services/compliance/compliance-enforcement.service', () => ({
  evaluateComplianceOnAccess: mock((user: unknown) => Promise.resolve({ action: 'none', user })),
  listSanctionedCountriesForClient: mock(() => Promise.resolve([])),
  buildVpnAttestationSessionPayload: mock(() => undefined),
}));

mock.module('../../services/platform-capabilities.service', () => ({
  getPlatformCapabilities: mock(() => Promise.resolve({})),
}));

import { getSessionHandler } from './controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides?: Record<string, unknown>) {
  return {
    _id: testUserId,
    email: 'u@example.com',
    createdAt: new Date('2024-01-15T12:00:00Z'),
    maxIdentities: 2,
    geo: { jurisdiction: 'US-CA', countryCode: 'US', checkedAt: new Date() },
    ...overrides,
  };
}

function makeSession() {
  return {
    type: 'account' as const,
    userId: testUserId.toHexString(),
    identifier: 'u@example.com',
    identifierType: 'email' as const,
    lastActivityAt: Date.now(),
    expiresAt: Date.now() + 86_400_000,
  };
}

function makeRequest() {
  return new Request('http://localhost/api/auth/session', {
    headers: { Cookie: 'adieuu_session=test-session' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getSessionHandler alias gate token withholding', () => {
  beforeEach(() => {
    mockRequireAccountSession.mockReset();
    mockFindById.mockReset();
    mockEvaluateAliasGate.mockReset();
    mockIsAgeVerificationEnabled.mockReset();

    mockRequireAccountSession.mockResolvedValue(makeSession());
    mockIsAgeVerificationEnabled.mockResolvedValue(true);
  });

  test('returns signedToken when alias gate allows', async () => {
    mockFindById.mockResolvedValue(makeUser());
    mockEvaluateAliasGate.mockResolvedValue({ allowed: true });

    const result = await getSessionHandler(makeRequest());

    expect(result).not.toBeNull();
    if (result && 'signedToken' in result) {
      expect(result.signedToken).toBe('mock-signed-token');
      expect(result.aliasGate).toEqual({ allowed: true });
    }
  });

  test('withholds signedToken when gate returns AGE_VERIFICATION_REQUIRED', async () => {
    mockFindById.mockResolvedValue(makeUser());
    mockEvaluateAliasGate.mockResolvedValue({
      allowed: false,
      code: 'AGE_VERIFICATION_REQUIRED',
      jurisdiction: 'US-CA',
      leastInvasiveMethod: 'Email',
    });

    const result = await getSessionHandler(makeRequest());

    expect(result).not.toBeNull();
    expect(result!.signedToken).toBeUndefined();
    expect(result!.aliasGate?.allowed).toBe(false);
    expect(result!.aliasGate?.code).toBe('AGE_VERIFICATION_REQUIRED');
  });

  test('withholds signedToken when gate returns GEOFENCE_BLOCKED', async () => {
    mockFindById.mockResolvedValue(makeUser());
    mockEvaluateAliasGate.mockResolvedValue({
      allowed: false,
      code: 'GEOFENCE_BLOCKED',
      jurisdiction: 'US-TX',
      lawUrl: 'https://example.com/law',
    });

    const result = await getSessionHandler(makeRequest());

    expect(result).not.toBeNull();
    expect(result!.signedToken).toBeUndefined();
    expect(result!.aliasGate?.code).toBe('GEOFENCE_BLOCKED');
  });

  test('withholds signedToken when gate returns AGE_VERIFICATION_FAILED', async () => {
    const retryAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    mockFindById.mockResolvedValue(makeUser({
      ageVerification: { status: 'failed', failedAt: new Date() },
    }));
    mockEvaluateAliasGate.mockResolvedValue({
      allowed: false,
      code: 'AGE_VERIFICATION_FAILED',
      jurisdiction: 'US-CA',
      retryAfter,
    });

    const result = await getSessionHandler(makeRequest());

    expect(result).not.toBeNull();
    expect(result!.signedToken).toBeUndefined();
    expect(result!.aliasGate?.code).toBe('AGE_VERIFICATION_FAILED');
  });

  test('withholds signedToken when gate returns AGE_VERIFICATION_COOLDOWN', async () => {
    const retryAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
    mockFindById.mockResolvedValue(makeUser({
      ageVerification: { status: 'expired', lastExpiredAt: new Date(), expirationCount: 1 },
    }));
    mockEvaluateAliasGate.mockResolvedValue({
      allowed: false,
      code: 'AGE_VERIFICATION_COOLDOWN',
      jurisdiction: 'US-CA',
      retryAfter,
    });

    const result = await getSessionHandler(makeRequest());

    expect(result).not.toBeNull();
    expect(result!.signedToken).toBeUndefined();
    expect(result!.aliasGate?.code).toBe('AGE_VERIFICATION_COOLDOWN');
  });

  test('returns signedToken when AV is disabled (no gate evaluation)', async () => {
    mockFindById.mockResolvedValue(makeUser());
    mockIsAgeVerificationEnabled.mockResolvedValue(false);

    const result = await getSessionHandler(makeRequest());

    expect(result).not.toBeNull();
    expect(result!.signedToken).toBe('mock-signed-token');
    expect(result!.aliasGate).toBeUndefined();
  });
});
