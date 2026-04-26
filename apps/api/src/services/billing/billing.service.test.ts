import { describe, expect, test, mock, afterAll, beforeEach } from 'bun:test';

mock.module('../../config', () => ({
  config: {
    stripe: {
      enabled: true,
      secretKey: 'sk_test_xxx',
      webhookSecret: 'whsec_xxx',
      publishableKey: 'pk_test_xxx',
      prices: {
        vanguardMonthly: 'price_vanguard_123',
      },
      successUrl: 'http://localhost:3000/account/subscription?status=success',
      cancelUrl: 'http://localhost:3000/account/subscription?status=cancelled',
      portalReturnUrl: 'http://localhost:3000/account/subscription',
    },
  },
}));

const mockFindById = mock(() => Promise.resolve(null));
const mockUpdateStripeCustomerId = mock(() => Promise.resolve());
const mockUpdateBilling = mock(() => Promise.resolve());

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
    updateStripeCustomerId: mockUpdateStripeCustomerId,
    updateBilling: mockUpdateBilling,
  }),
}));

const mockFindOne = mock(() => Promise.resolve(null));
const mockInsertOne = mock(() => Promise.resolve({ insertedId: 'test' }));

mock.module('../../db', () => ({
  getCollection: () => ({
    findOne: mockFindOne,
    insertOne: mockInsertOne,
  }),
  Collections: {
    STRIPE_PROCESSED_EVENTS: 'stripe_processed_events',
  },
}));

mock.module('./stripe.client', () => ({
  getStripe: () => ({
    subscriptions: {
      retrieve: mock(() =>
        Promise.resolve({
          id: 'sub_123',
          status: 'active',
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          cancel_at_period_end: false,
          items: {
            data: [{ price: { id: 'price_vanguard_123' } }],
          },
        }),
      ),
    },
  }),
}));

import { tierIdsForPriceIds } from './billing.service';

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  mockFindOne.mockReset();
  mockInsertOne.mockReset();
  mockFindById.mockReset();
  mockUpdateBilling.mockReset();
  mockUpdateStripeCustomerId.mockReset();
});

describe('tierIdsForPriceIds', () => {
  test('maps known price IDs to tier IDs', () => {
    expect(tierIdsForPriceIds(['price_vanguard_123'])).toEqual(['vanguard']);
  });

  test('returns empty array for unknown price IDs', () => {
    expect(tierIdsForPriceIds(['price_unknown_999'])).toEqual([]);
  });

  test('handles mixed known and unknown price IDs', () => {
    expect(tierIdsForPriceIds(['price_unknown_999', 'price_vanguard_123'])).toEqual(['vanguard']);
  });

  test('returns empty array for empty input', () => {
    expect(tierIdsForPriceIds([])).toEqual([]);
  });
});
