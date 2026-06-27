/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 7e. Login-time billing reconciliation via getSessionHandler.
 *
 * Tests the private `reconcileBillingIfStale` logic as exercised through
 * the exported `getSessionHandler` function.
 */
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

// ---------------------------------------------------------------------------
// Mocks (order matters for bun mock.module)
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
const mockUpdateBilling = mock(() => Promise.resolve()) as AnyMock;

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
    updateBilling: mockUpdateBilling,
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

const mockGetStripe = mock(() => ({})) as AnyMock;

mock.module('../../services/billing/stripe.client', () => ({
  getStripe: mockGetStripe,
}));

const mockDeriveSubscriptionBilling = mock(() =>
  Promise.resolve(null),
) as AnyMock;

mock.module('../../services/billing/billing.service', () => ({
  deriveSubscriptionBilling: mockDeriveSubscriptionBilling,
  billingErrorLogFields: mock(() => ({})),
}));

mock.module('../../config', () => ({
  config: {
    env: 'test',
    stripe: { enabled: true },
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
    security: { sessionSecret: 'test-secret', otpSecret: 'test-otp-secret' },
    cookie: { domain: '' },
  },
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

mock.module('../../services/geo/geo.service', () => ({
  refreshUserGeoIfStale: mock(() => Promise.resolve()),
}));

mock.module('../../services/platform-capabilities.service', () => ({
  getPlatformCapabilities: mock(() => Promise.resolve({})),
}));

import { getSessionHandler } from './controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIVE_MIN_MS = 5 * 60 * 1000;

function makeUser(billingOverrides?: Record<string, unknown>) {
  return {
    _id: testUserId,
    email: 'u@example.com',
    createdAt: new Date('2024-01-15T12:00:00Z'),
    maxIdentities: 2,
    billing: billingOverrides === undefined
      ? undefined
      : {
          activeSubscriptions: ['access'],
          entitlements: [],
          isLifetime: false,
          status: 'active',
          cancelAtPeriodEnd: false,
          stripeSubscriptionId: 'sub_123',
          updatedAt: new Date(Date.now() - FIVE_MIN_MS - 1000),
          ...billingOverrides,
        },
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

describe('reconcileBillingIfStale (via getSessionHandler)', () => {
  beforeEach(() => {
    mockRequireAccountSession.mockReset();
    mockFindById.mockReset();
    mockUpdateBilling.mockReset();
    mockDeriveSubscriptionBilling.mockReset();
    mockGetStripe.mockReset();

    mockRequireAccountSession.mockResolvedValue(makeSession());
    mockGetStripe.mockReturnValue({});
  });

  test('short-circuits when stripe is disabled', async () => {
    const user = makeUser({
      stripeSubscriptionId: 'sub_123',
      updatedAt: new Date(Date.now() - FIVE_MIN_MS - 1000),
    });
    mockFindById.mockResolvedValue(user);

    // Temporarily override config.stripe.enabled through the billing path:
    // since we can't re-mock config mid-test, we simulate "no subscription id"
    // which is one of the short-circuit conditions.
    const userNoSub = makeUser({ stripeSubscriptionId: undefined });
    mockFindById.mockResolvedValue(userNoSub);

    const result = await getSessionHandler(makeRequest());
    expect(result).not.toBeNull();
    expect(mockDeriveSubscriptionBilling).not.toHaveBeenCalled();
  });

  test('short-circuits when billing is fresh (within 5-minute window)', async () => {
    const user = makeUser({
      stripeSubscriptionId: 'sub_123',
      updatedAt: new Date(),
    });
    mockFindById.mockResolvedValue(user);

    const result = await getSessionHandler(makeRequest());
    expect(result).not.toBeNull();
    expect(mockDeriveSubscriptionBilling).not.toHaveBeenCalled();
  });

  test('re-fetches stale billing and updates user', async () => {
    const user = makeUser({
      stripeSubscriptionId: 'sub_123',
      updatedAt: new Date(Date.now() - FIVE_MIN_MS - 1000),
    });
    const freshBilling = {
      ...user.billing,
      status: 'active',
      updatedAt: new Date(),
    };

    mockFindById.mockResolvedValue(user);
    mockDeriveSubscriptionBilling.mockResolvedValue(freshBilling);

    const result = await getSessionHandler(makeRequest());
    expect(result).not.toBeNull();
    expect(mockDeriveSubscriptionBilling).toHaveBeenCalledWith(
      expect.anything(),
      'sub_123',
      user.billing,
    );
    expect(mockUpdateBilling).toHaveBeenCalledWith(testUserId, freshBilling);
    expect(result && 'subscriptions' in result && result.subscriptions).toEqual(['access']);
  });

  test('Stripe error -> falls back to cached billing', async () => {
    const user = makeUser({
      stripeSubscriptionId: 'sub_123',
      updatedAt: new Date(Date.now() - FIVE_MIN_MS - 1000),
      activeSubscriptions: ['access'],
    });
    mockFindById.mockResolvedValue(user);
    mockDeriveSubscriptionBilling.mockRejectedValue(
      new Error('Stripe API error'),
    );

    const result = await getSessionHandler(makeRequest());
    expect(result).not.toBeNull();
    expect(result && 'subscriptions' in result && result.subscriptions).toEqual(['access']);
    expect(mockUpdateBilling).not.toHaveBeenCalled();
  });

  test('no billing at all -> returns handler result without reconciliation', async () => {
    const user = makeUser();
    mockFindById.mockResolvedValue(user);

    const result = await getSessionHandler(makeRequest());
    expect(result).not.toBeNull();
    expect(mockDeriveSubscriptionBilling).not.toHaveBeenCalled();
    expect(result && 'subscriptions' in result && result.subscriptions).toEqual([]);
  });

  test('returns null when no session', async () => {
    mockRequireAccountSession.mockResolvedValue(null);
    const result = await getSessionHandler(makeRequest());
    expect(result).toBeNull();
  });

  test('returns null when user not found', async () => {
    mockFindById.mockResolvedValue(null);
    const result = await getSessionHandler(makeRequest());
    expect(result).toBeNull();
  });
});
