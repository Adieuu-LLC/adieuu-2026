/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

const mockCheckRateLimit = mock(() =>
  Promise.resolve({ allowed: true, remaining: 9 }),
);
mock.module('./rate-limit.service', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

const mockFindById = mock((): any => Promise.resolve(null));
mock.module('../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
  }),
}));

const mockFindByCode = mock((): any => Promise.resolve(null));
const mockIsCodeReserved = mock((): any => Promise.resolve(false));
const mockCountActiveByUserId = mock((): any => Promise.resolve(0));
const mockCreateCode = mock((): any => Promise.resolve(null));
const mockFindActiveByUserId = mock((): any => Promise.resolve([]));
const mockFindOwnedCode = mock((): any => Promise.resolve(null));
const mockUpdateOwnedCode = mock((): any => Promise.resolve(null));
const mockIncrementUseCount = mock((): any => Promise.resolve(null));
const mockIncrementSignupCount = mock((): any => Promise.resolve(undefined));
const mockIncrementSubscriptionCount = mock((): any => Promise.resolve(undefined));

mock.module('../repositories/referral.repository', () => ({
  getReferralCodeRepository: () => ({
    findByCode: mockFindByCode,
    isCodeReserved: mockIsCodeReserved,
    countActiveByUserId: mockCountActiveByUserId,
    createCode: mockCreateCode,
    findActiveByUserId: mockFindActiveByUserId,
    findOwnedCode: mockFindOwnedCode,
    updateOwnedCode: mockUpdateOwnedCode,
    incrementUseCount: mockIncrementUseCount,
    incrementSignupCount: mockIncrementSignupCount,
    incrementSubscriptionCount: mockIncrementSubscriptionCount,
  }),
  getReferralAttributionRepository: () => ({
    findByReferredUserId: mockFindByReferredUserId,
    findPendingCreditByReferredUserId: mockFindPendingCreditByReferredUserId,
    createAttribution: mockCreateAttribution,
    markCreditGranted: mockMarkCreditGranted,
  }),
  MAX_ACTIVE_CODES_PER_USER: 3,
}));

const mockFindByReferredUserId = mock((): any => Promise.resolve(null));
const mockFindPendingCreditByReferredUserId = mock((): any => Promise.resolve(null));
const mockCreateAttribution = mock((): any => Promise.resolve());
const mockMarkCreditGranted = mock((): any => Promise.resolve({ _id: new ObjectId() }));

const mockFindAllByUser = mock((): any => Promise.resolve([]));
mock.module('../repositories/promo-code.repository', () => ({
  getPromoRedemptionRepository: () => ({
    findAllByUser: mockFindAllByUser,
  }),
}));

const mockWithTransaction = mock(async (fn: any) => fn(undefined));
mock.module('../db/mongo', () => ({
  withTransaction: mockWithTransaction,
  Collections: { USERS: 'users' },
  getCollection: () => ({
    updateOne: mock(() => Promise.resolve({ matchedCount: 1 })),
  }),
}));

mock.module('../utils/sanitize', () => ({
  sanitizeString: (raw: string) => ({ value: raw }),
  sanitizePathForLog: (path: string) => path,
}));

mock.module('../config', () => ({
  config: {
    stripe: {
      enabled: true,
      prices: { accessAnnual: 'price_access_annual' },
    },
  },
}));

const mockCreateBalanceTransaction = mock((): any => Promise.resolve({ id: 'txn_1' }));
const mockPricesRetrieve = mock((): any => Promise.resolve({ unit_amount: 12000, currency: 'usd' }));
mock.module('./billing/stripe.client', () => ({
  getStripe: () => ({
    prices: { retrieve: mockPricesRetrieve },
    customers: { createBalanceTransaction: mockCreateBalanceTransaction },
  }),
}));

mock.module('./billing/billing.service', () => ({
  getOrCreateStripeCustomer: mock(() => Promise.resolve('cus_referrer')),
}));

mock.module('../utils/adieuuLogger', () => ({
  default: { debug: mock(), info: mock(), warn: mock(), error: mock() },
}));

const {
  normalizeReferralCode,
  sanitizeReferralCustomMessage,
  createReferralCode,
  redeemReferralCode,
  getReferralLandingData,
  grantReferralCreditForPayment,
} = await import('./referral.service');

describe('referral.service', () => {
  beforeEach(() => {
    mockCheckRateLimit.mockClear();
    mockFindById.mockClear();
    mockFindByCode.mockClear();
    mockIsCodeReserved.mockClear();
    mockCountActiveByUserId.mockClear();
    mockCreateCode.mockClear();
    mockFindByReferredUserId.mockClear();
    mockCreateAttribution.mockClear();
    mockFindPendingCreditByReferredUserId.mockClear();
    mockMarkCreditGranted.mockClear();
    mockCreateBalanceTransaction.mockClear();
  });

  test('normalizeReferralCode lowercases and validates format', () => {
    expect(normalizeReferralCode('ABC-123')).toBe('abc-123');
    expect(normalizeReferralCode('ab')).toBeNull();
    expect(normalizeReferralCode('bad_code')).toBeNull();
  });

  test('sanitizeReferralCustomMessage trims and limits content', () => {
    expect(sanitizeReferralCustomMessage('  hello  ')).toBe('hello');
    expect(sanitizeReferralCustomMessage('')).toBeUndefined();
  });

  test('createReferralCode rejects when user has three active codes', async () => {
    mockFindById.mockResolvedValueOnce({ _id: new ObjectId() });
    mockCountActiveByUserId.mockResolvedValueOnce(3);

    const result = await createReferralCode(new ObjectId().toHexString());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('code_limit_reached');
  });

  test('createReferralCode stores custom code lowercase', async () => {
    const userId = new ObjectId();
    mockFindById.mockResolvedValueOnce({ _id: userId });
    mockCountActiveByUserId.mockResolvedValueOnce(0);
    mockCreateCode.mockResolvedValueOnce({
      _id: new ObjectId(),
      userId,
      code: 'my-code',
      previousVersions: [],
      useCount: 0,
      signupCount: 0,
      subscriptionCount: 0,
      isDeleted: false,
      createdAt: new Date(),
    });

    const result = await createReferralCode(userId.toHexString(), 'MY-CODE');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.code.code).toBe('my-code');
  });

  test('redeemReferralCode rejects self-referral', async () => {
    const userId = new ObjectId();
    mockFindById.mockResolvedValueOnce({ _id: userId });
    mockFindByReferredUserId.mockResolvedValueOnce(null);
    mockFindByCode.mockResolvedValueOnce({
      _id: new ObjectId(),
      userId,
      code: 'friend',
      isDeleted: false,
    });

    const result = await redeemReferralCode(userId.toHexString(), 'friend');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('self_referral');
  });

  test('redeemReferralCode creates attribution and increments signup count', async () => {
    const userId = new ObjectId();
    const referrerId = new ObjectId();
    const codeDoc = {
      _id: new ObjectId(),
      userId: referrerId,
      code: 'invite',
      isDeleted: false,
    };

    mockFindById.mockResolvedValueOnce({ _id: userId });
    mockFindByReferredUserId.mockResolvedValueOnce(null);
    mockFindByCode.mockResolvedValueOnce(codeDoc);

    const result = await redeemReferralCode(userId.toHexString(), 'invite');
    expect(result.ok).toBe(true);
    expect(mockCreateAttribution).toHaveBeenCalled();
    expect(mockIncrementSignupCount).toHaveBeenCalled();
  });

  test('getReferralLandingData returns invalid for deleted codes', async () => {
    mockFindByCode.mockResolvedValueOnce({ code: 'gone', isDeleted: true });
    const result = await getReferralLandingData('gone');
    expect(result.valid).toBe(false);
    expect(mockIncrementUseCount).not.toHaveBeenCalled();
  });

  test('getReferralLandingData increments use count for active codes', async () => {
    mockFindByCode.mockResolvedValueOnce({
      code: 'active',
      isDeleted: false,
      customMessage: 'Welcome!',
    });
    mockIncrementUseCount.mockResolvedValueOnce({});

    const result = await getReferralLandingData('active');
    expect(result.valid).toBe(true);
    expect(result.customMessage).toBe('Welcome!');
    expect(mockIncrementUseCount).toHaveBeenCalledWith('active');
  });

  test('grantReferralCreditForPayment skips zero-amount invoices', async () => {
    const result = await grantReferralCreditForPayment(new ObjectId().toHexString(), 0);
    expect(result.granted).toBe(false);
  });

  test('grantReferralCreditForPayment applies stripe credit and marks attribution', async () => {
    const referredUserId = new ObjectId();
    const referrerId = new ObjectId();
    const referralCodeId = new ObjectId();

    mockFindById
      .mockResolvedValueOnce({ _id: referredUserId, stripeCustomerId: 'cus_ref' })
      .mockResolvedValueOnce({ _id: referrerId, stripeCustomerId: 'cus_referrer' });

    mockFindPendingCreditByReferredUserId.mockResolvedValueOnce({
      _id: new ObjectId(),
      referrerId,
      referredUserId,
      referralCodeId,
      code: 'invite',
      creditGranted: false,
    });

    mockMarkCreditGranted.mockResolvedValueOnce({ _id: new ObjectId() });

    const result = await grantReferralCreditForPayment(referredUserId.toHexString(), 9900);
    expect(result.granted).toBe(true);
    expect(result.creditAmountCents).toBe(1000);
    expect(mockCreateBalanceTransaction).toHaveBeenCalled();
    expect(mockMarkCreditGranted).toHaveBeenCalled();
    expect(mockIncrementSubscriptionCount).toHaveBeenCalled();
  });
});
