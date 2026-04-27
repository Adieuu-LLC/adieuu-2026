import { describe, expect, test } from 'bun:test';
import type { SubscriptionStatus } from '@adieuu/shared';
import { subscriptionPurchaseApplied } from './subscription-purchase-detect';

const base = (): SubscriptionStatus => ({
  activeSubscriptions: [],
  entitlements: [],
  isLifetime: false,
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  cancelAt: null,
  hasStripeCustomer: false,
});

describe('subscriptionPurchaseApplied', () => {
  test('false when identical', () => {
    const a = base();
    const b = base();
    expect(subscriptionPurchaseApplied(a, b)).toBe(false);
  });

  test('true when tier added', () => {
    const before = base();
    const after = { ...base(), activeSubscriptions: ['access' as const] };
    expect(subscriptionPurchaseApplied(before, after)).toBe(true);
  });

  test('true when entitlement added', () => {
    const before = base();
    const after = { ...base(), entitlements: ['vanguard'] };
    expect(subscriptionPurchaseApplied(before, after)).toBe(true);
  });

  test('true when lifetime flips', () => {
    const before = base();
    const after = { ...base(), isLifetime: true };
    expect(subscriptionPurchaseApplied(before, after)).toBe(true);
  });

  test('true when Stripe customer appears', () => {
    const before = base();
    const after = { ...base(), hasStripeCustomer: true };
    expect(subscriptionPurchaseApplied(before, after)).toBe(true);
  });

  test('order of arrays does not matter', () => {
    const before = { ...base(), activeSubscriptions: ['access' as const, 'insider' as const] };
    const after = { ...base(), activeSubscriptions: ['insider' as const, 'access' as const] };
    expect(subscriptionPurchaseApplied(before, after)).toBe(false);
  });

  // 7i. Purchase detection fingerprint updates
  test('currentPeriodEnd change (null -> date) detected', () => {
    const before = base();
    const after = { ...base(), currentPeriodEnd: '2026-12-31T00:00:00.000Z' };
    expect(subscriptionPurchaseApplied(before, after)).toBe(true);
  });

  test('cancelAt change detected', () => {
    const before = base();
    const after = { ...base(), cancelAt: '2026-12-31T00:00:00.000Z' };
    expect(subscriptionPurchaseApplied(before, after)).toBe(true);
  });

  test('unchanged currentPeriodEnd with changed tiers still detected', () => {
    const before = { ...base(), currentPeriodEnd: '2026-12-31T00:00:00.000Z' };
    const after = {
      ...base(),
      currentPeriodEnd: '2026-12-31T00:00:00.000Z',
      activeSubscriptions: ['access' as const],
    };
    expect(subscriptionPurchaseApplied(before, after)).toBe(true);
  });
});
