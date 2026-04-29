import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { IdentityDocument } from '../models/identity';
import { buildBillingFromMetadata } from './identity.service';
import {
  buildAndEncryptGrants,
  evaluateSubscriptionGrants,
  activeLabelsFromEvaluatedGrants,
} from './billing/subscription-grants';

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

describe('buildBillingFromMetadata', () => {
  test('metadata only, no identity -> billing from metadata', () => {
    const billing = buildBillingFromMetadata({
      subscriptions: ['insider'],
      entitlements: ['vanguard'],
      currentPeriodEnd: Math.floor(Date.now() / 1000) + 86400 * 30,
      isLifetime: false,
    });
    expect(billing).not.toBeUndefined();
    expect(billing!.activeSubscriptions).toEqual(['insider']);
    expect(billing!.entitlements).toEqual(['vanguard']);
    expect(billing!.isLifetime).toBe(false);
  });

  test('no metadata, no identity -> undefined', () => {
    const billing = buildBillingFromMetadata();
    expect(billing).toBeUndefined();
  });

  test('empty metadata, no identity -> undefined', () => {
    const billing = buildBillingFromMetadata({
      subscriptions: [],
      entitlements: [],
    });
    expect(billing).toBeUndefined();
  });

  test('identity overrides merge with metadata subscriptions', () => {
    const identity = makeIdentity({
      subscriptionOverrides: [{ tier: 'insider' }],
    });
    const billing = buildBillingFromMetadata(
      { subscriptions: ['access'], entitlements: [] },
      identity,
    );
    expect(billing).not.toBeUndefined();
    expect(billing!.activeSubscriptions).toContain('access');
    expect(billing!.activeSubscriptions).toContain('insider');
  });

  test('identity entitlement overrides merge with metadata', () => {
    const identity = makeIdentity({
      entitlementOverrides: ['founder'],
    });
    const billing = buildBillingFromMetadata(
      { subscriptions: ['insider'], entitlements: ['vanguard'] },
      identity,
    );
    expect(billing!.entitlements).toContain('vanguard');
    expect(billing!.entitlements).toContain('founder');
  });

  test('identity lifetime override (no expiresAt) sets isLifetime', () => {
    const identity = makeIdentity({
      subscriptionOverrides: [{ tier: 'insider' }],
    });
    const billing = buildBillingFromMetadata(
      { subscriptions: [], entitlements: [], isLifetime: false },
      identity,
    );
    expect(billing!.isLifetime).toBe(true);
  });

  test('identity entitlement override sets isLifetime', () => {
    const identity = makeIdentity({
      entitlementOverrides: ['founder'],
    });
    const billing = buildBillingFromMetadata(
      { subscriptions: ['insider'], entitlements: [], isLifetime: false },
      identity,
    );
    expect(billing!.isLifetime).toBe(true);
  });

  test('timed identity override does not set isLifetime', () => {
    const future = new Date(Date.now() + 86400000 * 30);
    const identity = makeIdentity({
      subscriptionOverrides: [{ tier: 'insider', expiresAt: future }],
    });
    const billing = buildBillingFromMetadata(
      { subscriptions: [], entitlements: [], isLifetime: false },
      identity,
    );
    expect(billing!.isLifetime).toBe(false);
  });

  test('metadata isLifetime true preserved even without identity overrides', () => {
    const billing = buildBillingFromMetadata({
      subscriptions: ['insider'],
      entitlements: ['vanguard'],
      isLifetime: true,
    });
    expect(billing!.isLifetime).toBe(true);
  });

  test('no metadata subs, identity override only -> billing created', () => {
    const identity = makeIdentity({
      subscriptionOverrides: [{ tier: 'insider' }],
    });
    const billing = buildBillingFromMetadata({}, identity);
    expect(billing).not.toBeUndefined();
    expect(billing!.activeSubscriptions).toEqual(['insider']);
  });

  test('duplicates between metadata and identity overrides are deduplicated', () => {
    const identity = makeIdentity({
      subscriptionOverrides: [{ tier: 'insider' }],
      entitlementOverrides: ['vanguard'],
    });
    const billing = buildBillingFromMetadata(
      { subscriptions: ['insider'], entitlements: ['vanguard'] },
      identity,
    );
    const insiderCount = billing!.activeSubscriptions.filter((s) => s === 'insider').length;
    const vanguardCount = billing!.entitlements.filter((e) => e === 'vanguard').length;
    expect(insiderCount).toBe(1);
    expect(vanguardCount).toBe(1);
  });
});

describe('buildBillingFromMetadata -> grant round-trip', () => {
  test('metadata + identity overrides -> encrypt -> decrypt -> correct labels', () => {
    const identity = makeIdentity({
      subscriptionOverrides: [{ tier: 'insider' }],
      entitlementOverrides: ['founder'],
    });
    const billing = buildBillingFromMetadata(
      {
        subscriptions: ['access'],
        entitlements: ['vanguard'],
        currentPeriodEnd: Math.floor(Date.now() / 1000) + 86400 * 30,
        isLifetime: false,
      },
      identity,
    );
    expect(billing).not.toBeUndefined();
    expect(billing!.isLifetime).toBe(true);

    const grants = buildAndEncryptGrants(billing);
    expect(grants).not.toBeNull();

    const evaluated = evaluateSubscriptionGrants(grants!.ciphertext, grants!.key);
    expect(evaluated.isLifetime).toBe(true);

    const labels = activeLabelsFromEvaluatedGrants(evaluated);

    expect(labels.subscriptions).toContain('access');
    expect(labels.subscriptions).toContain('insider');
    expect(labels.entitlements).toContain('vanguard');
    expect(labels.entitlements).toContain('founder');
  });

  test('non-lifetime metadata with entitlements -> entitlements encrypted via periodEnd', () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 86400 * 30;
    const billing = buildBillingFromMetadata({
      subscriptions: ['access'],
      entitlements: ['vanguard'],
      currentPeriodEnd: periodEnd,
      isLifetime: false,
    });

    const grants = buildAndEncryptGrants(billing);
    expect(grants).not.toBeNull();

    const evaluated = evaluateSubscriptionGrants(grants!.ciphertext, grants!.key);
    expect(evaluated.subscriptions.access).toBe('current');
    expect(evaluated.entitlements.vanguard).toBe('current');
    expect(evaluated.isLifetime).toBe(false);
  });
});
