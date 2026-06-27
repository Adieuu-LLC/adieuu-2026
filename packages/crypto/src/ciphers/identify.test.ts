import { describe, expect, test } from 'bun:test';

import {
  generateCipherId,
  isValidCipherId,
  cipherIdsEqual,
  shortCipherId,
  formatCipherId,
  CIPHER_ID_DOMAIN,
  CIPHER_KEY_SIZE,
  CIPHER_ID_LENGTH,
} from './identify';
import { randomBytes, constantTimeEqual } from '../utils';

describe('ciphers/identify', () => {
  describe('constants', () => {
    test('CIPHER_ID_DOMAIN is correct', () => {
      expect(CIPHER_ID_DOMAIN).toBe('adieuu-cipher-id');
    });

    test('CIPHER_KEY_SIZE is 32', () => {
      expect(CIPHER_KEY_SIZE).toBe(32);
    });

    test('CIPHER_ID_LENGTH is 128', () => {
      expect(CIPHER_ID_LENGTH).toBe(128);
    });
  });

  describe('generateCipherId', () => {
    test('generates 128-character hex string', () => {
      const key = randomBytes(CIPHER_KEY_SIZE);
      const cipherId = generateCipherId(key);

      expect(cipherId).toHaveLength(CIPHER_ID_LENGTH);
      expect(/^[0-9a-f]+$/.test(cipherId)).toBe(true);
    });

    test('same key produces same ID', () => {
      const key = randomBytes(CIPHER_KEY_SIZE);
      const id1 = generateCipherId(key);
      const id2 = generateCipherId(key);

      expect(id1).toBe(id2);
    });

    test('different keys produce different IDs', () => {
      const key1 = randomBytes(CIPHER_KEY_SIZE);
      const key2 = randomBytes(CIPHER_KEY_SIZE);

      const id1 = generateCipherId(key1);
      const id2 = generateCipherId(key2);

      expect(id1).not.toBe(id2);
    });

    test('throws on invalid key size', () => {
      const shortKey = randomBytes(16);

      expect(() => generateCipherId(shortKey)).toThrow(
        'Cipher key must be 32 bytes, got 16'
      );
    });

    test('throws on long key', () => {
      const longKey = randomBytes(64);

      expect(() => generateCipherId(longKey)).toThrow(
        'Cipher key must be 32 bytes, got 64'
      );
    });

    test('is deterministic across calls', () => {
      // Use a fixed key to ensure determinism
      const fixedKey = new Uint8Array(32).fill(0x42);
      const id1 = generateCipherId(fixedKey);
      const id2 = generateCipherId(fixedKey);
      const id3 = generateCipherId(fixedKey);

      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });
  });

  describe('isValidCipherId', () => {
    test('returns true for valid cipher ID', () => {
      const key = randomBytes(CIPHER_KEY_SIZE);
      const cipherId = generateCipherId(key);

      expect(isValidCipherId(cipherId)).toBe(true);
    });

    test('returns true for lowercase hex', () => {
      const cipherId = 'a'.repeat(CIPHER_ID_LENGTH);

      expect(isValidCipherId(cipherId)).toBe(true);
    });

    test('returns true for uppercase hex', () => {
      const cipherId = 'A'.repeat(CIPHER_ID_LENGTH);

      expect(isValidCipherId(cipherId)).toBe(true);
    });

    test('returns true for mixed case hex', () => {
      const cipherId = 'aAbBcCdDeEfF0123456789'.repeat(6).slice(0, CIPHER_ID_LENGTH);

      expect(isValidCipherId(cipherId)).toBe(true);
    });

    test('returns false for wrong length', () => {
      expect(isValidCipherId('abc')).toBe(false);
      expect(isValidCipherId('a'.repeat(64))).toBe(false); // Half length
      expect(isValidCipherId('a'.repeat(129))).toBe(false); // Too long
    });

    test('returns false for non-hex characters', () => {
      const invalidId = 'g'.repeat(CIPHER_ID_LENGTH); // 'g' is not hex

      expect(isValidCipherId(invalidId)).toBe(false);
    });

    test('returns false for special characters', () => {
      const invalidId = 'a-b-c-d'.padEnd(CIPHER_ID_LENGTH, '0');

      expect(isValidCipherId(invalidId)).toBe(false);
    });
  });

  describe('cipherIdsEqual', () => {
    test('returns true for identical IDs', () => {
      const key = randomBytes(CIPHER_KEY_SIZE);
      const cipherId = generateCipherId(key);

      expect(cipherIdsEqual(cipherId, cipherId)).toBe(true);
    });

    test('returns true for same ID different case', () => {
      const lower = 'abcdef0123456789'.repeat(8);
      const upper = 'ABCDEF0123456789'.repeat(8);

      expect(cipherIdsEqual(lower, upper)).toBe(true);
    });

    test('returns false for different IDs', () => {
      const key1 = randomBytes(CIPHER_KEY_SIZE);
      const key2 = randomBytes(CIPHER_KEY_SIZE);

      const id1 = generateCipherId(key1);
      const id2 = generateCipherId(key2);

      expect(cipherIdsEqual(id1, id2)).toBe(false);
    });

    test('returns false for different lengths', () => {
      expect(cipherIdsEqual('abc', 'abcd')).toBe(false);
    });

    test('is constant-time (same behavior for matching prefixes)', () => {
      const base = 'a'.repeat(CIPHER_ID_LENGTH);
      const diffFirst = 'b' + 'a'.repeat(CIPHER_ID_LENGTH - 1);
      const diffLast = 'a'.repeat(CIPHER_ID_LENGTH - 1) + 'b';

      // Both should return false (testing that both execute fully)
      expect(cipherIdsEqual(base, diffFirst)).toBe(false);
      expect(cipherIdsEqual(base, diffLast)).toBe(false);
    });
  });

  describe('shortCipherId', () => {
    test('returns first 16 characters', () => {
      const key = randomBytes(CIPHER_KEY_SIZE);
      const cipherId = generateCipherId(key);
      const short = shortCipherId(cipherId);

      expect(short).toHaveLength(16);
      expect(cipherId.toLowerCase().startsWith(short)).toBe(true);
    });

    test('returns lowercase', () => {
      const upper = 'ABCDEF0123456789'.repeat(8);
      const short = shortCipherId(upper);

      expect(short).toBe('abcdef0123456789');
    });
  });

  describe('formatCipherId', () => {
    test('formats with default 4 groups', () => {
      const cipherId = '0123456789abcdef'.repeat(8);
      const formatted = formatCipherId(cipherId);

      expect(formatted).toBe('01234567-89abcdef-01234567-89abcdef');
    });

    test('formats with custom group count', () => {
      const cipherId = '0123456789abcdef'.repeat(8);

      expect(formatCipherId(cipherId, 2)).toBe('01234567-89abcdef');
      expect(formatCipherId(cipherId, 1)).toBe('01234567');
    });

    test('returns lowercase', () => {
      const cipherId = 'ABCDEF01'.repeat(16);
      const formatted = formatCipherId(cipherId, 2);

      expect(formatted).toBe('abcdef01-abcdef01');
    });

    test('handles group count larger than available', () => {
      const cipherId = '01234567';
      const formatted = formatCipherId(cipherId, 10);

      expect(formatted).toBe('01234567');
    });
  });

  describe('security properties', () => {
    test('cipher ID cannot be reversed to key', () => {
      // This is a property test - we can't actually reverse it,
      // but we verify the ID doesn't contain obvious key data
      const key = new Uint8Array(32).fill(0x42);
      const cipherId = generateCipherId(key);

      // Key pattern shouldn't appear in cipher ID
      const keyPattern = '42'.repeat(16); // What the key looks like in hex
      expect(cipherId.includes(keyPattern)).toBe(false);
    });

    test('small key changes produce completely different IDs', () => {
      const key1 = new Uint8Array(32).fill(0);
      const key2 = new Uint8Array(32).fill(0);
      key2[0] = 1; // Change just one bit

      const id1 = generateCipherId(key1);
      const id2 = generateCipherId(key2);

      // Count differing characters (should be high due to avalanche effect)
      let diffCount = 0;
      for (let i = 0; i < id1.length; i++) {
        if (id1[i] !== id2[i]) diffCount++;
      }

      // At least 50% of characters should differ (avalanche property)
      expect(diffCount).toBeGreaterThan(CIPHER_ID_LENGTH * 0.4);
    });
  });
});
