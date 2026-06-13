/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument, UserBilling, SubscriptionOverride } from '../models/user';
import type { PromoCodeDocument } from '../models/promo-code';
import type { SubscriptionTierId } from '@adieuu/shared';

// ---------------------------------------------------------------------------
// Mocks (registered before import)
// ---------------------------------------------------------------------------

const mockCheckRateLimit = mock(() =>
  Promise.resolve({ allowed: true, remaining: 14 }),
);
mock.module('./rate-limit.service', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

const mockFindById = mock((): any => Promise.resolve(null));
const mockAddSubscriptionOverride = mock((): any => Promise.resolve());
const mockAddEntitlementOverride = mock((): any => Promise.resolve());

mock.module('../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
    addSubscriptionOverride: mockAddSubscriptionOverride,
    addEntitlementOverride: mockAddEntitlementOverride,
  }),
}));

const mockFindByShortcode = mock((): any => Promise.resolve(null));
const mockTryIncrementUses = mock((): any => Promise.resolve(true));
const mockCreateCode = mock((): any => Promise.resolve(null));

mock.module('../repositories/promo-code.repository', () => ({
  getPromoCodeRepository: () => ({
    findByShortcode: mockFindByShortcode,
    tryIncrementUses: mockTryIncrementUses,
    createCode: mockCreateCode,
  }),
  getPromoRedemptionRepository: () => ({
    findByUserAndShortcode: mockFindByUserAndShortcode,
    findShortcodesByUser: mockFindShortcodesByUser,
    createRedemption: mockCreateRedemption,
  }),
}));

const mockFindByUserAndShortcode = mock((): any => Promise.resolve(null));
const mockFindShortcodesByUser = mock((): any => Promise.resolve([]));
const mockCreateRedemption = mock((): any => Promise.resolve());

const mockWithTransaction = mock(async (fn: any) => fn({}));
mock.module('../db/mongo', () => ({
  withTransaction: mockWithTransaction,
}));

const mockResolveEffectiveAccess = mock((): any => ({
  subscriptions: [] as SubscriptionTierId[],
  entitlements: [],
  isLifetime: false,
}));
mock.module('./billing/resolve-access', () => ({
  resolveEffectiveAccess: mockResolveEffectiveAccess,
}));

const mockSubscriptionsCreate = mock((): any =>
  Promise.resolve({ id: 'sub_promo_123', status: 'trialing' }),
);
const mockPricesRetrieve = mock((): any =>
  Promise.resolve({ unit_amount: 9900, currency: 'usd' }),
);
const mockCreateBalanceTransaction = mock((): any =>
  Promise.resolve({ id: 'txn_123' }),
);

mock.module('./billing/stripe.client', () => ({
  getStripe: () => ({
    subscriptions: { create: mockSubscriptionsCreate },
    prices: { retrieve: mockPricesRetrieve },
    customers: { createBalanceTransaction: mockCreateBalanceTransaction },
  }),
}));

mock.module('../config', () => ({
  config: {
    stripe: {
      enabled: true,
      secretKey: 'sk_test_xxx',
      prices: {
        accessAnnual: 'price_access_annual',
        insiderAnnual: 'price_insider_annual',
        vanguardLifetime: 'price_vanguard_lifetime',
        founderLifetime: 'price_founder_lifetime',
      },
    },
  },
}));

mock.module('../utils/sanitize', () => ({
  sanitizeString: (_raw: string, _kind: string) => ({ value: _raw }),
}));

mock.module('./geo/jurisdiction', () => ({
  parseJurisdictionList: (raw: string[]) => raw,
}));

mock.module('../utils/adieuuLogger', () => ({
  default: {
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
  },
}));

const { redeemPromoCode } = await import('./promo-code.service');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_ID = new ObjectId();

function baseUser(overrides: Partial<UserDocument> = {}): UserDocument {
  const now = new Date();
  return {
    _id: USER_ID,
    createdAt: now,
    updatedAt: now,
    emailVerified: true,
    phoneVerified: false,
    failedAttempts: 0,
    identityCount: 0,
    identityLockoutDuration: 3_600_000,
    identityLoginAttempts: [],
    stripeCustomerId: 'cus_test_123',
    ...overrides,
  } as UserDocument;
}

function baseCode(overrides: Partial<PromoCodeDocument> = {}): PromoCodeDocument {
  const now = new Date();
  return {
    _id: new ObjectId(),
    shortcode: 'welcome-access',
    entitlements: [],
    requiredCodes: [],
    incompatibleCodes: [],
    maxUses: null,
    currentUses: 0,
    jurisdictions: [],
    validFrom: null,
    validTo: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as PromoCodeDocument;
}

function makeSubGrant(tier: SubscriptionTierId = 'access', months = 3) {
  return { tier, durationMonths: months };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  mockCheckRateLimit.mockReset();
  mockFindById.mockReset();
  mockAddSubscriptionOverride.mockReset();
  mockAddEntitlementOverride.mockReset();
  mockFindByShortcode.mockReset();
  mockTryIncrementUses.mockReset();
  mockFindByUserAndShortcode.mockReset();
  mockFindShortcodesByUser.mockReset();
  mockCreateRedemption.mockReset();
  mockWithTransaction.mockReset();
  mockResolveEffectiveAccess.mockReset();
  mockSubscriptionsCreate.mockReset();
  mockPricesRetrieve.mockReset();
  mockCreateBalanceTransaction.mockReset();

  mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 14 });
  mockTryIncrementUses.mockResolvedValue(true);
  mockWithTransaction.mockImplementation(async (fn: any) => fn({}));
  mockResolveEffectiveAccess.mockReturnValue({
    subscriptions: [],
    entitlements: [],
    isLifetime: false,
  });
  mockSubscriptionsCreate.mockResolvedValue({ id: 'sub_promo_123', status: 'trialing' });
  mockPricesRetrieve.mockResolvedValue({ unit_amount: 9900, currency: 'usd' });
  mockCreateBalanceTransaction.mockResolvedValue({ id: 'txn_123' });
});

// ---------------------------------------------------------------------------
// Audience restriction tests
// ---------------------------------------------------------------------------

describe('audience restriction: first_time', () => {
  test('rejects user who has a Stripe subscription history', async () => {
    const user = baseUser({
      billing: {
        stripeSubscriptionId: 'sub_old_123',
        activeSubscriptions: [],
        entitlements: [],
        isLifetime: false,
        status: 'canceled',
        updatedAt: new Date(),
      } as UserBilling,
    });

    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant(), audience: 'first_time' }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('audience_restricted');
    }
  });

  test('rejects user who has subscription overrides', async () => {
    const user = baseUser({
      subscriptionOverrides: [
        { tier: 'access' as SubscriptionTierId, expiresAt: new Date('2025-01-01') },
      ] as SubscriptionOverride[],
    });

    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant(), audience: 'first_time' }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('audience_restricted');
    }
  });

  test('allows user with no subscription history', async () => {
    const user = baseUser();
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant(), audience: 'first_time' }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
  });
});

describe('audience restriction: unsubscribed', () => {
  test('rejects user with active subscriptions', async () => {
    const user = baseUser({
      billing: {
        activeSubscriptions: ['access'] as SubscriptionTierId[],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        updatedAt: new Date(),
      } as UserBilling,
    });

    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant(), audience: 'unsubscribed' }),
    );
    mockResolveEffectiveAccess.mockReturnValue({
      subscriptions: ['access'],
      entitlements: [],
      isLifetime: false,
    });

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('audience_restricted');
    }
  });

  test('allows user with no active subscriptions', async () => {
    const user = baseUser();
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant(), audience: 'unsubscribed' }),
    );
    mockResolveEffectiveAccess.mockReturnValue({
      subscriptions: [],
      entitlements: [],
      isLifetime: false,
    });

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
  });
});

describe('audience restriction: all', () => {
  test('allows any user (default)', async () => {
    const user = baseUser({
      billing: {
        activeSubscriptions: ['access'] as SubscriptionTierId[],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        stripeSubscriptionId: 'sub_active',
        updatedAt: new Date(),
      } as UserBilling,
    });

    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant(), audience: 'all' }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
  });

  test('allows user even without audience field (undefined defaults to all)', async () => {
    const user = baseUser();
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant() }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stripe integration: trial subscription (new users)
// ---------------------------------------------------------------------------

describe('stripe trial subscription (new users)', () => {
  test('creates trial subscription for user with no active subs and stripeCustomerId', async () => {
    const user = baseUser({ stripeCustomerId: 'cus_new_user' });
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3) }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
    expect(mockSubscriptionsCreate).toHaveBeenCalledTimes(1);

    const createArgs = (mockSubscriptionsCreate.mock.calls as any[][])[0]![0];
    expect(createArgs.customer).toBe('cus_new_user');
    expect(createArgs.items[0].price).toBe('price_access_annual');
    expect(createArgs.trial_settings.end_behavior.missing_payment_method).toBe('cancel');
    expect(createArgs.metadata.source).toBe('promo');
  });

  test('records trial stripe action in redemption', async () => {
    const user = baseUser({ stripeCustomerId: 'cus_new_user' });
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3) }),
    );

    await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');

    const redemptionArg = (mockCreateRedemption.mock.calls as any[][])[0]![0];
    expect(redemptionArg.stripeAction).toBe('trial');
  });

  test('does NOT create local subscription override when trial succeeds', async () => {
    const user = baseUser({ stripeCustomerId: 'cus_new_user' });
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3) }),
    );

    await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(mockAddSubscriptionOverride).not.toHaveBeenCalled();
  });

  test('falls back to override when trial creation fails', async () => {
    const user = baseUser({ stripeCustomerId: 'cus_new_user' });
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3) }),
    );
    mockSubscriptionsCreate.mockRejectedValue(new Error('Stripe unavailable'));

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
    expect(mockAddSubscriptionOverride).toHaveBeenCalled();

    const redemptionArg = (mockCreateRedemption.mock.calls as any[][])[0]![0];
    expect(redemptionArg.stripeAction).toBe('override');
  });

  test('falls back to override when user has no stripeCustomerId', async () => {
    const user = baseUser({ stripeCustomerId: undefined });
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3) }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    expect(mockAddSubscriptionOverride).toHaveBeenCalled();

    const redemptionArg = (mockCreateRedemption.mock.calls as any[][])[0]![0];
    expect(redemptionArg.stripeAction).toBe('override');
  });
});

// ---------------------------------------------------------------------------
// Stripe integration: balance credit (existing subscribers)
// ---------------------------------------------------------------------------

describe('stripe balance credit (existing subscribers)', () => {
  function existingSubUser() {
    return baseUser({
      stripeCustomerId: 'cus_existing',
      billing: {
        activeSubscriptions: ['access'] as SubscriptionTierId[],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        stripeSubscriptionId: 'sub_existing_123',
        updatedAt: new Date(),
      } as UserBilling,
    });
  }

  test('applies balance credit for existing subscriber', async () => {
    const user = existingSubUser();
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3) }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
    expect(mockCreateBalanceTransaction).toHaveBeenCalledTimes(1);
    expect(mockPricesRetrieve).toHaveBeenCalledWith('price_access_annual');
  });

  test('calculates correct credit amount (pro-rata from annual price)', async () => {
    const user = existingSubUser();
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3) }),
    );

    await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');

    const txnArgs = (mockCreateBalanceTransaction.mock.calls as any[][])[0]!;
    expect(txnArgs[0]).toBe('cus_existing');
    // 9900 / 12 * 3 = 2475 cents, negative for credit
    expect(txnArgs[1].amount).toBe(-2475);
    expect(txnArgs[1].currency).toBe('usd');
    expect(txnArgs[1].description).toContain('welcome-access');
  });

  test('records credit stripe action in redemption', async () => {
    const user = existingSubUser();
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3) }),
    );

    await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');

    const redemptionArg = (mockCreateRedemption.mock.calls as any[][])[0]![0];
    expect(redemptionArg.stripeAction).toBe('credit');
  });

  test('does NOT create local subscription override when credit succeeds', async () => {
    const user = existingSubUser();
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3) }),
    );

    await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(mockAddSubscriptionOverride).not.toHaveBeenCalled();
  });

  test('falls back to override when balance credit fails', async () => {
    const user = existingSubUser();
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3) }),
    );
    mockCreateBalanceTransaction.mockRejectedValue(new Error('Stripe down'));

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
    expect(mockAddSubscriptionOverride).toHaveBeenCalled();

    const redemptionArg = (mockCreateRedemption.mock.calls as any[][])[0]![0];
    expect(redemptionArg.stripeAction).toBe('override');
  });

  test('falls back to override when price has no unit_amount', async () => {
    const user = existingSubUser();
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3) }),
    );
    mockPricesRetrieve.mockResolvedValue({ unit_amount: null, currency: 'usd' });

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
    expect(mockAddSubscriptionOverride).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Override path (no Stripe sub, no Stripe customer)
// ---------------------------------------------------------------------------

describe('override path', () => {
  test('creates local subscription override when no Stripe available', async () => {
    const user = baseUser({ stripeCustomerId: undefined });
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 6) }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subscriptionApplied?.tier).toBe('access');
    }
    expect(mockAddSubscriptionOverride).toHaveBeenCalled();
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    expect(mockCreateBalanceTransaction).not.toHaveBeenCalled();
  });

  test('records override stripe action', async () => {
    const user = baseUser({ stripeCustomerId: undefined });
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant() }),
    );

    await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');

    const redemptionArg = (mockCreateRedemption.mock.calls as any[][])[0]![0];
    expect(redemptionArg.stripeAction).toBe('override');
  });
});

// ---------------------------------------------------------------------------
// Entitlement-only codes (no subscription grant)
// ---------------------------------------------------------------------------

describe('entitlement-only codes', () => {
  test('does not attempt Stripe integration for non-subscription codes', async () => {
    const user = baseUser();
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ entitlements: ['vanguard'] }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entitlementsApplied).toEqual(['vanguard']);
      expect(result.subscriptionApplied).toBeUndefined();
    }
    expect(mockSubscriptionsCreate).not.toHaveBeenCalled();
    expect(mockCreateBalanceTransaction).not.toHaveBeenCalled();
  });

  test('does not record stripeAction for entitlement-only codes', async () => {
    const user = baseUser();
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ entitlements: ['vanguard'] }),
    );

    await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');

    const redemptionArg = (mockCreateRedemption.mock.calls as any[][])[0]![0];
    expect(redemptionArg.stripeAction).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Edge cases and pre-existing validation paths
// ---------------------------------------------------------------------------

describe('pre-existing validation paths still work', () => {
  test('invalid shortcode returns validation error', async () => {
    const result = await redeemPromoCode(USER_ID.toHexString(), '');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('validation');
  });

  test('rate limited user is rejected', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 } as any);
    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('rate_limited');
  });

  test('unknown user returns user_not_found', async () => {
    mockFindById.mockResolvedValue(null);
    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('user_not_found');
  });

  test('unknown shortcode returns not_found', async () => {
    mockFindById.mockResolvedValue(baseUser());
    mockFindByShortcode.mockResolvedValue(null);
    const result = await redeemPromoCode(USER_ID.toHexString(), 'nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not_found');
  });

  test('expired code returns expired', async () => {
    mockFindById.mockResolvedValue(baseUser());
    mockFindByShortcode.mockResolvedValue(
      baseCode({ validTo: new Date('2020-01-01') }),
    );
    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  test('already redeemed returns already_redeemed', async () => {
    mockFindById.mockResolvedValue(baseUser());
    mockFindByShortcode.mockResolvedValue(baseCode({ subscription: makeSubGrant() }));
    mockFindByUserAndShortcode.mockResolvedValue({ shortcode: 'welcome-access' });

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('already_redeemed');
  });

  test('max uses reached returns max_uses_reached', async () => {
    mockFindById.mockResolvedValue(baseUser());
    mockFindByShortcode.mockResolvedValue(
      baseCode({ maxUses: 5, currentUses: 5, subscription: makeSubGrant() }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('max_uses_reached');
  });

  test('jurisdiction restricted returns jurisdiction_restricted', async () => {
    mockFindById.mockResolvedValue(baseUser({ geo: { jurisdiction: 'DE' } } as any));
    mockFindByShortcode.mockResolvedValue(
      baseCode({ jurisdictions: ['US-TN'] }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('jurisdiction_restricted');
  });
});

// ---------------------------------------------------------------------------
// Audience + Stripe action interaction
// ---------------------------------------------------------------------------

describe('audience + stripe action combinations', () => {
  test('first_time code with trial path succeeds for brand new user', async () => {
    const user = baseUser({ stripeCustomerId: 'cus_brand_new' });
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3), audience: 'first_time' }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
    expect(mockSubscriptionsCreate).toHaveBeenCalledTimes(1);
  });

  test('unsubscribed code with balance credit is not possible (no active sub = no credit)', async () => {
    const user = baseUser({ stripeCustomerId: 'cus_no_sub' });
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3), audience: 'unsubscribed' }),
    );
    mockResolveEffectiveAccess.mockReturnValue({
      subscriptions: [],
      entitlements: [],
      isLifetime: false,
    });

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
    expect(mockCreateBalanceTransaction).not.toHaveBeenCalled();
    expect(mockSubscriptionsCreate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Return value structure
// ---------------------------------------------------------------------------

describe('return value structure', () => {
  test('trial path returns subscriptionApplied with correct dates', async () => {
    const user = baseUser({ stripeCustomerId: 'cus_new' });
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 3) }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subscriptionApplied).toBeDefined();
      expect(result.subscriptionApplied?.tier).toBe('access');
      const expiresAt = new Date(result.subscriptionApplied!.expiresAt);
      const threeMonthsFromNow = new Date();
      threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
      expect(Math.abs(expiresAt.getTime() - threeMonthsFromNow.getTime())).toBeLessThan(5000);
    }
  });

  test('override path returns subscriptionApplied with expiry', async () => {
    const user = baseUser({ stripeCustomerId: undefined });
    mockFindById.mockResolvedValue(user);
    mockFindByShortcode.mockResolvedValue(
      baseCode({ subscription: makeSubGrant('access', 6) }),
    );

    const result = await redeemPromoCode(USER_ID.toHexString(), 'welcome-access');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.subscriptionApplied?.tier).toBe('access');
      const expiresAt = new Date(result.subscriptionApplied!.expiresAt);
      const sixMonthsFromNow = new Date();
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
      expect(Math.abs(expiresAt.getTime() - sixMonthsFromNow.getTime())).toBeLessThan(5000);
    }
  });
});
