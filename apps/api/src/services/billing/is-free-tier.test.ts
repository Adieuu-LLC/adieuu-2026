import { describe, expect, test } from 'bun:test';
import type { ObjectId } from 'mongodb';
import type { UserDocument } from '../../models/user';

import { isFreeTierOnly } from './is-free-tier';

function makeUser(overrides?: Partial<UserDocument>): UserDocument {
  return {
    _id: '000000000000000000000001' as unknown as ObjectId,
    email: 'test@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    maxIdentities: 2,
    ...overrides,
  } as UserDocument;
}

describe('isFreeTierOnly', () => {
  test('returns true for user with only free subscription', () => {
    const user = makeUser({
      billing: {
        activeSubscriptions: ['free'],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        updatedAt: new Date(),
      },
    });
    expect(isFreeTierOnly(user)).toBe(true);
  });

  test('returns false for user with no billing at all', () => {
    const user = makeUser();
    expect(isFreeTierOnly(user)).toBe(false);
  });

  test('returns false for user with empty subscriptions', () => {
    const user = makeUser({
      billing: {
        activeSubscriptions: [],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        updatedAt: new Date(),
      },
    });
    expect(isFreeTierOnly(user)).toBe(false);
  });

  test('returns false for user with paid subscription (access)', () => {
    const user = makeUser({
      billing: {
        activeSubscriptions: ['access'],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        updatedAt: new Date(),
      },
    });
    expect(isFreeTierOnly(user)).toBe(false);
  });

  test('returns false for user with paid subscription (insider)', () => {
    const user = makeUser({
      billing: {
        activeSubscriptions: ['insider'],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        updatedAt: new Date(),
      },
    });
    expect(isFreeTierOnly(user)).toBe(false);
  });

  test('returns false for user with mixed free + paid subscriptions', () => {
    const user = makeUser({
      billing: {
        activeSubscriptions: ['free', 'access'],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        updatedAt: new Date(),
      },
    });
    expect(isFreeTierOnly(user)).toBe(false);
  });

  test('returns false for lifetime user', () => {
    const user = makeUser({
      billing: {
        activeSubscriptions: ['free'],
        entitlements: [],
        isLifetime: true,
        status: 'active',
        updatedAt: new Date(),
      },
    });
    expect(isFreeTierOnly(user)).toBe(false);
  });

  test('returns false when subscription override grants paid tier', () => {
    const user = makeUser({
      billing: {
        activeSubscriptions: ['free'],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        updatedAt: new Date(),
      },
      subscriptionOverrides: [{ tier: 'access' as const }],
    });
    expect(isFreeTierOnly(user)).toBe(false);
  });

  test('returns true when subscription override for paid tier has expired', () => {
    const expired = new Date(Date.now() - 86400000);
    const user = makeUser({
      billing: {
        activeSubscriptions: ['free'],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        updatedAt: new Date(),
      },
      subscriptionOverrides: [{ tier: 'access' as const, expiresAt: expired }],
    });
    expect(isFreeTierOnly(user)).toBe(true);
  });

  test('returns false when entitlement override is present', () => {
    const user = makeUser({
      billing: {
        activeSubscriptions: ['free'],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        updatedAt: new Date(),
      },
      entitlementOverrides: ['vanguard'],
    });
    expect(isFreeTierOnly(user)).toBe(false);
  });

  test('returns true with free subscription override only', () => {
    const user = makeUser({
      billing: {
        activeSubscriptions: ['free'],
        entitlements: [],
        isLifetime: false,
        status: 'active',
        updatedAt: new Date(),
      },
      subscriptionOverrides: [{ tier: 'free' as const }],
    });
    expect(isFreeTierOnly(user)).toBe(true);
  });
});
