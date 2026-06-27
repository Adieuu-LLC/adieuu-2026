import { describe, expect, test } from 'bun:test';
import { PURCHASABLE_PRODUCT_IDS, SUBSCRIPTION_TIER_IDS } from '@adieuu/shared';
import { PURCHASABLE_PRODUCTS } from './subscription-tiers';

describe('PURCHASABLE_PRODUCTS metadata', () => {
  test('has an entry for every PurchasableProductId', () => {
    for (const id of PURCHASABLE_PRODUCT_IDS) {
      expect(PURCHASABLE_PRODUCTS[id]).toBeDefined();
      expect(PURCHASABLE_PRODUCTS[id].id).toBe(id);
    }
  });

  test('every entry has a valid checkoutMode', () => {
    for (const meta of Object.values(PURCHASABLE_PRODUCTS)) {
      expect(['subscription', 'payment']).toContain(meta.checkoutMode);
    }
  });

  test('every entry grants at least one tier', () => {
    for (const meta of Object.values(PURCHASABLE_PRODUCTS)) {
      expect(meta.grantsTiers.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('all granted tiers are valid SubscriptionTierIds', () => {
    for (const meta of Object.values(PURCHASABLE_PRODUCTS)) {
      for (const tier of meta.grantsTiers) {
        expect(SUBSCRIPTION_TIER_IDS).toContain(tier);
      }
    }
  });

  test('recurring subscriptions are not lifetime', () => {
    for (const meta of Object.values(PURCHASABLE_PRODUCTS)) {
      if (meta.checkoutMode === 'subscription') {
        expect(meta.isLifetime).toBe(false);
      }
    }
  });

  test('one-time payments are lifetime', () => {
    for (const meta of Object.values(PURCHASABLE_PRODUCTS)) {
      if (meta.checkoutMode === 'payment') {
        expect(meta.isLifetime).toBe(true);
      }
    }
  });

  test('lifetime products grant insider tier', () => {
    for (const meta of Object.values(PURCHASABLE_PRODUCTS)) {
      if (meta.isLifetime) {
        expect(meta.grantsTiers).toContain('insider');
      }
    }
  });

  test('lifetime products have at least one entitlement', () => {
    for (const meta of Object.values(PURCHASABLE_PRODUCTS)) {
      if (meta.isLifetime) {
        expect(meta.grantsEntitlements.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('recurring products have no entitlements', () => {
    for (const meta of Object.values(PURCHASABLE_PRODUCTS)) {
      if (!meta.isLifetime) {
        expect(meta.grantsEntitlements).toEqual([]);
      }
    }
  });

  test('every entry has a non-empty priceConfigKey', () => {
    for (const meta of Object.values(PURCHASABLE_PRODUCTS)) {
      expect(meta.priceConfigKey).toBeTruthy();
    }
  });
});
