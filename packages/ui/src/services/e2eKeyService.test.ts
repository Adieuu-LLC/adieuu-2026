import { describe, expect, test } from 'bun:test';

import {
  generateE2EKeys,
  generateDeviceKeys,
  decryptKeyBundle,
  getDefaultDeviceName,
  E2EKeyError,
  type E2EInitInput,
} from './e2eKeyService';
import {
  fromBase64,
  deriveKeyFromPassword,
  decryptChaCha20Poly1305,
  ARGON2_DEFAULTS,
  constantTimeEqual,
} from '@adieuu/crypto';

describe('services/e2eKeyService', () => {
  describe('generateE2EKeys', () => {
    const baseInput: E2EInitInput = {
      identityId: 'test-identity-123',
      passphrase: 'test-passphrase-secure-enough',
      deviceName: 'Test Device',
      cryptoProfile: 'default',
    };

    test('generates valid Ed25519 signing key pair', async () => {
      const result = await generateE2EKeys(baseInput);

      // Public key should be 32 bytes (Ed25519)
      const publicKey = fromBase64(result.signingPublicKey);
      expect(publicKey.length).toBe(32);

      // Private key should be 32 bytes (Ed25519 seed)
      expect(result.signingPrivateKey.length).toBe(32);
    });

    test('generates valid X25519 ECDH key pair', async () => {
      const result = await generateE2EKeys(baseInput);

      // Public key should be 32 bytes (X25519)
      const publicKey = fromBase64(result.device.ecdhPublicKey);
      expect(publicKey.length).toBe(32);

      // Private key should be 32 bytes (X25519)
      expect(result.devicePrivateKeys.ecdh.length).toBe(32);
    });

    test('generates valid ML-KEM-768 key pair for default profile', async () => {
      const result = await generateE2EKeys(baseInput);

      // ML-KEM-768 public key is 1184 bytes
      const publicKey = fromBase64(result.device.kemPublicKey);
      expect(publicKey.length).toBe(1184);

      // ML-KEM-768 private key is 2400 bytes
      expect(result.devicePrivateKeys.kem.length).toBe(2400);
    });

    test('generates valid ML-KEM-1024 key pair for cnsa2 profile', async () => {
      const result = await generateE2EKeys({
        ...baseInput,
        cryptoProfile: 'cnsa2',
      });

      // ML-KEM-1024 public key is 1568 bytes
      const publicKey = fromBase64(result.device.kemPublicKey);
      expect(publicKey.length).toBe(1568);

      // ML-KEM-1024 private key is 3168 bytes
      expect(result.devicePrivateKeys.kem.length).toBe(3168);
    });

    test('encrypts signing key that can be decrypted', async () => {
      const result = await generateE2EKeys(baseInput);

      // Derive the key the same way
      const derivedKey = await deriveKeyFromPassword({
        password: baseInput.passphrase,
        salt: fromBase64(result.encryptedBundle.salt),
        memoryCost: ARGON2_DEFAULTS.memoryCost,
        timeCost: ARGON2_DEFAULTS.timeCost,
        parallelism: ARGON2_DEFAULTS.parallelism,
        outputLength: 32,
      });

      // Decrypt the bundle
      const decrypted = decryptChaCha20Poly1305(
        derivedKey,
        fromBase64(result.encryptedBundle.encryptedBundle),
        fromBase64(result.encryptedBundle.nonce)
      );

      // Should match the signing private key
      expect(constantTimeEqual(decrypted, result.signingPrivateKey)).toBe(true);
    });

    test('generates valid UUID device ID', async () => {
      const result = await generateE2EKeys(baseInput);

      // UUID format check (rough)
      expect(result.device.deviceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    test('uses device name from input', async () => {
      const result = await generateE2EKeys(baseInput);
      expect(result.device.name).toBe('Test Device');
    });

    test('sets useSeparatePassphrase to false by default', async () => {
      const result = await generateE2EKeys(baseInput);
      expect(result.encryptedBundle.useSeparatePassphrase).toBe(false);
    });

    test('uses separate passphrase when specified', async () => {
      const result = await generateE2EKeys({
        ...baseInput,
        useSeparatePassphrase: true,
        bundlePassphrase: 'separate-bundle-passphrase-secure',
      });

      expect(result.encryptedBundle.useSeparatePassphrase).toBe(true);

      // Bundle should NOT decrypt with identity passphrase
      const wrongKey = await deriveKeyFromPassword({
        password: baseInput.passphrase,
        salt: fromBase64(result.encryptedBundle.salt),
        memoryCost: ARGON2_DEFAULTS.memoryCost,
        timeCost: ARGON2_DEFAULTS.timeCost,
        parallelism: ARGON2_DEFAULTS.parallelism,
        outputLength: 32,
      });

      expect(() =>
        decryptChaCha20Poly1305(
          wrongKey,
          fromBase64(result.encryptedBundle.encryptedBundle),
          fromBase64(result.encryptedBundle.nonce)
        )
      ).toThrow();

      // Bundle SHOULD decrypt with bundle passphrase
      const correctKey = await deriveKeyFromPassword({
        password: 'separate-bundle-passphrase-secure',
        salt: fromBase64(result.encryptedBundle.salt),
        memoryCost: ARGON2_DEFAULTS.memoryCost,
        timeCost: ARGON2_DEFAULTS.timeCost,
        parallelism: ARGON2_DEFAULTS.parallelism,
        outputLength: 32,
      });

      const decrypted = decryptChaCha20Poly1305(
        correctKey,
        fromBase64(result.encryptedBundle.encryptedBundle),
        fromBase64(result.encryptedBundle.nonce)
      );

      expect(constantTimeEqual(decrypted, result.signingPrivateKey)).toBe(true);
    });

    test('throws when separate passphrase requested but not provided', async () => {
      await expect(
        generateE2EKeys({
          ...baseInput,
          useSeparatePassphrase: true,
          bundlePassphrase: undefined,
        })
      ).rejects.toThrow(E2EKeyError);

      try {
        await generateE2EKeys({
          ...baseInput,
          useSeparatePassphrase: true,
          bundlePassphrase: undefined,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(E2EKeyError);
        expect((err as E2EKeyError).code).toBe('MISSING_BUNDLE_PASSPHRASE');
      }
    });

    test('generates unique keys each time', async () => {
      const result1 = await generateE2EKeys(baseInput);
      const result2 = await generateE2EKeys(baseInput);

      // Device IDs should be different
      expect(result1.device.deviceId).not.toBe(result2.device.deviceId);

      // Signing keys should be different
      expect(constantTimeEqual(result1.signingPrivateKey, result2.signingPrivateKey)).toBe(
        false
      );

      // Public keys should be different
      expect(result1.signingPublicKey).not.toBe(result2.signingPublicKey);
    });
  });

  describe('generateDeviceKeys', () => {
    test('generates valid X25519 key pair', () => {
      const result = generateDeviceKeys('Test Device');

      const publicKey = fromBase64(result.ecdhPublicKey);
      expect(publicKey.length).toBe(32);
      expect(result.privateKeys.ecdh.length).toBe(32);
    });

    test('generates valid ML-KEM-768 key pair for default profile', () => {
      const result = generateDeviceKeys('Test Device', 'default');

      const publicKey = fromBase64(result.kemPublicKey);
      expect(publicKey.length).toBe(1184);
      expect(result.privateKeys.kem.length).toBe(2400);
    });

    test('generates valid ML-KEM-1024 key pair for cnsa2 profile', () => {
      const result = generateDeviceKeys('Test Device', 'cnsa2');

      const publicKey = fromBase64(result.kemPublicKey);
      expect(publicKey.length).toBe(1568);
      expect(result.privateKeys.kem.length).toBe(3168);
    });

    test('generates valid UUID device ID', () => {
      const result = generateDeviceKeys('Test Device');

      expect(result.deviceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    test('uses provided device name', () => {
      const result = generateDeviceKeys('My iPhone');
      expect(result.name).toBe('My iPhone');
    });

    test('generates unique keys each time', () => {
      const result1 = generateDeviceKeys('Device');
      const result2 = generateDeviceKeys('Device');

      expect(result1.deviceId).not.toBe(result2.deviceId);
      expect(constantTimeEqual(result1.privateKeys.ecdh, result2.privateKeys.ecdh)).toBe(
        false
      );
    });
  });

  describe('decryptKeyBundle', () => {
    test('decrypts bundle encrypted by generateE2EKeys', async () => {
      const input: E2EInitInput = {
        identityId: 'test-id',
        passphrase: 'my-secure-passphrase-for-testing',
        deviceName: 'Test',
      };

      const generated = await generateE2EKeys(input);

      const decrypted = await decryptKeyBundle(
        generated.encryptedBundle,
        input.passphrase
      );

      expect(constantTimeEqual(decrypted.signingPrivateKey, generated.signingPrivateKey)).toBe(
        true
      );
    });

    test('throws on wrong passphrase', async () => {
      const input: E2EInitInput = {
        identityId: 'test-id',
        passphrase: 'correct-passphrase-here',
        deviceName: 'Test',
      };

      const generated = await generateE2EKeys(input);

      await expect(
        decryptKeyBundle(generated.encryptedBundle, 'wrong-passphrase')
      ).rejects.toThrow(E2EKeyError);

      try {
        await decryptKeyBundle(generated.encryptedBundle, 'wrong-passphrase');
      } catch (err) {
        expect(err).toBeInstanceOf(E2EKeyError);
        expect((err as E2EKeyError).code).toBe('DECRYPTION_FAILED');
      }
    });

    test('throws E2EKeyError on invalid bundle data', async () => {
      // Test that decrypting invalid bundle data throws E2EKeyError
      // The specific error code depends on which validation fails first
      await expect(
        decryptKeyBundle(
          {
            encryptedBundle: 'not-valid-base64!!!',
            salt: 'also-invalid!!!',
            nonce: 'invalid!!!',
          },
          'passphrase'
        )
      ).rejects.toThrow(E2EKeyError);
    });

    test('throws on invalid salt size', async () => {
      const input: E2EInitInput = {
        identityId: 'test-id',
        passphrase: 'test-passphrase',
        deviceName: 'Test',
      };

      const generated = await generateE2EKeys(input);

      // Replace salt with too-short salt (base64 of 4 bytes)
      await expect(
        decryptKeyBundle(
          {
            ...generated.encryptedBundle,
            salt: 'AQIDBA==', // 4 bytes
          },
          input.passphrase
        )
      ).rejects.toThrow(E2EKeyError);
    });

    test('throws on invalid nonce size', async () => {
      const input: E2EInitInput = {
        identityId: 'test-id',
        passphrase: 'test-passphrase',
        deviceName: 'Test',
      };

      const generated = await generateE2EKeys(input);

      // Replace nonce with wrong-size nonce (8 bytes instead of 12)
      await expect(
        decryptKeyBundle(
          {
            ...generated.encryptedBundle,
            nonce: 'AQIDBAUGBwg=', // 8 bytes
          },
          input.passphrase
        )
      ).rejects.toThrow(E2EKeyError);

      try {
        await decryptKeyBundle(
          {
            ...generated.encryptedBundle,
            nonce: 'AQIDBAUGBwg=',
          },
          input.passphrase
        );
      } catch (err) {
        expect(err).toBeInstanceOf(E2EKeyError);
        expect((err as E2EKeyError).code).toBe('INVALID_NONCE_SIZE');
      }
    });

    test('decrypted key is exactly 32 bytes (Ed25519)', async () => {
      const input: E2EInitInput = {
        identityId: 'test-id',
        passphrase: 'test-passphrase-secure',
        deviceName: 'Test',
      };

      const generated = await generateE2EKeys(input);
      const decrypted = await decryptKeyBundle(generated.encryptedBundle, input.passphrase);

      expect(decrypted.signingPrivateKey.length).toBe(32);
    });
  });

  describe('getDefaultDeviceName', () => {
    test('returns a string', () => {
      const name = getDefaultDeviceName();
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });
  });

  describe('E2EKeyError', () => {
    test('is instanceof Error', () => {
      const error = new E2EKeyError('test message', 'TEST_CODE');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(E2EKeyError);
    });

    test('has correct properties', () => {
      const error = new E2EKeyError('test message', 'TEST_CODE');
      expect(error.message).toBe('test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('E2EKeyError');
    });
  });
});
