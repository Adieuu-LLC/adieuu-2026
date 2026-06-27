/**
 * Full export surface for `stripe.client` test mocks.
 *
 * Bun's `mock.module()` replaces the entire module; partial mocks leak missing
 * named exports to unrelated test files in the same process.
 */

import { mock } from 'bun:test';

export type StripeClientMockOverrides = {
  redactStripeSecretKey?: (secretKey: string) => string;
  getStripe?: ReturnType<typeof mock>;
  verifyStripeCredentials?: ReturnType<typeof mock>;
  checkStripeServiceHealth?: ReturnType<typeof mock>;
};

export function createStripeClientMock(overrides: StripeClientMockOverrides = {}) {
  return {
    redactStripeSecretKey:
      overrides.redactStripeSecretKey ??
      ((secretKey: string) =>
        secretKey.length <= 12 ? '****' : `${secretKey.slice(0, 8)}****${secretKey.slice(-4)}`),
    getStripe:
      overrides.getStripe ??
      mock(() => {
        throw new Error('getStripe mock not configured for this test');
      }),
    verifyStripeCredentials:
      overrides.verifyStripeCredentials ??
      mock(() => Promise.resolve({ valid: true, mode: 'test' as const })),
    checkStripeServiceHealth:
      overrides.checkStripeServiceHealth ??
      mock(() => Promise.resolve({ status: 'up' as const, latencyMs: 1 })),
  };
}
