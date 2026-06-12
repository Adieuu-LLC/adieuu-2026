import { describe, expect, test } from 'bun:test';
import {
  resolveAccountRestriction,
  isSilentAccountBan,
  isOfacSanctionedBan,
} from './authRestrictionFlow';

describe('resolveAccountRestriction', () => {
  test('returns banned info for ACCOUNT_BANNED', () => {
    const result = resolveAccountRestriction('ACCOUNT_BANNED', {
      moderationReason: 'TOS violation',
      moderationCategory: 'tos_violation',
      bannedPeerCount: 12,
    });
    expect(result).toEqual({
      type: 'banned',
      reason: 'TOS violation',
      category: 'tos_violation',
      bannedPeerCount: 12,
    });
  });

  test('returns suspended info for ACCOUNT_SUSPENDED', () => {
    const result = resolveAccountRestriction('ACCOUNT_SUSPENDED', {
      moderationReason: 'Cooldown',
      suspendedUntil: '2026-06-01T00:00:00.000Z',
    });
    expect(result).toEqual({
      type: 'suspended',
      reason: 'Cooldown',
      suspendedUntil: '2026-06-01T00:00:00.000Z',
    });
  });

  test('returns undefined for unknown error codes', () => {
    expect(resolveAccountRestriction('VERIFICATION_FAILED')).toBeUndefined();
    expect(resolveAccountRestriction(undefined)).toBeUndefined();
  });

  test('handles missing details gracefully', () => {
    const result = resolveAccountRestriction('ACCOUNT_BANNED');
    expect(result).toEqual({ type: 'banned', reason: undefined });
  });

  test('returns undefined for silent OFAC self-attestation ban', () => {
    expect(resolveAccountRestriction('ACCOUNT_BANNED', {
      moderationCategory: 'ofac_self_attestation',
    })).toBeUndefined();
  });

  test('isSilentAccountBan identifies self-attestation category', () => {
    expect(isSilentAccountBan('ofac_self_attestation')).toBe(true);
    expect(isSilentAccountBan('ofac_sanctioned')).toBe(false);
  });

  test('isOfacSanctionedBan identifies geo OFAC category', () => {
    expect(isOfacSanctionedBan('ofac_sanctioned')).toBe(true);
    expect(isOfacSanctionedBan('spam')).toBe(false);
  });
});
