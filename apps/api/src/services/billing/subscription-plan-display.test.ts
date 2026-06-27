import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument } from '../../models/user';
import {
  isLifetimeSubscription,
  resolvePlanBadge,
  resolvePlanExpiresAt,
  resolveSubscriptionPlanDisplay,
} from './subscription-plan-display';

function makeUser(overrides: Partial<UserDocument> = {}): UserDocument {
  return {
    _id: new ObjectId(),
    emailVerified: false,
    phoneVerified: false,
    failedAttempts: 0,
    identityCount: 0,
    identityLockoutDuration: 3_600_000,
    identityLoginAttempts: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('subscription-plan-display', () => {
  test('does not treat entitlement overrides alone as lifetime subscription', () => {
    const user = makeUser({
      entitlementOverrides: ['founder'],
      billing: {
        activeSubscriptions: ['access'],
        entitlements: [],
        isLifetime: false,
        status: 'trialing',
        currentPeriodEnd: new Date('2026-07-14T12:00:00.000Z'),
        updatedAt: new Date(),
      },
    });

    expect(isLifetimeSubscription(user)).toBe(false);
    expect(resolvePlanBadge(user)).toBe('expiring');
    expect(resolvePlanExpiresAt(user)?.toISOString()).toBe('2026-07-14T12:00:00.000Z');
  });

  test('treats lifetime billing as lifetime subscription', () => {
    const user = makeUser({
      billing: {
        activeSubscriptions: ['insider'],
        entitlements: ['vanguard'],
        isLifetime: true,
        status: 'active',
        updatedAt: new Date(),
      },
    });

    const display = resolveSubscriptionPlanDisplay(user);
    expect(display.isLifetime).toBe(true);
    expect(display.planBadge).toBe('lifetime');
    expect(display.planExpiresAt).toBeNull();
  });

  test('uses timed subscription override expiry for expiring badge', () => {
    const expiresAt = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000);
    const user = makeUser({
      subscriptionOverrides: [{ tier: 'access', expiresAt }],
    });

    expect(resolvePlanBadge(user)).toBe('expiring');
    expect(resolvePlanExpiresAt(user)?.getTime()).toBe(expiresAt.getTime());
  });

  test('uses annual badge for active paid subscription', () => {
    const user = makeUser({
      billing: {
        activeSubscriptions: ['access'],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        currentPeriodEnd: new Date('2027-06-14T12:00:00.000Z'),
        updatedAt: new Date(),
      },
    });

    expect(resolvePlanBadge(user)).toBe('annual');
    expect(resolvePlanExpiresAt(user)?.toISOString()).toBe('2027-06-14T12:00:00.000Z');
  });
});
