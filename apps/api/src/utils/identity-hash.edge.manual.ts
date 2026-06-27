import { describe, expect, test } from 'bun:test';
import {
  generateIdentityHash,
  verifyIdentityHash,
  validatePassphrase,
  MIN_PASSPHRASE_LENGTH,
  CURRENT_HASH_VERSION,
  HASH_VERSIONS,
} from './identity-hash';

const testAccountHash = 'a'.repeat(64);
const testAccountHash2 = 'b'.repeat(64);
const validPassphrase = 'my-secure-passphrase-123';

describe('identity-hash utilities', () => {
  describe('validatePassphrase', () => {
    test('returns valid for passphrase meeting minimum length', () => {
      const result = validatePassphrase('12345678');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
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
  });

  describe('generateIdentityHash', () => {
    test('produces deterministic output for same inputs', async () => {
      const result1 = await generateIdentityHash(validPassphrase, testAccountHash);
      const result2 = await generateIdentityHash(validPassphrase, testAccountHash);
      expect(result1.hash).toBe(result2.hash);
    });

    test('returns a 64-character hex string', async () => {
      const { hash } = await generateIdentityHash(validPassphrase, testAccountHash);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('produces different hashes for different passphrases', async () => {
      const result1 = await generateIdentityHash('passphrase-one', testAccountHash);
      const result2 = await generateIdentityHash('passphrase-two', testAccountHash);
      expect(result1.hash).not.toBe(result2.hash);
    });

    test('produces different hashes for different accountHash values', async () => {
      const result1 = await generateIdentityHash(validPassphrase, testAccountHash);
      const result2 = await generateIdentityHash(validPassphrase, testAccountHash2);
      expect(result1.hash).not.toBe(result2.hash);
    });

    test('is case-sensitive for passphrases', async () => {
      const upper = await generateIdentityHash('MyPassPhrase', testAccountHash);
      const lower = await generateIdentityHash('mypassphrase', testAccountHash);
      expect(upper.hash).not.toBe(lower.hash);
    });

    test('handles special characters in passphrase', async () => {
      const { hash } = await generateIdentityHash(
        'pass@#$%^&*()_+{}[]|\\:";\'<>?,./~`phrase',
        testAccountHash,
      );
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('handles unicode in passphrase', async () => {
      const { hash } = await generateIdentityHash('p\u00e4ssw\u00f6rd\u2603\ud83d\udd12', testAccountHash);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('throws for passphrase below minimum length', async () => {
      await expect(generateIdentityHash('short', testAccountHash)).rejects.toThrow();
    });

    test('throws for unknown hash version', async () => {
      await expect(
        generateIdentityHash(validPassphrase, testAccountHash, 999),
      ).rejects.toThrow('Unknown hash version');
    });

    test('defaults to CURRENT_HASH_VERSION', async () => {
      const { version } = await generateIdentityHash(validPassphrase, testAccountHash);
      expect(version).toBe(CURRENT_HASH_VERSION);
    });

    test('consistent length regardless of passphrase length', async () => {
      const [medium, long, veryLong] = await Promise.all([
        generateIdentityHash('mediumpassphrase', testAccountHash),
        generateIdentityHash('a'.repeat(100), testAccountHash),
        generateIdentityHash('a'.repeat(500), testAccountHash),
      ]);
      expect(medium.hash.length).toBe(64);
      expect(long.hash.length).toBe(64);
      expect(veryLong.hash.length).toBe(64);
    });
  });

  describe('verifyIdentityHash', () => {
    test('succeeds for correct passphrase and accountHash', async () => {
      const { hash, version } = await generateIdentityHash(validPassphrase, testAccountHash);
      const result = await verifyIdentityHash(validPassphrase, testAccountHash, hash, version);
      expect(result.match).toBe(true);
    });

    test('fails for wrong passphrase', async () => {
      const { hash, version } = await generateIdentityHash(validPassphrase, testAccountHash);
      const result = await verifyIdentityHash('wrong-passphrase', testAccountHash, hash, version);
      expect(result.match).toBe(false);
    });

    test('fails for wrong accountHash', async () => {
      const { hash, version } = await generateIdentityHash(validPassphrase, testAccountHash);
      const result = await verifyIdentityHash(validPassphrase, testAccountHash2, hash, version);
      expect(result.match).toBe(false);
    });

    test('needsUpgrade is false when using current version', async () => {
      const { hash } = await generateIdentityHash(
        validPassphrase,
        testAccountHash,
        CURRENT_HASH_VERSION,
      );
      const result = await verifyIdentityHash(
        validPassphrase,
        testAccountHash,
        hash,
        CURRENT_HASH_VERSION,
      );
      expect(result.match).toBe(true);
      expect(result.needsUpgrade).toBe(false);
      expect(result.newHash).toBeUndefined();
      expect(result.newVersion).toBeUndefined();
    });

    test('needsUpgrade is false on failed match', async () => {
      const { hash, version } = await generateIdentityHash(validPassphrase, testAccountHash);
      const result = await verifyIdentityHash('wrong-passphrase', testAccountHash, hash, version);
      expect(result.match).toBe(false);
      expect(result.needsUpgrade).toBe(false);
    });

    test('case-sensitive passphrase verification', async () => {
      const { hash, version } = await generateIdentityHash('MyPassPhrase', testAccountHash);

      const correct = await verifyIdentityHash('MyPassPhrase', testAccountHash, hash, version);
      const wrong = await verifyIdentityHash('mypassphrase', testAccountHash, hash, version);

      expect(correct.match).toBe(true);
      expect(wrong.match).toBe(false);
    });
  });

  describe('version handling', () => {
    test('CURRENT_HASH_VERSION is 2', () => {
      expect(CURRENT_HASH_VERSION).toBe(2);
    });

    test('CURRENT_HASH_VERSION exists in HASH_VERSIONS', () => {
      expect(HASH_VERSIONS[CURRENT_HASH_VERSION]).toBeDefined();
    });

    test('version 2 has valid Argon2id parameters', () => {
      const v2 = HASH_VERSIONS[2];
      expect(v2).toBeDefined();
      expect(v2!.memoryCost).toBeGreaterThan(0);
      expect(v2!.timeCost).toBeGreaterThan(0);
      expect(v2!.parallelism).toBeGreaterThan(0);
    });

    test('MIN_PASSPHRASE_LENGTH is at least 8', () => {
      expect(MIN_PASSPHRASE_LENGTH).toBeGreaterThanOrEqual(8);
    });
  });
});
