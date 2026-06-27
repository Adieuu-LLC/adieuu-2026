/**
 * Referral repository tests (unit-level against mocked collection).
 */

import { describe, expect, test } from 'bun:test';
import { MAX_ACTIVE_CODES_PER_USER } from '../repositories/referral.repository';

describe('referral.repository constants', () => {
  test('allows up to three active codes per account', () => {
    expect(MAX_ACTIVE_CODES_PER_USER).toBe(3);
  });
});
