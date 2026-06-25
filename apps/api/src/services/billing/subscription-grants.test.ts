/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test } from 'bun:test';
import type { UserBilling } from '../../models/user';
import type { SubscriptionTierId } from '@adieuu/shared';
import {
  buildGrantPayload,
  encryptGrants,
  evaluateSubscriptionGrants,
  buildAndEncryptGrants,
  hasActiveSubscriptionGrant,
  type GrantStatus,
  type EvaluatedGrants,
  activeLabelsFromEvaluatedGrants,
} from './subscription-grants';

const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;

function makeBilling(overrides: Partial<UserBilling> = {}): UserBilling {
  return {
    activeSubscriptions: ['access', 'insider'],
    entitlements: ['vanguard'],
    isLifetime: false,
    status: 'active',
    currentPeriodEnd: new Date(Date.now() + 30 * DAY * 1000),
    cancelAtPeriodEnd: false,
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 7a. Round-trip correctness
// ---------------------------------------------------------------------------
describe('subscription-grants round-trip', () => {
  test('encrypt then evaluate: all future timestamps return current', () => {
    const billing = makeBilling();
    const grants = buildAndEncryptGrants(billing)!;
    expect(grants).not.toBeNull();

    const result = evaluateSubscriptionGrants(grants.ciphertext, grants.key);
    expect(result.subscriptions.access).toBe('current');
    expect(result.subscriptions.insider).toBe('current');
    expect(result.entitlements.vanguard).toBe('current');
  });

  test('encrypt then evaluate: lifetime billing includes entitlements as current', () => {
    const billing = makeBilling({ isLifetime: true });
    const grants = buildAndEncryptGrants(billing)!;
    expect(grants).not.toBeNull();

    const result = evaluateSubscriptionGrants(grants.ciphertext, grants.key);
    expect(result.subscriptions.access).toBe('current');
    expect(result.subscriptions.insider).toBe('current');
    expect(result.entitlements.vanguard).toBe('current');
    expect(result.isLifetime).toBe(true);
  });

  test('encrypt then evaluate: non-lifetime billing sets isLifetime false', () => {
    const billing = makeBilling({ isLifetime: false });
    const grants = buildAndEncryptGrants(billing)!;
    expect(grants).not.toBeNull();

    const result = evaluateSubscriptionGrants(grants.ciphertext, grants.key);
    expect(result.isLifetime).toBe(false);
  });

  test('encrypt then evaluate: mix of current, expiring_soon, expired', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, number> = {
      access: now + 30 * DAY,
      insider: now + 12 * HOUR,
      vanguard: now - 10,
    };
    const { ciphertext, key } = encryptGrants(payload);
    const result = evaluateSubscriptionGrants(ciphertext, key);
    expect(result.subscriptions.access).toBe('current');
    expect(result.subscriptions.insider).toBe('expiring_soon');
    expect(result.entitlements.vanguard).toBe('expired');
  });

  test('boundary: 24h+1s = current, 24h-1s = expiring_soon, -1s = expired', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, number> = {
      access: now + DAY + 1,
      insider: now + DAY - 1,
      vanguard: now - 1,
    };
    const { ciphertext, key } = encryptGrants(payload);
    const result = evaluateSubscriptionGrants(ciphertext, key);
    expect(result.subscriptions.access).toBe('current');
    expect(result.subscriptions.insider).toBe('expiring_soon');
    expect(result.entitlements.vanguard).toBe('expired');
  });

  // Ceil avoids floor+1 collapsing to <1s of wall time before expiry; evaluate uses Date.now() ms.
  test('expiry next full second after now = expiring_soon', () => {
    const access = Math.ceil(Date.now() / 1000) + 1;
    const payload: Record<string, number> = { access };
    const { ciphertext, key } = encryptGrants(payload);
    const result = evaluateSubscriptionGrants(ciphertext, key);
    expect(result.subscriptions.access).toBe('expiring_soon');
  });

  test('empty grant map encrypts and evaluates to empty maps', () => {
    const { ciphertext, key } = encryptGrants({});
    const result = evaluateSubscriptionGrants(ciphertext, key);
    expect(Object.keys(result.subscriptions)).toHaveLength(0);
    expect(Object.keys(result.entitlements)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7a. Tamper resistance and failure modes
// ---------------------------------------------------------------------------
describe('subscription-grants tamper resistance', () => {
  test('wrong decryption key returns empty maps', () => {
    const billing = makeBilling();
    const grants = buildAndEncryptGrants(billing)!;
    const result = evaluateSubscriptionGrants(grants.ciphertext, 'dGhpc2lzYXdyb25na2V5AAAAAAAAAAAAAAAAAAAAAAAA');
    expect(Object.keys(result.subscriptions)).toHaveLength(0);
    expect(Object.keys(result.entitlements)).toHaveLength(0);
  });

  test('tampered ciphertext returns empty maps', () => {
    const billing = makeBilling();
    const grants = buildAndEncryptGrants(billing)!;
    const buf = Buffer.from(grants.ciphertext, 'base64');
    const idx = buf.length - 5;
    buf[idx] = (buf[idx] ?? 0) ^ 0xff;
    const tampered = buf.toString('base64');
    const result = evaluateSubscriptionGrants(tampered, grants.key);
    expect(Object.keys(result.subscriptions)).toHaveLength(0);
  });

  test('truncated ciphertext returns empty maps', () => {
    const billing = makeBilling();
    const grants = buildAndEncryptGrants(billing)!;
    const truncated = grants.ciphertext.substring(0, 10);
    const result = evaluateSubscriptionGrants(truncated, grants.key);
    expect(Object.keys(result.subscriptions)).toHaveLength(0);
  });

  test('empty string ciphertext returns empty maps', () => {
    const result = evaluateSubscriptionGrants('', 'somekey');
    expect(Object.keys(result.subscriptions)).toHaveLength(0);
  });

  test('empty string key returns empty maps', () => {
    const billing = makeBilling();
    const grants = buildAndEncryptGrants(billing)!;
    const result = evaluateSubscriptionGrants(grants.ciphertext, '');
    expect(Object.keys(result.subscriptions)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7a. Privacy / no raw date leakage
// ---------------------------------------------------------------------------
describe('subscription-grants privacy', () => {
  test('return type contains only GrantStatus values, no numbers or Dates', () => {
    const billing = makeBilling();
    const grants = buildAndEncryptGrants(billing)!;
    const result = evaluateSubscriptionGrants(grants.ciphertext, grants.key);

    for (const v of Object.values(result.subscriptions)) {
      expect(typeof v).toBe('string');
      expect(['current', 'expired', 'expiring_soon']).toContain(v);
    }
    for (const v of Object.values(result.entitlements)) {
      expect(typeof v).toBe('string');
      expect(['current', 'expired', 'expiring_soon']).toContain(v);
    }
  });

  test('lifetime grants evaluate to current, not a distinct status', () => {
    const billing = makeBilling({ isLifetime: true });
    const grants = buildAndEncryptGrants(billing)!;
    const result = evaluateSubscriptionGrants(grants.ciphertext, grants.key);
    expect(result.subscriptions.access).toBe('current');
    expect(result.subscriptions.insider).toBe('current');
    expect(result.isLifetime).toBe(true);
  });

  test('different keys produce different ciphertext (nonce uniqueness)', () => {
    const payload = { access: Math.floor(Date.now() / 1000) + DAY * 30 };
    const a = encryptGrants(payload);
    const b = encryptGrants(payload);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  test('same key, different payloads produce different ciphertext', () => {
    const a = encryptGrants({ access: 100 });
    const b = encryptGrants({ access: 200 });
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  test('ciphertext length is bucketed: typical payloads share the same size', () => {
    const now = Math.floor(Date.now() / 1000) + DAY * 30;
    const minimal = encryptGrants({ access: now });
    const typical = encryptGrants({
      access: now, insider: now, vanguard: now, founder: now,
      'stream-2k': now, 'stream-4k': now, _lifetime: 1,
    });
    const empty = encryptGrants({});
    // All realistic payloads (< ~254 bytes JSON) fall in the same 256-byte bucket
    expect(minimal.ciphertext.length).toBe(typical.ciphertext.length);
    expect(minimal.ciphertext.length).toBe(empty.ciphertext.length);
  });

  test('large payloads grow to the next power-of-2 bucket, not byte-by-byte', () => {
    const now = Math.floor(Date.now() / 1000) + DAY * 30;
    const entries: Record<string, number> = {};
    for (let i = 0; i < 20; i++) entries[`grant_${i.toString().padStart(3, '0')}`] = now;
    const large = encryptGrants(entries);

    const entries2: Record<string, number> = {};
    for (let i = 0; i < 15; i++) entries2[`grant_${i.toString().padStart(3, '0')}`] = now;
    const alsoLarge = encryptGrants(entries2);

    // Both should land in the same 512-byte bucket
    expect(large.ciphertext.length).toBe(alsoLarge.ciphertext.length);
    // And that bucket is larger than the minimal bucket
    const minimal = encryptGrants({ access: now });
    expect(large.ciphertext.length).toBeGreaterThan(minimal.ciphertext.length);
  });
});

// ---------------------------------------------------------------------------
// 7a. Partitioning
// ---------------------------------------------------------------------------
describe('subscription-grants partitioning', () => {
  test('known tier ids appear in subscriptions, not entitlements', () => {
    const now = Math.floor(Date.now() / 1000) + DAY * 30;
    const { ciphertext, key } = encryptGrants({ access: now, insider: now });
    const result = evaluateSubscriptionGrants(ciphertext, key);
    expect(result.subscriptions.access).toBeDefined();
    expect(result.subscriptions.insider).toBeDefined();
    expect(result.entitlements['access' as string]).toBeUndefined();
    expect(result.entitlements['insider' as string]).toBeUndefined();
  });

  test('unknown keys appear in entitlements, not subscriptions', () => {
    const now = Math.floor(Date.now() / 1000) + DAY * 30;
    const { ciphertext, key } = encryptGrants({ vanguard: now, founder: now, promo_x: now });
    const result = evaluateSubscriptionGrants(ciphertext, key);
    expect(result.entitlements.vanguard).toBeDefined();
    expect(result.entitlements.founder).toBeDefined();
    expect(result.entitlements.promo_x).toBeDefined();
    expect((result.subscriptions as any).vanguard).toBeUndefined();
  });

  test('mixed tiers and entitlements partition correctly', () => {
    const now = Math.floor(Date.now() / 1000) + DAY * 30;
    const { ciphertext, key } = encryptGrants({ access: now, vanguard: now });
    const result = evaluateSubscriptionGrants(ciphertext, key);
    expect(result.subscriptions.access).toBe('current');
    expect(result.entitlements.vanguard).toBe('current');
  });
});

// ---------------------------------------------------------------------------
// 7a. Lifetime far-future timestamp
// ---------------------------------------------------------------------------
describe('subscription-grants lifetime jitter', () => {
  test('far-future timestamp evaluates to current', () => {
    const now = Math.floor(Date.now() / 1000);
    const farFuture = now + 25 * YEAR;
    const { ciphertext, key } = encryptGrants({ access: farFuture });
    const result = evaluateSubscriptionGrants(ciphertext, key);
    expect(result.subscriptions.access).toBe('current');
  });

  test('jitter is applied: two builds produce different timestamps', () => {
    const billing = makeBilling({ isLifetime: true });
    const p1 = buildGrantPayload(billing);
    const p2 = buildGrantPayload(billing);
    const keys = Object.keys(p1);
    let anyDifferent = false;
    for (const k of keys) {
      if (p1[k] !== p2[k]) anyDifferent = true;
    }
    expect(anyDifferent).toBe(true);
  });

  test('all jittered timestamps evaluate to current', () => {
    const billing = makeBilling({ isLifetime: true });
    for (let i = 0; i < 10; i++) {
      const grants = buildAndEncryptGrants(billing)!;
      const result = evaluateSubscriptionGrants(grants.ciphertext, grants.key);
      expect(result.subscriptions.access).toBe('current');
      expect(result.subscriptions.insider).toBe('current');
    }
  });
});

// ---------------------------------------------------------------------------
// 7a. activeLabelsFromEvaluatedGrants
// ---------------------------------------------------------------------------
describe('activeLabelsFromEvaluatedGrants', () => {
  test('maps current and expiring tiers/ents, drops expired', () => {
    const grants: EvaluatedGrants = {
      subscriptions: { access: 'current', insider: 'expiring_soon' },
      entitlements: { founder: 'current', vanguard: 'expired' },
      isLifetime: false,
    };
    const { subscriptions, entitlements } = activeLabelsFromEvaluatedGrants(grants);
    const want: SubscriptionTierId[] = ['access', 'insider'];
    expect([...subscriptions].sort()).toEqual([...want].sort());
    expect(entitlements).toContain('founder');
    expect(entitlements).not.toContain('vanguard');
  });

  test('empty grant maps yield empty arrays', () => {
    const grants: EvaluatedGrants = { subscriptions: {}, entitlements: {}, isLifetime: false };
    expect(activeLabelsFromEvaluatedGrants(grants)).toEqual({
      subscriptions: [],
      entitlements: [],
    });
  });
});

// ---------------------------------------------------------------------------
// 7a. hasActiveSubscriptionGrant
// ---------------------------------------------------------------------------
describe('hasActiveSubscriptionGrant', () => {
  test('returns true when access is current', () => {
    const grants: EvaluatedGrants = { subscriptions: { access: 'current' }, entitlements: {}, isLifetime: false };
    expect(hasActiveSubscriptionGrant(grants)).toBe(true);
  });

  test('returns true when insider is current (implies access)', () => {
    const grants: EvaluatedGrants = { subscriptions: { insider: 'current' }, entitlements: {}, isLifetime: false };
    expect(hasActiveSubscriptionGrant(grants)).toBe(true);
  });

  test('returns false when both are expired', () => {
    const grants: EvaluatedGrants = { subscriptions: { access: 'expired', insider: 'expired' }, entitlements: {}, isLifetime: false };
    expect(hasActiveSubscriptionGrant(grants)).toBe(false);
  });

  test('returns false when subscriptions is empty', () => {
    const grants: EvaluatedGrants = { subscriptions: {}, entitlements: { vanguard: 'current' }, isLifetime: false };
    expect(hasActiveSubscriptionGrant(grants)).toBe(false);
  });

  test('returns true when access is expiring_soon (renewal window)', () => {
    const grants: EvaluatedGrants = { subscriptions: { access: 'expiring_soon' }, entitlements: {}, isLifetime: false };
    expect(hasActiveSubscriptionGrant(grants)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Non-lifetime entitlement encryption
// ---------------------------------------------------------------------------
describe('subscription-grants non-lifetime entitlement encryption', () => {
  test('non-lifetime entitlements are encrypted with currentPeriodEnd', () => {
    const billing = makeBilling({
      isLifetime: false,
      activeSubscriptions: ['insider'],
      entitlements: ['vanguard'],
    });
    const grants = buildAndEncryptGrants(billing)!;
    expect(grants).not.toBeNull();

    const result = evaluateSubscriptionGrants(grants.ciphertext, grants.key);
    expect(result.subscriptions.insider).toBe('current');
    expect(result.entitlements.vanguard).toBe('current');
  });

  test('non-lifetime entitlements with expired currentPeriodEnd evaluate as expired', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, number> = {
      insider: now + 30 * DAY,
      vanguard: now - 10,
    };
    const { ciphertext, key } = encryptGrants(payload);
    const result = evaluateSubscriptionGrants(ciphertext, key);
    expect(result.subscriptions.insider).toBe('current');
    expect(result.entitlements.vanguard).toBe('expired');

    const labels = activeLabelsFromEvaluatedGrants(result);
    expect(labels.subscriptions).toContain('insider');
    expect(labels.entitlements).not.toContain('vanguard');
  });

  test('lifetime entitlements still use jittered far-future timestamps', () => {
    const billing = makeBilling({
      isLifetime: true,
      entitlements: ['founder'],
    });
    const grants = buildAndEncryptGrants(billing)!;
    const result = evaluateSubscriptionGrants(grants.ciphertext, grants.key);
    expect(result.entitlements.founder).toBe('current');
  });

  test('mixed: lifetime tiers + non-lifetime entitlements in same payload', () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, number> = {
      access: now + 25 * YEAR,
      insider: now + 25 * YEAR,
      vanguard: now + 30 * DAY,
    };
    const { ciphertext, key } = encryptGrants(payload);
    const result = evaluateSubscriptionGrants(ciphertext, key);
    expect(result.subscriptions.access).toBe('current');
    expect(result.subscriptions.insider).toBe('current');
    expect(result.entitlements.vanguard).toBe('current');
  });

  test('non-lifetime billing with no currentPeriodEnd omits entitlements from payload', () => {
    const billing = makeBilling({
      isLifetime: false,
      activeSubscriptions: ['access'],
      entitlements: ['vanguard'],
      currentPeriodEnd: undefined,
    });
    const payload = buildGrantPayload(billing);
    expect(payload['access']).toBeUndefined();
    expect(payload['vanguard']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7a. buildAndEncryptGrants
// ---------------------------------------------------------------------------
describe('buildAndEncryptGrants', () => {
  test('returns null for undefined billing', () => {
    expect(buildAndEncryptGrants(undefined)).toBeNull();
  });

  test('returns null for billing with empty subscriptions and entitlements', () => {
    const billing = makeBilling({ activeSubscriptions: [], entitlements: [] });
    expect(buildAndEncryptGrants(billing)).toBeNull();
  });

  test('returns ciphertext and key for valid billing', () => {
    const billing = makeBilling();
    const result = buildAndEncryptGrants(billing);
    expect(result).not.toBeNull();
    expect(result!.ciphertext).toBeTruthy();
    expect(result!.key).toBeTruthy();
  });
});
