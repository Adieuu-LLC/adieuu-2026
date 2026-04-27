import { describe, expect, test } from 'bun:test';
import { evaluateBillingAccess, PAST_DUE_GRACE_MS } from './require-subscription';
import type { UserBilling } from '../models/user';

function makeBilling(overrides: Partial<UserBilling> = {}): UserBilling {
  return {
    activeSubscriptions: ['access'],
    entitlements: [],
    isLifetime: false,
    status: 'active',
    cancelAtPeriodEnd: false,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('evaluateBillingAccess', () => {
  // 7c. Subscription guard middleware
  test('active with subscriptions -> null (allowed)', () => {
    expect(evaluateBillingAccess(makeBilling())).toBeNull();
  });

  test('active with access + insider -> null', () => {
    expect(evaluateBillingAccess(makeBilling({ activeSubscriptions: ['access', 'insider'] }))).toBeNull();
  });

  test('empty activeSubscriptions -> SUBSCRIPTION_REQUIRED', () => {
    expect(evaluateBillingAccess(makeBilling({ activeSubscriptions: [] }))).toBe('SUBSCRIPTION_REQUIRED');
  });

  test('undefined billing -> SUBSCRIPTION_REQUIRED', () => {
    expect(evaluateBillingAccess(undefined)).toBe('SUBSCRIPTION_REQUIRED');
  });

  test('status canceled -> SUBSCRIPTION_EXPIRED', () => {
    expect(evaluateBillingAccess(makeBilling({ status: 'canceled' }))).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('status unpaid -> SUBSCRIPTION_EXPIRED', () => {
    expect(evaluateBillingAccess(makeBilling({ status: 'unpaid' }))).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('status incomplete_expired -> SUBSCRIPTION_EXPIRED', () => {
    expect(evaluateBillingAccess(makeBilling({ status: 'incomplete_expired' }))).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('status past_due within 48h grace -> null (allowed)', () => {
    expect(
      evaluateBillingAccess(
        makeBilling({ status: 'past_due', updatedAt: new Date(Date.now() - PAST_DUE_GRACE_MS + 10000) }),
      ),
    ).toBeNull();
  });

  test('status past_due beyond 48h grace -> SUBSCRIPTION_EXPIRED', () => {
    expect(
      evaluateBillingAccess(
        makeBilling({ status: 'past_due', updatedAt: new Date(Date.now() - PAST_DUE_GRACE_MS - 10000) }),
      ),
    ).toBe('SUBSCRIPTION_EXPIRED');
  });

  test('status trialing -> null (allowed)', () => {
    expect(evaluateBillingAccess(makeBilling({ status: 'trialing' }))).toBeNull();
  });

  test('isLifetime + active -> null (allowed)', () => {
    expect(evaluateBillingAccess(makeBilling({ isLifetime: true }))).toBeNull();
  });
});
