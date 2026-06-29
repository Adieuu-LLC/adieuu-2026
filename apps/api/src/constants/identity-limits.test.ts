import { describe, expect, test } from 'bun:test';
import { IDENTITY_LIMITS } from './identity-limits';

describe('IDENTITY_LIMITS', () => {
  test('access tier allows 1 identity', () => {
    expect(IDENTITY_LIMITS.access).toBe(1);
  });

  test('insider tier allows 2 identities', () => {
    expect(IDENTITY_LIMITS.insider).toBe(2);
  });

  test('lifetime tier allows 3 identities', () => {
    expect(IDENTITY_LIMITS.lifetime).toBe(3);
  });

  test('tiers are ordered access < insider < lifetime', () => {
    expect(IDENTITY_LIMITS.access).toBeLessThan(IDENTITY_LIMITS.insider);
    expect(IDENTITY_LIMITS.insider).toBeLessThan(IDENTITY_LIMITS.lifetime);
  });

  test('all limits are positive integers', () => {
    for (const [, value] of Object.entries(IDENTITY_LIMITS)) {
      expect(value).toBeGreaterThan(0);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});
