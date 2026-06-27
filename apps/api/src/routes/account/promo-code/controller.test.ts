/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument } from '../../../models/user';
import type { SubscriptionTierId } from '@adieuu/shared';

const mockRedeemPromoCode: any = mock(() =>
  Promise.resolve({
    ok: true as const,
    shortcode: 'welcome-access',
    entitlementsApplied: [] as string[],
  }),
);

mock.module('../../../services/promo-code.service', () => ({
  redeemPromoCode: mockRedeemPromoCode,
}));

const mockGetSubscriptionSummary: any = mock(() =>
  Promise.resolve({
    ok: true as const,
    data: {
      activeSubscriptions: ['access'] as SubscriptionTierId[],
      entitlements: [],
      isLifetime: false,
      planBadge: 'annual' as const,
      planExpiresAt: '2026-12-01T00:00:00.000Z',
      status: 'active' as const,
      currentPeriodEnd: '2026-12-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      cancelAt: null,
      hasStripeCustomer: true,
      sponsoredExpiry: null,
    },
  }),
);

mock.module('../subscription/controller', () => {
  const { resolveSubscriptionPlanDisplay } = require('../../../services/billing/subscription-plan-display');

  function buildSubscriptionSummaryFromUser(user: UserDocument) {
    const resolved = mockResolveEffectiveAccess();
    const plan = resolveSubscriptionPlanDisplay(user);
    const hasGifted = resolved.entitlements.includes('gifted');
    let sponsoredExpiry: string | null = null;
    if (hasGifted && user.subscriptionOverrides?.length) {
      const now = new Date();
      const activeOverrides = user.subscriptionOverrides
        .filter((o: { expiresAt?: Date }) => o.expiresAt && o.expiresAt > now)
        .sort((a: { expiresAt?: Date }, b: { expiresAt?: Date }) => a.expiresAt!.getTime() - b.expiresAt!.getTime());
      if (activeOverrides.length > 0) {
        sponsoredExpiry = activeOverrides[0]!.expiresAt!.toISOString();
      }
    }

    return {
      activeSubscriptions: resolved.subscriptions,
      entitlements: resolved.entitlements,
      isLifetime: plan.isLifetime,
      planBadge: plan.planBadge,
      planExpiresAt: plan.planExpiresAt?.toISOString() ?? null,
      status: user.billing?.status ?? null,
      currentPeriodEnd: user.billing?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: user.billing?.cancelAtPeriodEnd ?? false,
      cancelAt: user.billing?.cancelAt?.toISOString() ?? null,
      hasStripeCustomer: !!user.stripeCustomerId,
      sponsoredExpiry,
    };
  }

  return {
    getSubscriptionSummary: mockGetSubscriptionSummary,
    buildSubscriptionSummaryFromUser,
  };
});

const mockFindById = mock((_id: string | ObjectId) => Promise.resolve<UserDocument | null>(null));

mock.module('../../../repositories/user.repository', () => ({
  getUserRepository: mock(() => ({
    findById: mockFindById,
  })),
}));

const mockResolveEffectiveAccess = mock(() => ({
  subscriptions: ['access'] as SubscriptionTierId[],
  entitlements: ['gifted'],
  isLifetime: false,
}));

mock.module('../../../services/billing/resolve-access', () => ({
  resolveEffectiveAccess: mockResolveEffectiveAccess,
}));

mock.module('../../../utils/adieuuLogger', () => ({
  default: {
    debug: mock(),
    info: mock(),
    error: mock(),
    warn: mock(),
  },
}));

import { redeemPromoCodeForUser } from './controller';

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
    billing: {
      status: 'active',
      activeSubscriptions: ['access'],
      entitlements: ['gifted'],
      isLifetime: false,
      updatedAt: now,
    },
    subscriptionOverrides: [
      {
        tier: 'access',
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ],
    ...overrides,
  } as UserDocument;
}

describe('promo-code controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockRedeemPromoCode.mockReset();
    mockGetSubscriptionSummary.mockReset();
    mockFindById.mockReset();
    mockResolveEffectiveAccess.mockReset();

    mockRedeemPromoCode.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        shortcode: 'welcome-access',
        entitlementsApplied: [],
      }),
    );

    mockGetSubscriptionSummary.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        data: {
          activeSubscriptions: ['access'],
          entitlements: [],
          isLifetime: false,
          planBadge: 'annual',
          planExpiresAt: '2026-12-01T00:00:00.000Z',
          status: 'active',
          currentPeriodEnd: '2026-12-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
          cancelAt: null,
          hasStripeCustomer: true,
          sponsoredExpiry: null,
        },
      }),
    );

    mockResolveEffectiveAccess.mockImplementation(() => ({
      subscriptions: ['access'],
      entitlements: ['gifted'],
      isLifetime: false,
    }));
  });

  test('forwards redeem service failures without calling subscription summary', async () => {
    mockRedeemPromoCode.mockResolvedValueOnce({ ok: false, reason: 'not_found' });

    const result = await redeemPromoCodeForUser('user-1', 'missing-code');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('not_found');
    }
    expect(mockGetSubscriptionSummary).not.toHaveBeenCalled();
  });

  test('forwards audience_restricted error without calling subscription summary', async () => {
    mockRedeemPromoCode.mockResolvedValueOnce({ ok: false, reason: 'audience_restricted' });

    const result = await redeemPromoCodeForUser('user-1', 'exclusive-code');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('audience_restricted');
    }
    expect(mockGetSubscriptionSummary).not.toHaveBeenCalled();
  });

  test('returns subscription status from getSubscriptionSummary on success', async () => {
    mockRedeemPromoCode.mockResolvedValueOnce({
      ok: true,
      shortcode: 'welcome-access',
      subscriptionApplied: {
        tier: 'access',
        expiresAt: '2026-09-01T00:00:00.000Z',
      },
      entitlementsApplied: ['gifted'],
    });

    const result = await redeemPromoCodeForUser('user-1', 'welcome-access');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.shortcode).toBe('welcome-access');
      expect(result.data.subscriptionApplied?.tier).toBe('access');
      expect(result.data.entitlementsApplied).toEqual(['gifted']);
      expect(result.data.subscriptionStatus.activeSubscriptions).toEqual(['access']);
      expect(result.data.subscriptionStatus.hasStripeCustomer).toBe(true);
    }
    expect(mockGetSubscriptionSummary).toHaveBeenCalledWith('user-1');
    expect(mockFindById).not.toHaveBeenCalled();
  });

  test('returns success with fallback summary when subscription summary fails for a non-stripe reason', async () => {
    mockGetSubscriptionSummary.mockResolvedValueOnce({
      ok: false,
      reason: 'user_not_found',
    });
    mockFindById.mockResolvedValueOnce(null);

    const result = await redeemPromoCodeForUser('user-1', 'welcome-access');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.subscriptionStatus.activeSubscriptions).toEqual([]);
      expect(result.data.subscriptionStatus.hasStripeCustomer).toBe(false);
    }
  });

  test('builds subscription status from user when stripe is disabled', async () => {
    const user = baseUser();
    mockGetSubscriptionSummary.mockResolvedValueOnce({
      ok: false,
      reason: 'stripe_disabled',
    });
    mockFindById.mockResolvedValueOnce(user);

    const result = await redeemPromoCodeForUser(user._id.toString(), 'welcome-access');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.subscriptionStatus.activeSubscriptions).toEqual(['access']);
      expect(result.data.subscriptionStatus.entitlements).toEqual(['gifted']);
      expect(result.data.subscriptionStatus.sponsoredExpiry).toBe('2026-09-01T00:00:00.000Z');
      expect(result.data.subscriptionStatus.planBadge).toBe('expiring');
      expect(result.data.subscriptionStatus.isLifetime).toBe(false);
      expect(result.data.subscriptionStatus.hasStripeCustomer).toBe(false);
    }
    expect(mockFindById).toHaveBeenCalled();
    expect(mockResolveEffectiveAccess).toHaveBeenCalled();
  });

  test('returns success with empty fallback when stripe is disabled and user cannot be loaded', async () => {
    mockGetSubscriptionSummary.mockResolvedValueOnce({
      ok: false,
      reason: 'stripe_disabled',
    });
    mockFindById.mockResolvedValueOnce(null);

    const result = await redeemPromoCodeForUser('missing-user', 'welcome-access');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.subscriptionStatus.activeSubscriptions).toEqual([]);
      expect(result.data.subscriptionStatus.entitlements).toEqual([]);
      expect(result.data.subscriptionStatus.hasStripeCustomer).toBe(false);
    }
  });
});
