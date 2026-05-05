import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument } from '../../../models/user';
import type { SubscriptionTierId } from '@adieuu/shared';

/** Mutable stripe flag for tests (controller reads `config.stripe.enabled`). */
const mockConfig = { stripe: { enabled: true } };

mock.module('../../../config', () => ({
  config: mockConfig,
}));

const mockFindById = mock((_id: string | ObjectId) => Promise.resolve<UserDocument | null>(null));

mock.module('../../../repositories/user.repository', () => ({
  getUserRepository: mock(() => ({
    findById: mockFindById,
  })),
}));

const mockResolveEffectiveAccess = mock(() => ({
  subscriptions: [] as SubscriptionTierId[],
  entitlements: [] as string[],
  isLifetime: false,
}));

mock.module('../../../services/billing/resolve-access', () => ({
  resolveEffectiveAccess: mockResolveEffectiveAccess,
}));

const mockCheckRateLimit = mock(() =>
  Promise.resolve({
    allowed: true,
    remaining: 29,
    resetAt: Date.now() + 3600_000,
    limit: 30,
  }),
);

mock.module('../../../services/rate-limit.service', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

class BillingConfigurationError extends Error {
  override name = 'BillingConfigurationError';
  constructor(message: string) {
    super(message);
  }
}

const mockCreateCheckoutSessionForProduct = mock(() =>
  Promise.resolve({ url: 'https://checkout.stripe.test/csess', sessionId: 'cs_test' }),
);
const mockCreateBillingPortalSession = mock(() =>
  Promise.resolve({ url: 'https://billing.stripe.test/portal' }),
);

mock.module('../../../services/billing/billing.service', () => ({
  BillingConfigurationError,
  billingErrorLogFields: mock(() => ({})),
  createCheckoutSessionForProduct: mockCreateCheckoutSessionForProduct,
  createBillingPortalSession: mockCreateBillingPortalSession,
}));

mock.module('../../../utils/adieuuLogger', () => ({
  default: {
    debug: mock(),
    info: mock(),
    error: mock(),
    warn: mock(),
  },
}));

import {
  getSubscriptionSummary,
  createSubscriptionCheckout,
  createSubscriptionPortal,
} from './controller';

function baseUser(overrides: Partial<UserDocument> = {}): UserDocument {
  const _id = new ObjectId();
  const now = new Date();
  return {
    _id,
    createdAt: now,
    updatedAt: now,
    emailVerified: true,
    phoneVerified: false,
    failedAttempts: 0,
    identityCount: 0,
    identityLockoutDuration: 3_600_000,
    identityLoginAttempts: [],
    stripeCustomerId: 'cus_test',
    billing: {
      status: 'active',
      activeSubscriptions: [],
      entitlements: [],
      isLifetime: false,
      currentPeriodEnd: new Date('2026-06-01T00:00:00Z'),
      cancelAtPeriodEnd: false,
      updatedAt: now,
    },
    ...overrides,
  } as UserDocument;
}

describe('subscription controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockConfig.stripe.enabled = true;
    mockFindById.mockReset();
    mockResolveEffectiveAccess.mockReset();
    mockCheckRateLimit.mockReset();
    mockCreateCheckoutSessionForProduct.mockReset();
    mockCreateBillingPortalSession.mockReset();

    mockResolveEffectiveAccess.mockImplementation(() => ({
      subscriptions: ['access'] as SubscriptionTierId[],
      entitlements: ['ent_a'],
      isLifetime: true,
    }));

    mockCheckRateLimit.mockImplementation(() =>
      Promise.resolve({
        allowed: true,
        remaining: 29,
        resetAt: Date.now() + 3600_000,
        limit: 30,
      }),
    );

    mockCreateCheckoutSessionForProduct.mockImplementation(() =>
      Promise.resolve({ url: 'https://checkout.stripe.test/csess', sessionId: 'cs_test' }),
    );

    mockCreateBillingPortalSession.mockImplementation(() =>
      Promise.resolve({ url: 'https://billing.stripe.test/portal' }),
    );
  });

  describe('getSubscriptionSummary', () => {
    test('returns stripe_disabled when Stripe is off', async () => {
      mockConfig.stripe.enabled = false;
      const result = await getSubscriptionSummary('u1');
      expect(result).toEqual({ ok: false, reason: 'stripe_disabled' });
      expect(mockFindById).not.toHaveBeenCalled();
    });

    test('returns user_not_found when user is missing', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(null));
      const result = await getSubscriptionSummary('u1');
      expect(result).toEqual({ ok: false, reason: 'user_not_found' });
    });

    test('returns summary when user exists', async () => {
      const user = baseUser();
      mockFindById.mockImplementation(() => Promise.resolve(user));

      const result = await getSubscriptionSummary(user._id.toHexString());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.activeSubscriptions).toEqual(['access']);
      expect(result.data.entitlements).toEqual(['ent_a']);
      expect(result.data.isLifetime).toBe(true);
      expect(result.data.status).toBe('active');
      expect(result.data.currentPeriodEnd).toBe(user.billing?.currentPeriodEnd?.toISOString() ?? null);
      expect(result.data.cancelAtPeriodEnd).toBe(false);
      expect(result.data.cancelAt).toBe(null);
      expect(result.data.hasStripeCustomer).toBe(true);
    });
  });

  describe('createSubscriptionCheckout', () => {
    test('returns stripe_disabled when Stripe is off', async () => {
      mockConfig.stripe.enabled = false;
      const result = await createSubscriptionCheckout('u1', 'access');
      expect(result).toEqual({ ok: false, reason: 'stripe_disabled' });
    });

    test('returns rate_limited when limit exceeded', async () => {
      mockCheckRateLimit.mockImplementation(() =>
        Promise.resolve({
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + 60_000,
          limit: 30,
        }),
      );
      const result = await createSubscriptionCheckout('u1', 'access');
      expect(result).toEqual({ ok: false, reason: 'rate_limited' });
      expect(mockFindById).not.toHaveBeenCalled();
    });

    test('returns validation for non-string product', async () => {
      const result = await createSubscriptionCheckout('u1', 123);
      expect(result).toEqual({ ok: false, reason: 'validation' });
    });

    test('returns validation for unknown product', async () => {
      const result = await createSubscriptionCheckout('u1', 'not-a-product');
      expect(result).toEqual({ ok: false, reason: 'validation' });
    });

    test('accepts purchasable id after stripping invisible characters', async () => {
      const user = baseUser();
      mockFindById.mockImplementation(() => Promise.resolve(user));

      const result = await createSubscriptionCheckout(user._id.toHexString(), 'access\u200B');

      expect(result.ok).toBe(true);
      expect(mockCreateCheckoutSessionForProduct).toHaveBeenCalledWith(user, 'access');
    });

    test('returns user_not_found when user is missing', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(null));
      const result = await createSubscriptionCheckout('u1', 'access');
      expect(result).toEqual({ ok: false, reason: 'user_not_found' });
    });

    test('returns URL on success', async () => {
      const user = baseUser();
      mockFindById.mockImplementation(() => Promise.resolve(user));

      const result = await createSubscriptionCheckout(user._id.toHexString(), 'insider');

      expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.test/csess' });
    });

    test('returns billing_config on BillingConfigurationError', async () => {
      const user = baseUser();
      mockFindById.mockImplementation(() => Promise.resolve(user));
      mockCreateCheckoutSessionForProduct.mockRejectedValue(
        new BillingConfigurationError('missing price'),
      );

      const result = await createSubscriptionCheckout(user._id.toHexString(), 'founder');

      expect(result).toEqual({ ok: false, reason: 'billing_config' });
    });

    test('returns internal on unexpected error', async () => {
      const user = baseUser();
      mockFindById.mockImplementation(() => Promise.resolve(user));
      mockCreateCheckoutSessionForProduct.mockRejectedValue(new Error('stripe down'));

      const result = await createSubscriptionCheckout(user._id.toHexString(), 'vanguard');

      expect(result).toEqual({ ok: false, reason: 'internal' });
    });
  });

  describe('createSubscriptionPortal', () => {
    test('returns stripe_disabled when Stripe is off', async () => {
      mockConfig.stripe.enabled = false;
      const result = await createSubscriptionPortal('u1');
      expect(result).toEqual({ ok: false, reason: 'stripe_disabled' });
    });

    test('returns rate_limited when limit exceeded', async () => {
      mockCheckRateLimit.mockImplementation(() =>
        Promise.resolve({
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + 60_000,
          limit: 45,
        }),
      );
      const result = await createSubscriptionPortal('u1');
      expect(result).toEqual({ ok: false, reason: 'rate_limited' });
    });

    test('returns user_not_found when user is missing', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(null));
      const result = await createSubscriptionPortal('u1');
      expect(result).toEqual({ ok: false, reason: 'user_not_found' });
    });

    test('returns no_stripe_customer when customer id absent', async () => {
      const user = baseUser({ stripeCustomerId: undefined });
      mockFindById.mockImplementation(() => Promise.resolve(user));

      const result = await createSubscriptionPortal(user._id.toHexString());

      expect(result).toEqual({ ok: false, reason: 'no_stripe_customer' });
      expect(mockCreateBillingPortalSession).not.toHaveBeenCalled();
    });

    test('returns portal URL on success', async () => {
      const user = baseUser();
      mockFindById.mockImplementation(() => Promise.resolve(user));

      const result = await createSubscriptionPortal(user._id.toHexString());

      expect(result).toEqual({
        ok: true,
        data: { url: 'https://billing.stripe.test/portal' },
      });
      expect(mockCreateBillingPortalSession).toHaveBeenCalledWith(user);
    });

    test('returns internal when portal creation throws', async () => {
      const user = baseUser();
      mockFindById.mockImplementation(() => Promise.resolve(user));
      mockCreateBillingPortalSession.mockRejectedValue(new Error('stripe error'));

      const result = await createSubscriptionPortal(user._id.toHexString());

      expect(result).toEqual({ ok: false, reason: 'internal' });
    });
  });
});
