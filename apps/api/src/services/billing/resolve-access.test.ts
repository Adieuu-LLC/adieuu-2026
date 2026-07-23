import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument, UserBilling, SubscriptionOverride } from '../../models/user';
import type { IdentityDocument } from '../../models/identity';
import type { IdentityContext } from '../../middleware/identity-session';
import {
  resolveEffectiveAccess,
  resolveIdentityOverrides,
  hasLifetimeIdentityOverrides,
  requiresTier,
  requiresEntitlement,
  hasPaidAccess,
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
// hasLifetimeIdentityOverrides
// ---------------------------------------------------------------------------

describe('hasLifetimeIdentityOverrides', () => {
  test('no overrides -> false', () => {
    expect(hasLifetimeIdentityOverrides(makeIdentity())).toBe(false);
  });

  test('subscription override without expiresAt -> true (lifetime)', () => {
    expect(hasLifetimeIdentityOverrides(makeIdentity({
      subscriptionOverrides: [{ tier: 'insider' }],
    }))).toBe(true);
  });

  test('subscription override with expiresAt -> false (timed, not lifetime)', () => {
    const future = new Date(Date.now() + 86400000 * 30);
    expect(hasLifetimeIdentityOverrides(makeIdentity({
      subscriptionOverrides: [{ tier: 'insider', expiresAt: future }],
    }))).toBe(false);
  });

  test('entitlement overrides present -> true (always lifetime)', () => {
    expect(hasLifetimeIdentityOverrides(makeIdentity({
      entitlementOverrides: ['founder'],
    }))).toBe(true);
  });

  test('expired subscription override without expiresAt -> true (no-expiry means lifetime)', () => {
    expect(hasLifetimeIdentityOverrides(makeIdentity({
      subscriptionOverrides: [{ tier: 'access' }],
    }))).toBe(true);
  });

  test('mix: timed sub override + entitlement override -> true (entitlement wins)', () => {
    const future = new Date(Date.now() + 86400000);
    expect(hasLifetimeIdentityOverrides(makeIdentity({
      subscriptionOverrides: [{ tier: 'insider', expiresAt: future }],
      entitlementOverrides: ['vanguard'],
    }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// requiresTier (hierarchy-aware)
// ---------------------------------------------------------------------------

describe('requiresTier', () => {
  function makeCtx(overrides: Partial<IdentityContext> = {}): IdentityContext {
    return {
      identity: makeIdentity(),
      sessionId: 'sess-1',
      maxVideoDurationSeconds: 300,
      subscriptions: [],
      entitlements: [],
      isLifetime: false,
      ...overrides,
    };
  }

  describe('inherited mode (default)', () => {
    test('access user passes access check', () => {
      expect(requiresTier(makeCtx({ subscriptions: ['access'] }), 'access')).toBe(true);
    });

    test('insider user passes access check (inherited)', () => {
      expect(requiresTier(makeCtx({ subscriptions: ['insider'] }), 'access')).toBe(true);
    });

    test('insider user passes insider check', () => {
      expect(requiresTier(makeCtx({ subscriptions: ['insider'] }), 'insider')).toBe(true);
    });

    test('access-only user fails insider check (no upward inheritance)', () => {
      expect(requiresTier(makeCtx({ subscriptions: ['access'] }), 'insider')).toBe(false);
    });

    test('empty subscriptions fails any tier check', () => {
      expect(requiresTier(makeCtx({ subscriptions: [] }), 'access')).toBe(false);
      expect(requiresTier(makeCtx({ subscriptions: [] }), 'insider')).toBe(false);
    });

    test('lifetime user with insider passes both access and insider', () => {
      const ctx = makeCtx({ subscriptions: ['insider'], isLifetime: true });
      expect(requiresTier(ctx, 'access')).toBe(true);
      expect(requiresTier(ctx, 'insider')).toBe(true);
    });

    test('user with both access and insider passes both checks', () => {
      const ctx = makeCtx({ subscriptions: ['access', 'insider'] });
      expect(requiresTier(ctx, 'access')).toBe(true);
      expect(requiresTier(ctx, 'insider')).toBe(true);
    });
  });

  describe('exact mode', () => {
    test('access user passes exact access check', () => {
      expect(requiresTier(makeCtx({ subscriptions: ['access'] }), 'access', { exact: true })).toBe(true);
    });

    test('insider user fails exact access check', () => {
      expect(requiresTier(makeCtx({ subscriptions: ['insider'] }), 'access', { exact: true })).toBe(false);
    });

    test('insider user passes exact insider check', () => {
      expect(requiresTier(makeCtx({ subscriptions: ['insider'] }), 'insider', { exact: true })).toBe(true);
    });

    test('user with both tiers passes exact check for each', () => {
      const ctx = makeCtx({ subscriptions: ['access', 'insider'] });
      expect(requiresTier(ctx, 'access', { exact: true })).toBe(true);
      expect(requiresTier(ctx, 'insider', { exact: true })).toBe(true);
    });

    test('empty subscriptions fails exact check', () => {
      expect(requiresTier(makeCtx({ subscriptions: [] }), 'access', { exact: true })).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('duplicate tiers in array behave identically to single entry', () => {
      const ctx = makeCtx({ subscriptions: ['insider', 'insider'] });
      expect(requiresTier(ctx, 'insider')).toBe(true);
      expect(requiresTier(ctx, 'access')).toBe(true);
    });

    test('isLifetime true but empty subscriptions still fails', () => {
      const ctx = makeCtx({ subscriptions: [], isLifetime: true });
      expect(requiresTier(ctx, 'access')).toBe(false);
      expect(requiresTier(ctx, 'insider')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// requiresEntitlement
// ---------------------------------------------------------------------------

describe('requiresEntitlement', () => {
  function makeCtx(overrides: Partial<IdentityContext> = {}): IdentityContext {
    return {
      identity: makeIdentity(),
      sessionId: 'sess-1',
      maxVideoDurationSeconds: 300,
      subscriptions: [],
      entitlements: [],
      isLifetime: false,
      ...overrides,
    };
  }

  test('vanguard user passes vanguard check', () => {
    expect(requiresEntitlement(makeCtx({ entitlements: ['vanguard'] }), 'vanguard')).toBe(true);
  });

  test('vanguard user fails founder check (parallel, not inherited)', () => {
    expect(requiresEntitlement(makeCtx({ entitlements: ['vanguard'] }), 'founder')).toBe(false);
  });

  test('founder user fails vanguard check', () => {
    expect(requiresEntitlement(makeCtx({ entitlements: ['founder'] }), 'vanguard')).toBe(false);
  });

  test('user with both vanguard and founder passes each independently', () => {
    const ctx = makeCtx({ entitlements: ['vanguard', 'founder'] });
    expect(requiresEntitlement(ctx, 'vanguard')).toBe(true);
    expect(requiresEntitlement(ctx, 'founder')).toBe(true);
  });

  test('empty entitlements fails any check', () => {
    expect(requiresEntitlement(makeCtx({ entitlements: [] }), 'vanguard')).toBe(false);
    expect(requiresEntitlement(makeCtx({ entitlements: [] }), 'founder')).toBe(false);
  });

  test('arbitrary entitlement string works correctly', () => {
    const ctx = makeCtx({ entitlements: ['beta_feature'] });
    expect(requiresEntitlement(ctx, 'beta_feature')).toBe(true);
    expect(requiresEntitlement(ctx, 'other_feature')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasPaidAccess
// ---------------------------------------------------------------------------

describe('hasPaidAccess', () => {
  test('access subscription -> true', () => {
    expect(hasPaidAccess({ subscriptions: ['access'] })).toBe(true);
  });

  test('insider subscription -> true', () => {
    expect(hasPaidAccess({ subscriptions: ['insider'] })).toBe(true);
  });

  test('free subscription only -> false', () => {
    expect(hasPaidAccess({ subscriptions: ['free'] })).toBe(false);
  });

  test('empty subscriptions -> false', () => {
    expect(hasPaidAccess({ subscriptions: [] })).toBe(false);
  });

  test('isLifetime true with free subscription only -> true', () => {
    expect(hasPaidAccess({ subscriptions: ['free'], isLifetime: true })).toBe(true);
  });

  test('isLifetime true with empty subscriptions -> true', () => {
    expect(hasPaidAccess({ subscriptions: [], isLifetime: true })).toBe(true);
  });

  test('gifted entitlement with free subscription -> true', () => {
    expect(hasPaidAccess({ subscriptions: ['free'], entitlements: ['gifted'] })).toBe(true);
  });

  test('non-gifted entitlement with free subscription -> false', () => {
    expect(hasPaidAccess({ subscriptions: ['free'], entitlements: ['beta_feature'] })).toBe(false);
  });

  test('no entitlements, no lifetime, no paid tier -> false', () => {
    expect(hasPaidAccess({ subscriptions: ['free'], entitlements: [], isLifetime: false })).toBe(false);
  });

  test('mixed free + access -> true (access wins)', () => {
    expect(hasPaidAccess({ subscriptions: ['free', 'access'] })).toBe(true);
  });
});
