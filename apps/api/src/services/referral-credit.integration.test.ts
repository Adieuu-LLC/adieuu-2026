/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

const mockFindPendingCreditByReferredUserId = mock((): any => Promise.resolve(null));
const mockMarkCreditGranted = mock((): any => Promise.resolve(null));
const mockIncrementSubscriptionCount = mock((): any => Promise.resolve(undefined));
const mockFindById = mock((): any => Promise.resolve(null));

mock.module('../repositories/referral.repository', () => ({
  MAX_ACTIVE_CODES_PER_USER: 3,
  getReferralAttributionRepository: () => ({
    findPendingCreditByReferredUserId: mockFindPendingCreditByReferredUserId,
    markCreditGranted: mockMarkCreditGranted,
  }),
  getReferralCodeRepository: () => ({
    incrementSubscriptionCount: mockIncrementSubscriptionCount,
  }),
}));

mock.module('../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
  }),
}));

mock.module('../db/mongo', () => ({
  withTransaction: async (fn: any) => fn(undefined),
  Collections: { REFERRAL_CODES: 'referral_codes', REFERRAL_ATTRIBUTIONS: 'referral_attributions', USERS: 'users' },
  getCollection: () => ({}),
}));

mock.module('../config', () => ({
  config: { stripe: { enabled: true, prices: { accessAnnual: 'price_access' } } },
}));

mock.module('./billing/stripe.client', () => ({
  getStripe: () => ({
    prices: {
      retrieve: mock(() => Promise.resolve({ unit_amount: 12000, currency: 'usd' })),
    },
    customers: {
      createBalanceTransaction: mock(() => Promise.resolve({ id: 'txn_1' })),
    },
  }),
}));

mock.module('./billing/billing.service', () => ({
  getOrCreateStripeCustomer: mock(() => Promise.resolve('cus_1')),
}));

mock.module('../utils/adieuuLogger', () => ({
  default: { debug: mock(), info: mock(), warn: mock(), error: mock() },
}));

const { grantReferralCreditForPayment } = await import('./referral.service');

describe('referral credit integration', () => {
  beforeEach(() => {
    mockFindPendingCreditByReferredUserId.mockClear();
    mockMarkCreditGranted.mockClear();
    mockFindById.mockClear();
  });

  test('grants credit once for pending attribution', async () => {
    const referredUserId = new ObjectId();
    const referrerId = new ObjectId();

    mockFindById
      .mockResolvedValueOnce({ _id: referredUserId })
      .mockResolvedValueOnce({ _id: referrerId, stripeCustomerId: 'cus_1' });

    mockFindPendingCreditByReferredUserId.mockResolvedValueOnce({
      _id: new ObjectId(),
      referrerId,
      referredUserId,
      referralCodeId: new ObjectId(),
      code: 'abc',
      creditGranted: false,
    });

    mockMarkCreditGranted.mockResolvedValueOnce({ _id: new ObjectId() });

    const first = await grantReferralCreditForPayment(referredUserId.toHexString(), 5000);
    expect(first.granted).toBe(true);

    mockFindPendingCreditByReferredUserId.mockResolvedValueOnce(null);
    const second = await grantReferralCreditForPayment(referredUserId.toHexString(), 5000);
    expect(second.granted).toBe(false);
  });
});
