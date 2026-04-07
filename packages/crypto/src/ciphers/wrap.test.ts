import { describe, expect, test } from 'bun:test';
import { randomBytes, toBase64 } from '../utils';
import { encrypt as symmetricEncrypt } from '../encrypt/symmetric';
import {
  deriveEntropyWrappingKey,
  generateWrappingSalt,
  wrapEntropy,
  unwrapEntropy,
  isWrappedEntropy,
  migrateEntropyToWrapped,
  getSaltFromWrapped,
  ENTROPY_WRAP_VERSION,
} from './wrap';
import type { EntropyPiece } from './types';

const sampleEntropy: EntropyPiece[] = [
  { type: 'text', value: 'sample-passphrase-entropy' },
  { type: 'text', value: 'second-piece' },
];

describe('ciphers/wrap', () => {
  describe('deriveEntropyWrappingKey', () => {
    test('returns a 32-byte key', async () => {
      const salt = generateWrappingSalt();
      const key = await deriveEntropyWrappingKey('test-passphrase', salt);

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    test('same passphrase + salt produces same key', async () => {
      const salt = generateWrappingSalt();
      const k1 = await deriveEntropyWrappingKey('deterministic', salt);
      const k2 = await deriveEntropyWrappingKey('deterministic', salt);

      expect(k1).toEqual(k2);
    });

    test('different passphrases produce different keys', async () => {
      const salt = generateWrappingSalt();
      const k1 = await deriveEntropyWrappingKey('alpha', salt);
      const k2 = await deriveEntropyWrappingKey('bravo', salt);

      expect(k1).not.toEqual(k2);
    });
  });

  describe('generateWrappingSalt', () => {
    test('returns a Uint8Array of expected length', () => {
      const salt = generateWrappingSalt();

      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBeGreaterThanOrEqual(16);
    });

    test('two calls produce different salts', () => {
      const a = generateWrappingSalt();
      const b = generateWrappingSalt();

      expect(toBase64(a)).not.toBe(toBase64(b));
    });
  });

  describe('wrapEntropy / unwrapEntropy', () => {
    test('round-trip: wrap then unwrap recovers original entropy pieces', async () => {
      const salt = generateWrappingSalt();
      const key = await deriveEntropyWrappingKey('round-trip-pass', salt);

      const wrapped = await wrapEntropy(sampleEntropy, key, salt);
      const recovered = await unwrapEntropy(wrapped, key);

      expect(recovered).toEqual(sampleEntropy);
    });

    test('output has correct WrappedEntropy shape', async () => {
      const salt = generateWrappingSalt();
      const key = await deriveEntropyWrappingKey('shape-test', salt);

      const wrapped = await wrapEntropy(sampleEntropy, key, salt);

      expect(typeof wrapped.version).toBe('number');
      expect(typeof wrapped.salt).toBe('string');
      expect(typeof wrapped.ciphertext).toBe('string');
      expect(typeof wrapped.nonce).toBe('string');
    });

    test('version field matches ENTROPY_WRAP_VERSION', async () => {
      const salt = generateWrappingSalt();
      const key = await deriveEntropyWrappingKey('version-test', salt);

      const wrapped = await wrapEntropy(sampleEntropy, key, salt);
      expect(wrapped.version).toBe(ENTROPY_WRAP_VERSION);
    });

    test('wrong wrapping key fails to unwrap', async () => {
      const salt = generateWrappingSalt();
      const rightKey = await deriveEntropyWrappingKey('correct', salt);
      const wrongKey = randomBytes(32);

      const wrapped = await wrapEntropy(sampleEntropy, rightKey, salt);

      await expect(unwrapEntropy(wrapped, wrongKey)).rejects.toThrow();
    });

    test('tampered ciphertext fails to unwrap', async () => {
      const salt = generateWrappingSalt();
      const key = await deriveEntropyWrappingKey('tamper-test', salt);

      const wrapped = await wrapEntropy(sampleEntropy, key, salt);
      const tampered = { ...wrapped, ciphertext: toBase64(randomBytes(64)) };

      await expect(unwrapEntropy(tampered, key)).rejects.toThrow();
    });

    test('rejects unsupported wrapped entropy version', async () => {
      const salt = generateWrappingSalt();
      const key = await deriveEntropyWrappingKey('version-reject', salt);
      const wrapped = await wrapEntropy(sampleEntropy, key, salt);
      const invalidVersion = { ...wrapped, version: wrapped.version + 1 };

      await expect(unwrapEntropy(invalidVersion, key)).rejects.toThrow(
        'Unsupported entropy wrap version'
      );
    });

    test('throws when decrypted payload is not valid JSON', async () => {
      const salt = generateWrappingSalt();
      const key = await deriveEntropyWrappingKey('invalid-json', salt);
      const { ciphertext, nonce } = symmetricEncrypt(
        key,
        new TextEncoder().encode('not-json')
      );
      const wrapped = {
        version: ENTROPY_WRAP_VERSION,
        salt: toBase64(salt),
        ciphertext: toBase64(ciphertext),
        nonce: toBase64(nonce),
      };

      await expect(unwrapEntropy(wrapped, key)).rejects.toThrow();
    });
  });

  describe('isWrappedEntropy', () => {
    test('returns true for valid WrappedEntropy shape', async () => {
      const salt = generateWrappingSalt();
      const key = await deriveEntropyWrappingKey('shape-check', salt);
      const wrapped = await wrapEntropy(sampleEntropy, key, salt);

      expect(isWrappedEntropy(wrapped)).toBe(true);
    });

    test('returns false for partial/missing fields', () => {
      expect(isWrappedEntropy({ version: 1, salt: 'a', ciphertext: 'b' })).toBe(false);
      expect(isWrappedEntropy({ version: 1, salt: 'a' })).toBe(false);
      expect(isWrappedEntropy({})).toBe(false);
    });

    test('returns false for non-objects', () => {
      expect(isWrappedEntropy(null)).toBe(false);
      expect(isWrappedEntropy('string')).toBe(false);
      expect(isWrappedEntropy(42)).toBe(false);
      expect(isWrappedEntropy(undefined)).toBe(false);
    });
  });

  describe('migrateEntropyToWrapped', () => {
    test('produces output that round-trips through unwrapEntropy', async () => {
      const salt = generateWrappingSalt();
      const key = await deriveEntropyWrappingKey('migrate-test', salt);

      const wrapped = await migrateEntropyToWrapped(sampleEntropy, key, salt);
      const recovered = await unwrapEntropy(wrapped, key);

      expect(recovered).toEqual(sampleEntropy);
    });

    test('produces valid WrappedEntropy shape', async () => {
      const salt = generateWrappingSalt();
      const key = await deriveEntropyWrappingKey('migrate-shape', salt);

      const wrapped = await migrateEntropyToWrapped(sampleEntropy, key, salt);

      expect(isWrappedEntropy(wrapped)).toBe(true);
      expect(wrapped.version).toBe(ENTROPY_WRAP_VERSION);
    });
  });

  describe('getSaltFromWrapped', () => {
    test('extracts salt bytes matching what was passed to wrapEntropy', async () => {
      const salt = generateWrappingSalt();
      const key = await deriveEntropyWrappingKey('salt-extract', salt);

      const wrapped = await wrapEntropy(sampleEntropy, key, salt);
      const extracted = getSaltFromWrapped(wrapped);

      expect(extracted).toEqual(salt);
    });
  });
});
