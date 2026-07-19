import { describe, expect, test } from 'bun:test';
import { isJoinAllowed, type CipherDetectStatus } from './joinSpaceGate';

describe('isJoinAllowed', () => {
  test('allows join when there is no cipherCheck', () => {
    expect(
      isJoinAllowed({ hasCipherCheck: false, cipherRequired: false, detectStatus: 'idle' }),
    ).toBe(true);
  });

  test('allows join when a Cipher matched', () => {
    expect(
      isJoinAllowed({ hasCipherCheck: true, cipherRequired: true, detectStatus: 'matched' }),
    ).toBe(true);
  });

  test('blocks join when cipherRequired and no match', () => {
    for (const detectStatus of ['missing', 'unavailable', 'checking', 'idle'] as CipherDetectStatus[]) {
      expect(
        isJoinAllowed({ hasCipherCheck: true, cipherRequired: true, detectStatus }),
      ).toBe(false);
    }
  });

  test('allows join when cipherOptional and no match', () => {
    expect(
      isJoinAllowed({ hasCipherCheck: true, cipherRequired: false, detectStatus: 'missing' }),
    ).toBe(true);
    expect(
      isJoinAllowed({
        hasCipherCheck: true,
        cipherRequired: false,
        detectStatus: 'unavailable',
      }),
    ).toBe(true);
  });

  test('blocks join while still checking even if cipher is optional', () => {
    expect(
      isJoinAllowed({ hasCipherCheck: true, cipherRequired: false, detectStatus: 'checking' }),
    ).toBe(false);
  });
});
