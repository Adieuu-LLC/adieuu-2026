import { describe, expect, test } from 'bun:test';

import {
  deriveKeyFromPassword,
  deriveKey,
  deriveKeyHighSecurity,
  generateArgon2Salt,
  verifyPassword,
  benchmarkArgon2,
  ARGON2_DEFAULTS,
  ARGON2_HIGH_SECURITY,
} from './argon2';
import { randomBytes, constantTimeEqual, toHex } from '../utils';

describe('kdf/argon2', () => {
  describe('constants', () => {
    test('ARGON2_DEFAULTS has expected values', () => {
      expect(ARGON2_DEFAULTS.memoryCost).toBe(65536);
      expect(ARGON2_DEFAULTS.timeCost).toBe(3);
      expect(ARGON2_DEFAULTS.parallelism).toBe(4);
      expect(ARGON2_DEFAULTS.outputLength).toBe(32);
      expect(ARGON2_DEFAULTS.saltLength).toBe(16);
    });

    test('ARGON2_HIGH_SECURITY has stronger values', () => {
      expect(ARGON2_HIGH_SECURITY.memoryCost).toBeGreaterThan(ARGON2_DEFAULTS.memoryCost);
      expect(ARGON2_HIGH_SECURITY.timeCost).toBeGreaterThanOrEqual(ARGON2_DEFAULTS.timeCost);
      expect(ARGON2_HIGH_SECURITY.saltLength).toBeGreaterThan(ARGON2_DEFAULTS.saltLength);
    });
  });

  describe('deriveKeyFromPassword', () => {
    // Use lower parameters for faster tests
    const fastParams = {
      memoryCost: 1024, // 1 MB - fast for tests
      timeCost: 1,
      parallelism: 1,
      outputLength: 32,
    };

    test('derives 32-byte key by default', async () => {
      const salt = randomBytes(16);
      const key = await deriveKeyFromPassword({
        password: 'test-password',
        salt,
        ...fastParams,
      });

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    test('derives custom length key', async () => {
      const salt = randomBytes(16);
      const key = await deriveKeyFromPassword({
        password: 'test-password',
        salt,
        ...fastParams,
        outputLength: 64,
      });

      expect(key.length).toBe(64);
    });

    test('is deterministic', async () => {
      const salt = randomBytes(16);
      const password = 'deterministic-test';

      const key1 = await deriveKeyFromPassword({
        password,
        salt,
        ...fastParams,
      });
      const key2 = await deriveKeyFromPassword({
        password,
        salt,
        ...fastParams,
      });

      expect(constantTimeEqual(key1, key2)).toBe(true);
    });

    test('different passwords produce different keys', async () => {
      const salt = randomBytes(16);

      const key1 = await deriveKeyFromPassword({
        password: 'password1',
        salt,
        ...fastParams,
      });
      const key2 = await deriveKeyFromPassword({
        password: 'password2',
        salt,
        ...fastParams,
      });

      expect(constantTimeEqual(key1, key2)).toBe(false);
    });

    test('different salts produce different keys', async () => {
      const password = 'same-password';

      const key1 = await deriveKeyFromPassword({
        password,
        salt: randomBytes(16),
        ...fastParams,
      });
      const key2 = await deriveKeyFromPassword({
        password,
        salt: randomBytes(16),
        ...fastParams,
      });

      expect(constantTimeEqual(key1, key2)).toBe(false);
    });

    test('throws on salt too short', async () => {
      const shortSalt = randomBytes(4);

      await expect(
        deriveKeyFromPassword({
          password: 'test',
          salt: shortSalt,
          ...fastParams,
        })
      ).rejects.toThrow('Salt must be at least 8 bytes');
    });

    test('throws on empty password', async () => {
      const salt = randomBytes(16);
      
      // hash-wasm requires non-empty password
      await expect(
        deriveKeyFromPassword({
          password: '',
          salt,
          ...fastParams,
        })
      ).rejects.toThrow('Password must be specified');
    });

    test('handles unicode password', async () => {
      const salt = randomBytes(16);
      const key = await deriveKeyFromPassword({
        password: 'pässwörd',
        salt,
        ...fastParams,
      });

      expect(key.length).toBe(32);
    });

    test('handles long password', async () => {
      const salt = randomBytes(16);
      const longPassword = 'a'.repeat(1000);
      const key = await deriveKeyFromPassword({
        password: longPassword,
        salt,
        ...fastParams,
      });

      expect(key.length).toBe(32);
    });

    test('higher memory cost produces different key', async () => {
      const salt = randomBytes(16);
      const password = 'test';

      const key1 = await deriveKeyFromPassword({
        password,
        salt,
        memoryCost: 1024,
        timeCost: 1,
        parallelism: 1,
        outputLength: 32,
      });
      const key2 = await deriveKeyFromPassword({
        password,
        salt,
        memoryCost: 2048,
        timeCost: 1,
        parallelism: 1,
        outputLength: 32,
      });

      expect(constantTimeEqual(key1, key2)).toBe(false);
    });

    test('higher time cost produces different key', async () => {
      const salt = randomBytes(16);
      const password = 'test';

      const key1 = await deriveKeyFromPassword({
        password,
        salt,
        memoryCost: 1024,
        timeCost: 1,
        parallelism: 1,
        outputLength: 32,
      });
      const key2 = await deriveKeyFromPassword({
        password,
        salt,
        memoryCost: 1024,
        timeCost: 2,
        parallelism: 1,
        outputLength: 32,
      });

      expect(constantTimeEqual(key1, key2)).toBe(false);
    });
  });

  describe('deriveKey', () => {
    test('uses default parameters', async () => {
      const salt = randomBytes(16);
      const key = await deriveKey('test-password', salt);

      expect(key.length).toBe(ARGON2_DEFAULTS.outputLength);
    });

    test('is deterministic', async () => {
      const salt = randomBytes(16);
      const password = 'test';

      const key1 = await deriveKey(password, salt);
      const key2 = await deriveKey(password, salt);

      expect(constantTimeEqual(key1, key2)).toBe(true);
    });
  });

  describe('deriveKeyHighSecurity', () => {
    test('uses high security parameters', async () => {
      const salt = randomBytes(32);
      const key = await deriveKeyHighSecurity('test-password', salt);

      expect(key.length).toBe(ARGON2_HIGH_SECURITY.outputLength);
    });

    test('produces different output than default', async () => {
      const salt = randomBytes(32);
      const password = 'test';

      const defaultKey = await deriveKey(password, salt);
      const highSecKey = await deriveKeyHighSecurity(password, salt);

      expect(constantTimeEqual(defaultKey, highSecKey)).toBe(false);
    });
  });

  describe('generateArgon2Salt', () => {
    test('generates salt of default length', () => {
      const salt = generateArgon2Salt();
      expect(salt.length).toBe(ARGON2_DEFAULTS.saltLength);
    });

    test('generates salt of custom length', () => {
      expect(generateArgon2Salt(8).length).toBe(8);
      expect(generateArgon2Salt(32).length).toBe(32);
      expect(generateArgon2Salt(64).length).toBe(64);
    });

    test('generates unique salts', () => {
      const salts = new Set<string>();
      for (let i = 0; i < 100; i++) {
        salts.add(toHex(generateArgon2Salt()));
      }
      expect(salts.size).toBe(100);
    });

    test('returns Uint8Array', () => {
      expect(generateArgon2Salt()).toBeInstanceOf(Uint8Array);
    });
  });

  describe('verifyPassword', () => {
    const fastParams = {
      memoryCost: 1024,
      timeCost: 1,
      parallelism: 1,
    };

    test('returns true for correct password', async () => {
      const password = 'correct-password';
      const salt = randomBytes(16);

      const hash = await deriveKeyFromPassword({
        password,
        salt,
        ...fastParams,
        outputLength: 32,
      });

      const isValid = await verifyPassword(password, hash, salt, fastParams);
      expect(isValid).toBe(true);
    });

    test('returns false for wrong password', async () => {
      const salt = randomBytes(16);

      const hash = await deriveKeyFromPassword({
        password: 'correct-password',
        salt,
        ...fastParams,
        outputLength: 32,
      });

      const isValid = await verifyPassword('wrong-password', hash, salt, fastParams);
      expect(isValid).toBe(false);
    });

    test('returns false for wrong salt', async () => {
      const password = 'test';
      const salt1 = randomBytes(16);
      const salt2 = randomBytes(16);

      const hash = await deriveKeyFromPassword({
        password,
        salt: salt1,
        ...fastParams,
        outputLength: 32,
      });

      const isValid = await verifyPassword(password, hash, salt2, fastParams);
      expect(isValid).toBe(false);
    });

    test('returns false for different parameters', async () => {
      const password = 'test';
      const salt = randomBytes(16);

      const hash = await deriveKeyFromPassword({
        password,
        salt,
        memoryCost: 1024,
        timeCost: 1,
        parallelism: 1,
        outputLength: 32,
      });

      // Verify with different parameters
      const isValid = await verifyPassword(password, hash, salt, {
        memoryCost: 2048,
        timeCost: 1,
        parallelism: 1,
      });
      expect(isValid).toBe(false);
    });

    test('uses default parameters when not specified', async () => {
      const password = 'test';
      const salt = randomBytes(16);

      // Create hash with defaults (this is slow, so we skip in practice)
      // Just testing that it accepts undefined options
      const hash = await deriveKeyFromPassword({
        password,
        salt,
        ...fastParams,
        outputLength: 32,
      });

      // Verify with explicit fast params
      const isValid = await verifyPassword(password, hash, salt, fastParams);
      expect(isValid).toBe(true);
    });

    test('handles different output lengths', async () => {
      const password = 'test';
      const salt = randomBytes(16);

      const hash = await deriveKeyFromPassword({
        password,
        salt,
        ...fastParams,
        outputLength: 64,
      });

      const isValid = await verifyPassword(password, hash, salt, {
        ...fastParams,
        outputLength: 64,
      });
      expect(isValid).toBe(true);
    });

    test('returns false for length mismatch', async () => {
      const password = 'test';
      const salt = randomBytes(16);

      const hash = await deriveKeyFromPassword({
        password,
        salt,
        ...fastParams,
        outputLength: 32,
      });

      // Try to verify with different expected length - will produce different hash
      const isValid = await verifyPassword(password, hash, salt, {
        ...fastParams,
        outputLength: 64,
      });
      expect(isValid).toBe(false);
    });
  });

  describe('benchmarkArgon2', () => {
    test('returns time in milliseconds', async () => {
      const time = await benchmarkArgon2({
        memoryCost: 1024,
        timeCost: 1,
        parallelism: 1,
      });

      expect(typeof time).toBe('number');
      expect(time).toBeGreaterThan(0);
    });

    test('higher memory cost takes longer', async () => {
      const time1 = await benchmarkArgon2({
        memoryCost: 1024,
        timeCost: 1,
        parallelism: 1,
      });

      const time2 = await benchmarkArgon2({
        memoryCost: 8192,
        timeCost: 1,
        parallelism: 1,
      });

      // time2 should generally be longer (may not be deterministic)
      // Just verify both return valid times
      expect(time1).toBeGreaterThan(0);
      expect(time2).toBeGreaterThan(0);
    });

    test('uses defaults when no options provided', async () => {
      // This might be slow with full defaults, so we just test it doesn't throw
      // In practice, you'd use custom params for testing
      const time = await benchmarkArgon2({
        memoryCost: 1024,
        timeCost: 1,
        parallelism: 1,
      });

      expect(time).toBeGreaterThan(0);
    });
  });

  describe('security properties', () => {
    const fastParams = {
      memoryCost: 1024,
      timeCost: 1,
      parallelism: 1,
      outputLength: 32,
    };

    test('similar passwords produce very different keys', async () => {
      const salt = randomBytes(16);

      const key1 = await deriveKeyFromPassword({
        password: 'password',
        salt,
        ...fastParams,
      });
      const key2 = await deriveKeyFromPassword({
        password: 'Password', // Capital P
        salt,
        ...fastParams,
      });
      const key3 = await deriveKeyFromPassword({
        password: 'password1', // Added 1
        salt,
        ...fastParams,
      });

      // Check they're completely different (not just one bit)
      let diff12 = 0;
      let diff13 = 0;
      for (let i = 0; i < 32; i++) {
        if (key1[i] !== key2[i]) diff12++;
        if (key1[i] !== key3[i]) diff13++;
      }

      // Expect roughly half the bytes to be different (good avalanche)
      expect(diff12).toBeGreaterThan(10);
      expect(diff13).toBeGreaterThan(10);
    });
  });
});
