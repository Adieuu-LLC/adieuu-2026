import { describe, expect, test } from 'bun:test';
import {
  generateIdentityHash,
  verifyIdentityHash,
  validatePassphrase,
  MIN_PASSPHRASE_LENGTH,
  CURRENT_HASH_VERSION,
  HASH_VERSIONS,
} from './identity-hash';

describe('identity-hash utilities', () => {
  // Test data
  const testUserId = '507f1f77bcf86cd799439011';
  const testUserCreatedAt = new Date('2024-01-15T12:00:00Z');
  const validPassphrase = 'my-secure-passphrase-123';
  const shortPassphrase = 'short'; // Less than 8 chars

  describe('validatePassphrase', () => {
    test('returns valid for passphrase meeting minimum length', () => {
      const result = validatePassphrase('12345678');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('returns valid for longer passphrases', () => {
      const result = validatePassphrase('this is a very long passphrase with many words');
      expect(result.valid).toBe(true);
    });

    test('returns invalid for passphrase below minimum length', () => {
      const result = validatePassphrase('1234567');
      expect(result.valid).toBe(false);
      expect(result.error).toContain(`${MIN_PASSPHRASE_LENGTH}`);
    });

    test('returns invalid for empty passphrase', () => {
      const result = validatePassphrase('');
      expect(result.valid).toBe(false);
    });

    test('handles unicode characters', () => {
      const result = validatePassphrase('password');
      expect(result.valid).toBe(true);
    });

    test('handles whitespace-only passphrase of sufficient length', () => {
      const result = validatePassphrase('        '); // 8 spaces
      expect(result.valid).toBe(true);
    });
  });

  describe('generateIdentityHash', () => {
    test('returns a 64-character hex string (SHA3-256)', async () => {
      const { hash } = await generateIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt
      );
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('returns the current hash version', async () => {
      const { version } = await generateIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt
      );
      expect(version).toBe(CURRENT_HASH_VERSION);
    });

    test('produces deterministic hashes for same inputs', async () => {
      const result1 = await generateIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt
      );
      const result2 = await generateIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt
      );
      expect(result1.hash).toBe(result2.hash);
    });

    test('produces different hashes for different passphrases', async () => {
      const result1 = await generateIdentityHash(
        'passphrase-one',
        testUserId,
        testUserCreatedAt
      );
      const result2 = await generateIdentityHash(
        'passphrase-two',
        testUserId,
        testUserCreatedAt
      );
      expect(result1.hash).not.toBe(result2.hash);
    });

    test('produces different hashes for different user IDs', async () => {
      const result1 = await generateIdentityHash(
        validPassphrase,
        '507f1f77bcf86cd799439011',
        testUserCreatedAt
      );
      const result2 = await generateIdentityHash(
        validPassphrase,
        '507f1f77bcf86cd799439022',
        testUserCreatedAt
      );
      expect(result1.hash).not.toBe(result2.hash);
    });

    test('produces different hashes for different createdAt timestamps', async () => {
      const result1 = await generateIdentityHash(
        validPassphrase,
        testUserId,
        new Date('2024-01-15T12:00:00Z')
      );
      const result2 = await generateIdentityHash(
        validPassphrase,
        testUserId,
        new Date('2024-01-15T12:00:01Z') // 1 second difference
      );
      expect(result1.hash).not.toBe(result2.hash);
    });

    test('throws error for passphrase below minimum length', async () => {
      await expect(
        generateIdentityHash(shortPassphrase, testUserId, testUserCreatedAt)
      ).rejects.toThrow();
    });

    test('throws error for empty passphrase', async () => {
      await expect(
        generateIdentityHash('', testUserId, testUserCreatedAt)
      ).rejects.toThrow();
    });

    test('handles special characters in passphrase', async () => {
      const specialPassphrase = 'pass@#$%^&*()_+{}[]|\\:";\'<>?,./~`phrase';
      const { hash } = await generateIdentityHash(
        specialPassphrase,
        testUserId,
        testUserCreatedAt
      );
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('handles unicode passphrase', async () => {
      const unicodePassphrase = 'password';
      const { hash } = await generateIdentityHash(
        unicodePassphrase,
        testUserId,
        testUserCreatedAt
      );
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('handles very long passphrase', async () => {
      const longPassphrase = 'a'.repeat(1000);
      const { hash } = await generateIdentityHash(
        longPassphrase,
        testUserId,
        testUserCreatedAt
      );
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('can specify a specific hash version', async () => {
      const { version } = await generateIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt,
        1
      );
      expect(version).toBe(1);
    });

    test('throws error for unknown hash version', async () => {
      await expect(
        generateIdentityHash(validPassphrase, testUserId, testUserCreatedAt, 999)
      ).rejects.toThrow('Unknown hash version');
    });
  });

  describe('verifyIdentityHash', () => {
    test('returns match=true for correct passphrase', async () => {
      const { hash, version } = await generateIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt
      );

      const result = await verifyIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt,
        hash,
        version
      );

      expect(result.match).toBe(true);
    });

    test('returns match=false for incorrect passphrase', async () => {
      const { hash, version } = await generateIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt
      );

      const result = await verifyIdentityHash(
        'wrong-passphrase',
        testUserId,
        testUserCreatedAt,
        hash,
        version
      );

      expect(result.match).toBe(false);
    });

    test('returns match=false for incorrect userId', async () => {
      const { hash, version } = await generateIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt
      );

      const result = await verifyIdentityHash(
        validPassphrase,
        'different-user-id-12345',
        testUserCreatedAt,
        hash,
        version
      );

      expect(result.match).toBe(false);
    });

    test('returns match=false for incorrect createdAt', async () => {
      const { hash, version } = await generateIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt
      );

      const result = await verifyIdentityHash(
        validPassphrase,
        testUserId,
        new Date('2024-01-16T12:00:00Z'), // Different date
        hash,
        version
      );

      expect(result.match).toBe(false);
    });

    test('returns needsUpgrade=false when using current version', async () => {
      const { hash, version } = await generateIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt,
        CURRENT_HASH_VERSION
      );

      const result = await verifyIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt,
        hash,
        version
      );

      expect(result.match).toBe(true);
      expect(result.needsUpgrade).toBe(false);
      expect(result.newHash).toBeUndefined();
      expect(result.newVersion).toBeUndefined();
    });

    test('returns needsUpgrade=false on failed match', async () => {
      const { hash, version } = await generateIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt
      );

      const result = await verifyIdentityHash(
        'wrong-passphrase',
        testUserId,
        testUserCreatedAt,
        hash,
        version
      );

      expect(result.match).toBe(false);
      expect(result.needsUpgrade).toBe(false);
    });

    test('handles case-sensitive passphrase comparison', async () => {
      const { hash, version } = await generateIdentityHash(
        'MyPassPhrase',
        testUserId,
        testUserCreatedAt
      );

      const resultCorrect = await verifyIdentityHash(
        'MyPassPhrase',
        testUserId,
        testUserCreatedAt,
        hash,
        version
      );

      const resultWrong = await verifyIdentityHash(
        'mypassphrase', // Different case
        testUserId,
        testUserCreatedAt,
        hash,
        version
      );

      expect(resultCorrect.match).toBe(true);
      expect(resultWrong.match).toBe(false);
    });
  });

  describe('HASH_VERSIONS configuration', () => {
    test('CURRENT_HASH_VERSION is defined in HASH_VERSIONS', () => {
      expect(HASH_VERSIONS[CURRENT_HASH_VERSION]).toBeDefined();
    });

    test('version 1 has expected parameters', () => {
      const v1 = HASH_VERSIONS[1];
      expect(v1).toBeDefined();
      expect(v1?.memoryCost).toBeGreaterThan(0);
      expect(v1?.timeCost).toBeGreaterThan(0);
      expect(v1?.parallelism).toBeGreaterThan(0);
    });

    test('MIN_PASSPHRASE_LENGTH is reasonable', () => {
      expect(MIN_PASSPHRASE_LENGTH).toBeGreaterThanOrEqual(8);
      expect(MIN_PASSPHRASE_LENGTH).toBeLessThanOrEqual(32);
    });
  });

  describe('security properties', () => {
    test('hash is not reversible (cannot extract passphrase)', async () => {
      const { hash } = await generateIdentityHash(
        validPassphrase,
        testUserId,
        testUserCreatedAt
      );

      // Hash should not contain the passphrase
      expect(hash).not.toContain(validPassphrase);
      expect(hash).not.toContain(testUserId);
    });

    test('different inputs produce visually different hashes', async () => {
      const hashes = await Promise.all([
        generateIdentityHash('passphrase1', testUserId, testUserCreatedAt),
        generateIdentityHash('passphrase2', testUserId, testUserCreatedAt),
        generateIdentityHash('passphrase3', testUserId, testUserCreatedAt),
      ]);

      const hashValues = hashes.map((h) => h.hash);

      // All should be unique
      expect(new Set(hashValues).size).toBe(3);

      // Hashes should differ significantly (not just by a few characters)
      // Count differing characters between first two hashes
      let differences = 0;
      for (let i = 0; i < hashValues[0]!.length; i++) {
        if (hashValues[0]![i] !== hashValues[1]![i]) {
          differences++;
        }
      }
      // Should have many differences (avalanche effect)
      expect(differences).toBeGreaterThan(10);
    });

    test('hash length is consistent', async () => {
      const hashes = await Promise.all([
        generateIdentityHash('short', testUserId, testUserCreatedAt).catch(() => null),
        generateIdentityHash('mediumpassphrase', testUserId, testUserCreatedAt),
        generateIdentityHash('a'.repeat(100), testUserId, testUserCreatedAt),
        generateIdentityHash('a'.repeat(500), testUserId, testUserCreatedAt),
      ]);

      const validHashes = hashes.filter((h) => h !== null);
      const lengths = validHashes.map((h) => h!.hash.length);

      // All valid hashes should have the same length (64 chars for SHA3-256)
      expect(new Set(lengths).size).toBe(1);
      expect(lengths[0]).toBe(64);
    });
  });
});

