import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument, UserBilling, SubscriptionOverride } from '../../models/user';
import type { IdentityDocument } from '../../models/identity';
import type { IdentityContext } from '../../middleware/identity-session';
import {
  resolveEffectiveAccess,
  resolveIdentityOverrides,
  hasSubscription,
  hasEntitlement,
  identityHasSubscription,
  identityHasEntitlement,
} from './resolve-access';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<UserDocument> = {}): UserDocument {
  return {
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
    emailVerified: false,
    phoneVerified: false,
    failedAttempts: 0,
    identityCount: 0,
    identityLockoutDuration: 3600000,
    identityLoginAttempts: [],
    ...overrides,
  } as UserDocument;
}

function makeBilling(overrides: Partial<UserBilling> = {}): UserBilling {
  return {
    activeSubscriptions: [],
    entitlements: [],
    isLifetime: false,
    status: 'active',
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeIdentity(overrides: Partial<IdentityDocument> = {}): IdentityDocument {
  return {
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ident: 'test-ident',
    hashVersion: 1,
    username: 'test-user',
    displayName: 'Test User',
    lastActiveAt: new Date(),
    ...overrides,
  } as IdentityDocument;
}

// ---------------------------------------------------------------------------
// resolveEffectiveAccess
// ---------------------------------------------------------------------------

describe('resolveEffectiveAccess', () => {
  test('no billing, no overrides -> empty', () => {
    const user = makeUser();
    const result = resolveEffectiveAccess(user);
    expect(result.subscriptions).toEqual([]);
    expect(result.entitlements).toEqual([]);
    expect(result.isLifetime).toBe(false);
  });

  test('billing only, no overrides -> returns billing values', () => {
    const user = makeUser({
      billing: makeBilling({
        activeSubscriptions: ['access'],
        entitlements: ['vanguard'],
        isLifetime: false,
      }),
    });
    const result = resolveEffectiveAccess(user);
    expect(result.subscriptions).toEqual(['access']);
    expect(result.entitlements).toEqual(['vanguard']);
    expect(result.isLifetime).toBe(false);
  });

  test('overrides only, no billing -> returns override values', () => {
    const user = makeUser({
      subscriptionOverrides: [{ tier: 'insider' }],
      entitlementOverrides: ['founder'],
    });
    const result = resolveEffectiveAccess(user);
    expect(result.subscriptions).toEqual(['insider']);
    expect(result.entitlements).toEqual(['founder']);
    expect(result.isLifetime).toBe(true);
  });

  test('billing + overrides -> merged, deduplicated', () => {
    const user = makeUser({
      billing: makeBilling({
        activeSubscriptions: ['access', 'insider'],
        entitlements: ['vanguard'],
      }),
      subscriptionOverrides: [{ tier: 'insider' }],
      entitlementOverrides: ['founder', 'vanguard'],
    });
    const result = resolveEffectiveAccess(user);
    expect(result.subscriptions).toContain('access');
    expect(result.subscriptions).toContain('insider');
    expect(new Set(result.subscriptions).size).toBe(result.subscriptions.length);
    expect(result.entitlements).toContain('vanguard');
    expect(result.entitlements).toContain('founder');
    expect(new Set(result.entitlements).size).toBe(result.entitlements.length);
  });

  test('expired subscription override is excluded', () => {
    const past = new Date(Date.now() - 86400000);
    const user = makeUser({
      subscriptionOverrides: [{ tier: 'insider', expiresAt: past }],
    });
    const result = resolveEffectiveAccess(user);
    expect(result.subscriptions).toEqual([]);
    expect(result.isLifetime).toBe(false);
  });

  test('future-expiring subscription override is included', () => {
    const future = new Date(Date.now() + 86400000 * 90);
    const user = makeUser({
      subscriptionOverrides: [{ tier: 'insider', expiresAt: future }],
    });
    const result = resolveEffectiveAccess(user);
    expect(result.subscriptions).toEqual(['insider']);
    expect(result.isLifetime).toBe(false);
  });

  test('lifetime subscription override (no expiresAt) sets isLifetime', () => {
    const user = makeUser({
      subscriptionOverrides: [{ tier: 'insider' }],
    });
    const result = resolveEffectiveAccess(user);
    expect(result.subscriptions).toEqual(['insider']);
    expect(result.isLifetime).toBe(true);
  });

  test('entitlement overrides alone set isLifetime', () => {
    const user = makeUser({
      entitlementOverrides: ['founder'],
    });
    const result = resolveEffectiveAccess(user);
    expect(result.entitlements).toEqual(['founder']);
    expect(result.isLifetime).toBe(true);
  });

  test('billing isLifetime true preserved even without overrides', () => {
    const user = makeUser({
      billing: makeBilling({ isLifetime: true, activeSubscriptions: ['insider'] }),
    });
    const result = resolveEffectiveAccess(user);
    expect(result.isLifetime).toBe(true);
  });

  test('mix of expired and non-expired overrides', () => {
    const past = new Date(Date.now() - 86400000);
    const future = new Date(Date.now() + 86400000 * 30);
    const user = makeUser({
      subscriptionOverrides: [
        { tier: 'access', expiresAt: past },
        { tier: 'insider', expiresAt: future },
      ],
    });
    const result = resolveEffectiveAccess(user);
    expect(result.subscriptions).toEqual(['insider']);
    expect(result.isLifetime).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveIdentityOverrides
// ---------------------------------------------------------------------------

describe('resolveIdentityOverrides', () => {
  test('no overrides -> empty', () => {
    const identity = makeIdentity();
    const result = resolveIdentityOverrides(identity);
    expect(result.subscriptions).toEqual([]);
    expect(result.entitlements).toEqual([]);
  });

  test('returns active overrides', () => {
    const identity = makeIdentity({
      subscriptionOverrides: [{ tier: 'insider' }],
      entitlementOverrides: ['beta-dm'],
    });
    const result = resolveIdentityOverrides(identity);
    expect(result.subscriptions).toEqual(['insider']);
    expect(result.entitlements).toEqual(['beta-dm']);
  });

  test('expired subscription override excluded', () => {
    const past = new Date(Date.now() - 86400000);
    const identity = makeIdentity({
      subscriptionOverrides: [{ tier: 'access', expiresAt: past }],
      entitlementOverrides: ['beta-dm'],
    });
    const result = resolveIdentityOverrides(identity);
    expect(result.subscriptions).toEqual([]);
    expect(result.entitlements).toEqual(['beta-dm']);
  });
});

// ---------------------------------------------------------------------------
// Access-check helpers
// ---------------------------------------------------------------------------

describe('hasSubscription / hasEntitlement', () => {
  test('hasSubscription returns true for present tier', () => {
    const resolved = { subscriptions: ['insider' as const], entitlements: [], isLifetime: false };
    expect(hasSubscription(resolved, 'insider')).toBe(true);
  });

  test('hasSubscription returns false for absent tier', () => {
    const resolved = { subscriptions: ['access' as const], entitlements: [], isLifetime: false };
    expect(hasSubscription(resolved, 'insider')).toBe(false);
  });

  test('hasEntitlement returns true for present entitlement', () => {
    const resolved = { subscriptions: [], entitlements: ['founder'], isLifetime: false };
    expect(hasEntitlement(resolved, 'founder')).toBe(true);
  });

  test('hasEntitlement returns false for absent entitlement', () => {
    const resolved = { subscriptions: [], entitlements: ['vanguard'], isLifetime: false };
    expect(hasEntitlement(resolved, 'founder')).toBe(false);
  });
});

describe('identityHasSubscription / identityHasEntitlement', () => {
  const ctx: IdentityContext = {
    identity: makeIdentity(),
    sessionId: 'sess-1',
    maxVideoDurationSeconds: 300,
    subscriptions: ['insider'],
    entitlements: ['founder'],
  };

  test('identityHasSubscription returns true for present tier', () => {
    expect(identityHasSubscription(ctx, 'insider')).toBe(true);
  });

  test('identityHasSubscription returns false for absent tier', () => {
    expect(identityHasSubscription(ctx, 'access')).toBe(false);
  });

  test('identityHasEntitlement returns true for present entitlement', () => {
    expect(identityHasEntitlement(ctx, 'founder')).toBe(true);
  });

  test('identityHasEntitlement returns false for absent entitlement', () => {
    expect(identityHasEntitlement(ctx, 'vanguard')).toBe(false);
  });
});
