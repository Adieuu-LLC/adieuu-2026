/**
 * Edge test for stripe.client — must run in its own process because
 * mock.module('../../config') would collide with billing.service.test.ts.
 */
import { describe, expect, test, mock, afterAll } from 'bun:test';

mock.module('../../config', () => ({
  config: {
    stripe: {
      enabled: false,
      secretKey: '',
    },
  },
}));

import { getStripe } from './stripe.client';

afterAll(() => {
  mock.restore();
});

describe('getStripe (fail-closed)', () => {
  test('throws when Stripe is not enabled', () => {
    expect(() => getStripe()).toThrow('Stripe is not enabled');
  });
});
