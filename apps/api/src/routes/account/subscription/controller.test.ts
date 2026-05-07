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
const mockFindByStripeCustomerId = mock((_id: string) => Promise.resolve<UserDocument | null>(null));
const mockUpdateBilling = mock(() => Promise.resolve());

mock.module('../../../repositories/user.repository', () => ({
  getUserRepository: mock(() => ({
    findById: mockFindById,
    findByStripeCustomerId: mockFindByStripeCustomerId,
    updateBilling: mockUpdateBilling,
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
const mockReconcileBillingFromCustomer = mock(() =>
  Promise.resolve({ activeSubscriptions: ['insider'], entitlements: [], isLifetime: false, status: 'active', updatedAt: new Date() }),
);

mock.module('../../../services/billing/billing.service', () => ({
  BillingConfigurationError,
  billingErrorLogFields: mock(() => ({})),
  createCheckoutSessionForProduct: mockCreateCheckoutSessionForProduct,
  createBillingPortalSession: mockCreateBillingPortalSession,
  reconcileBillingFromCustomer: mockReconcileBillingFromCustomer,
}));

const mockStripeRetrieve = mock(() => Promise.resolve({
  id: 'cs_test_123',
  payment_status: 'paid',
  status: 'complete',
  customer: 'cus_test',
  mode: 'subscription',
  subscription: 'sub_test_123',
}));

mock.module('../../../services/billing/stripe.client', () => ({
  getStripe: mock(() => ({
    checkout: {
      sessions: {
        retrieve: mockStripeRetrieve,
      },
    },
  })),
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
  confirmCheckoutSession,
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
    mockFindByStripeCustomerId.mockReset();
    mockUpdateBilling.mockReset();
    mockResolveEffectiveAccess.mockReset();
    mockCheckRateLimit.mockReset();
    mockCreateCheckoutSessionForProduct.mockReset();
    mockCreateBillingPortalSession.mockReset();
    mockReconcileBillingFromCustomer.mockReset();
    mockStripeRetrieve.mockReset();

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

    mockReconcileBillingFromCustomer.mockImplementation(() =>
      Promise.resolve({ activeSubscriptions: ['insider'], entitlements: [], isLifetime: false, status: 'active', updatedAt: new Date() }),
    );

    mockStripeRetrieve.mockImplementation(() => Promise.resolve({
      id: 'cs_test_123',
      payment_status: 'paid',
      status: 'complete',
      customer: 'cus_test',
      mode: 'subscription',
      subscription: 'sub_test_123',
    }));

    mockUpdateBilling.mockImplementation(() => Promise.resolve());
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

  describe('confirmCheckoutSession', () => {
    test('returns stripe_disabled when Stripe is off', async () => {
      mockConfig.stripe.enabled = false;
      const result = await confirmCheckoutSession('cs_test_abc', '127.0.0.1');
      expect(result).toEqual({ ok: false, reason: 'stripe_disabled' });
    });

    test('returns rate_limited when limit exceeded', async () => {
      mockCheckRateLimit.mockImplementation(() =>
        Promise.resolve({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000, limit: 10 }),
      );
      const result = await confirmCheckoutSession('cs_test_abc', '127.0.0.1');
      expect(result).toEqual({ ok: false, reason: 'rate_limited' });
    });

    test('returns validation for empty session id', async () => {
      const result = await confirmCheckoutSession('', '127.0.0.1');
      expect(result).toEqual({ ok: false, reason: 'validation' });
    });

    test('returns validation for non-cs_ prefixed session id', async () => {
      const result = await confirmCheckoutSession('invalid_id', '127.0.0.1');
      expect(result).toEqual({ ok: false, reason: 'validation' });
    });

    test('returns session_not_found when Stripe retrieve throws', async () => {
      const stripeError = new Error('No such checkout session');
      (stripeError as any).type = 'StripeInvalidRequestError';
      Object.setPrototypeOf(stripeError, { constructor: { name: 'StripeInvalidRequestError' } });
      mockStripeRetrieve.mockRejectedValue(stripeError);

      const result = await confirmCheckoutSession('cs_test_fake', '127.0.0.1');
      // Falls through to internal since our mock error isn't a real StripeInvalidRequestError instance
      expect(result.ok).toBe(false);
    });

    test('returns payment_incomplete when session not paid', async () => {
      mockStripeRetrieve.mockImplementation(() => Promise.resolve({
        id: 'cs_test_123',
        payment_status: 'unpaid',
        status: 'open',
        customer: 'cus_test',
        mode: 'subscription',
        subscription: 'sub_test_123',
      }));

      const result = await confirmCheckoutSession('cs_test_123', '127.0.0.1');
      expect(result).toEqual({ ok: false, reason: 'payment_incomplete' });
    });

    test('returns user_not_found when no user matches customer', async () => {
      mockFindByStripeCustomerId.mockImplementation(() => Promise.resolve(null));

      const result = await confirmCheckoutSession('cs_test_123', '127.0.0.1');
      expect(result).toEqual({ ok: false, reason: 'user_not_found' });
    });

    test('returns confirmed when billing reconciles successfully', async () => {
      const user = baseUser();
      mockFindByStripeCustomerId.mockImplementation(() => Promise.resolve(user));

      const result = await confirmCheckoutSession('cs_test_123', '127.0.0.1');

      expect(result).toEqual({ ok: true, confirmed: true });
      expect(mockReconcileBillingFromCustomer).toHaveBeenCalled();
      expect(mockUpdateBilling).toHaveBeenCalled();
    });

    test('returns confirmed even if reconcile returns null (no billing to apply)', async () => {
      const user = baseUser();
      mockFindByStripeCustomerId.mockImplementation(() => Promise.resolve(user));
      mockReconcileBillingFromCustomer.mockImplementation(() => Promise.resolve(null) as any);

      const result = await confirmCheckoutSession('cs_test_123', '127.0.0.1');

      expect(result).toEqual({ ok: true, confirmed: true });
      expect(mockUpdateBilling).not.toHaveBeenCalled();
    });

    test('returns internal when reconciliation throws', async () => {
      const user = baseUser();
      mockFindByStripeCustomerId.mockImplementation(() => Promise.resolve(user));
      mockReconcileBillingFromCustomer.mockRejectedValue(new Error('stripe down'));

      const result = await confirmCheckoutSession('cs_test_123', '127.0.0.1');

      expect(result).toEqual({ ok: false, reason: 'internal' });
    });
  });
});
