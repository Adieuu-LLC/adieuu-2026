import { describe, expect, test } from 'bun:test';

import {
  generateE2EKeys,
  generateDeviceKeys,
  decryptKeyBundle,
  encryptKeyBundle,
  getDefaultDeviceName,
  E2EKeyError,
  type E2EInitInput,
  type DecryptedWebDevice,
} from './e2eKeyService';
import {
  fromBase64,
  toBase64,
  encryptChaCha20Poly1305,
  deriveKeyFromPassword,
  decryptChaCha20Poly1305,
  randomBytes,
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

    test('encrypts v2 bundle that can be raw-decrypted to JSON', async () => {
      const result = await generateE2EKeys(baseInput);

      const derivedKey = await deriveKeyFromPassword({
        password: baseInput.passphrase,
        salt: fromBase64(result.encryptedBundle.salt),
        memoryCost: ARGON2_DEFAULTS.memoryCost,
        timeCost: ARGON2_DEFAULTS.timeCost,
        parallelism: ARGON2_DEFAULTS.parallelism,
        outputLength: 32,
      });

      const decrypted = decryptChaCha20Poly1305(
        derivedKey,
        fromBase64(result.encryptedBundle.encryptedBundle),
        fromBase64(result.encryptedBundle.nonce)
      );

      // v2 bundle plaintext is JSON, not raw bytes
      const json = JSON.parse(new TextDecoder().decode(decrypted));
      expect(json.v).toBe(2);
      expect(typeof json.signingKey).toBe('string');
      expect(constantTimeEqual(fromBase64(json.signingKey), result.signingPrivateKey)).toBe(true);
      expect(json.webDevice).toBeDefined();
      expect(json.webDevice.deviceId).toBe(result.webDevice.deviceId);
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

      // Bundle SHOULD decrypt with bundle passphrase via decryptKeyBundle
      const decrypted = await decryptKeyBundle(result.encryptedBundle, 'separate-bundle-passphrase-secure');
      expect(constantTimeEqual(decrypted.signingPrivateKey, result.signingPrivateKey)).toBe(true);
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

    test('generates web device keys with valid UUID', async () => {
      const result = await generateE2EKeys(baseInput);

      expect(result.webDevice).toBeDefined();
      expect(result.webDevice.deviceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      // Web device ID is distinct from local device ID
      expect(result.webDevice.deviceId).not.toBe(result.device.deviceId);
    });

    test('generates valid web device ECDH key pair', async () => {
      const result = await generateE2EKeys(baseInput);

      const publicKey = fromBase64(result.webDevice.ecdhPublicKey);
      expect(publicKey.length).toBe(32);
      expect(result.webDevice.privateKeys.ecdh.length).toBe(32);
    });

    test('generates valid web device KEM key pair', async () => {
      const result = await generateE2EKeys(baseInput);

      const publicKey = fromBase64(result.webDevice.kemPublicKey);
      expect(publicKey.length).toBe(1184); // ML-KEM-768
      expect(result.webDevice.privateKeys.kem.length).toBe(2400);
    });

    test('web device keys are different from local device keys', async () => {
      const result = await generateE2EKeys(baseInput);

      expect(result.webDevice.ecdhPublicKey).not.toBe(result.device.ecdhPublicKey);
      expect(result.webDevice.kemPublicKey).not.toBe(result.device.kemPublicKey);
      expect(constantTimeEqual(result.webDevice.privateKeys.ecdh, result.devicePrivateKeys.ecdh)).toBe(false);
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
    async function buildBundleFromPlaintext(
      plaintext: Uint8Array,
      passphrase: string
    ): Promise<{ encryptedBundle: string; salt: string; nonce: string }> {
      const salt = randomBytes(16);
      const derivedKey = await deriveKeyFromPassword({
        password: passphrase,
        salt,
        memoryCost: ARGON2_DEFAULTS.memoryCost,
        timeCost: ARGON2_DEFAULTS.timeCost,
        parallelism: ARGON2_DEFAULTS.parallelism,
        outputLength: 32,
      });
      const { ciphertext, nonce } = encryptChaCha20Poly1305(derivedKey, plaintext);
      return {
        encryptedBundle: toBase64(ciphertext),
        salt: toBase64(salt),
        nonce: toBase64(nonce),
      };
    }

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

      try {
        await decryptKeyBundle(
          {
            ...generated.encryptedBundle,
            salt: 'AQIDBA==',
          },
          input.passphrase
        );
      } catch (err) {
        expect((err as E2EKeyError).code).toBe('INVALID_SALT_SIZE');
      }
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

    test('v2 round-trip: decryptKeyBundle returns webDevice from generateE2EKeys', async () => {
      const input: E2EInitInput = {
        identityId: 'test-id',
        passphrase: 'my-v2-round-trip-passphrase',
        deviceName: 'Test',
      };

      const generated = await generateE2EKeys(input);
      const decrypted = await decryptKeyBundle(generated.encryptedBundle, input.passphrase);

      expect(decrypted.webDevice).toBeDefined();
      const wd = decrypted.webDevice!;
      expect(wd.deviceId).toBe(generated.webDevice.deviceId);

      // Public keys from decrypted bundle must match what was generated
      expect(constantTimeEqual(wd.ecdhPublicKey, fromBase64(generated.webDevice.ecdhPublicKey))).toBe(true);
      expect(constantTimeEqual(wd.kemPublicKey, fromBase64(generated.webDevice.kemPublicKey))).toBe(true);

      // Private keys must also round-trip
      expect(wd.ecdhPrivateKey.length).toBe(32);
      expect(wd.kemPrivateKey.length).toBeGreaterThan(0);
    });

    test('v1 backward compatibility: raw 32-byte plaintext returns signing key only', async () => {
      // Manually create a v1 bundle (raw 32-byte Ed25519 key)
      const passphrase = 'v1-compat-passphrase';
      const signingKey = randomBytes(32);
      const salt = randomBytes(16);

      const derivedKey = await deriveKeyFromPassword({
        password: passphrase,
        salt,
        memoryCost: ARGON2_DEFAULTS.memoryCost,
        timeCost: ARGON2_DEFAULTS.timeCost,
        parallelism: ARGON2_DEFAULTS.parallelism,
        outputLength: 32,
      });

      const { ciphertext, nonce } = encryptChaCha20Poly1305(derivedKey, signingKey);

      const v1Bundle = {
        encryptedBundle: toBase64(ciphertext),
        salt: toBase64(salt),
        nonce: toBase64(nonce),
      };

      const decrypted = await decryptKeyBundle(v1Bundle, passphrase);

      expect(constantTimeEqual(decrypted.signingPrivateKey, signingKey)).toBe(true);
      expect(decrypted.webDevice).toBeUndefined();
    });

    test('v2 decrypted web device public keys match generated values', async () => {
      const input: E2EInitInput = {
        identityId: 'pub-key-match-test',
        passphrase: 'pub-key-match-passphrase-long',
        deviceName: 'Test',
      };

      const generated = await generateE2EKeys(input);
      const decrypted = await decryptKeyBundle(generated.encryptedBundle, input.passphrase);

      expect(decrypted.webDevice).toBeDefined();
      const wd = decrypted.webDevice as DecryptedWebDevice;

      // ECDH public key: 32 bytes (X25519)
      expect(wd.ecdhPublicKey.length).toBe(32);
      // KEM public key: 1184 bytes (ML-KEM-768 default)
      expect(wd.kemPublicKey.length).toBe(1184);

      // They should match the public keys returned from generateE2EKeys
      expect(toBase64(wd.ecdhPublicKey)).toBe(generated.webDevice.ecdhPublicKey);
      expect(toBase64(wd.kemPublicKey)).toBe(generated.webDevice.kemPublicKey);
    });

    test('throws INVALID_BUNDLE_FORMAT when decrypted v2 plaintext is non-JSON', async () => {
      const passphrase = 'invalid-json-passphrase';
      const bundle = await buildBundleFromPlaintext(
        new TextEncoder().encode('not-json'),
        passphrase
      );

      await expect(decryptKeyBundle(bundle, passphrase)).rejects.toMatchObject({
        code: 'INVALID_BUNDLE_FORMAT',
      });
    });

    test('throws UNSUPPORTED_BUNDLE_VERSION when decrypted JSON has unsupported version', async () => {
      const passphrase = 'unsupported-version-passphrase';
      const bundle = await buildBundleFromPlaintext(
        new TextEncoder().encode(
          JSON.stringify({
            v: 3,
            signingKey: toBase64(randomBytes(32)),
          })
        ),
        passphrase
      );

      await expect(decryptKeyBundle(bundle, passphrase)).rejects.toMatchObject({
        code: 'UNSUPPORTED_BUNDLE_VERSION',
      });
    });

    test('throws INVALID_KEY_SIZE when v2 signing key length is not 32 bytes', async () => {
      const passphrase = 'invalid-signing-key-size';
      const bundle = await buildBundleFromPlaintext(
        new TextEncoder().encode(
          JSON.stringify({
            v: 2,
            signingKey: toBase64(randomBytes(16)),
          })
        ),
        passphrase
      );

      await expect(decryptKeyBundle(bundle, passphrase)).rejects.toMatchObject({
        code: 'INVALID_KEY_SIZE',
      });
    });
  });

  describe('encryptKeyBundle (passphrase change flow)', () => {
    const originalPassphrase = 'original-passphrase-secure';
    const newPassphrase = 'new-passphrase-also-secure';

    test('re-encrypted bundle decrypts with new passphrase', async () => {
      const input: E2EInitInput = {
        identityId: 'test-reencrypt',
        passphrase: originalPassphrase,
        deviceName: 'Test',
      };

      const generated = await generateE2EKeys(input);
      const decrypted = await decryptKeyBundle(generated.encryptedBundle, originalPassphrase);
      const reEncrypted = await encryptKeyBundle(decrypted, newPassphrase);
      const decryptedAgain = await decryptKeyBundle(reEncrypted, newPassphrase);

      expect(constantTimeEqual(decryptedAgain.signingPrivateKey, generated.signingPrivateKey)).toBe(true);
    });

    test('re-encrypted bundle does NOT decrypt with old passphrase', async () => {
      const input: E2EInitInput = {
        identityId: 'test-reencrypt-fail',
        passphrase: originalPassphrase,
        deviceName: 'Test',
      };

      const generated = await generateE2EKeys(input);
      const decrypted = await decryptKeyBundle(generated.encryptedBundle, originalPassphrase);
      const reEncrypted = await encryptKeyBundle(decrypted, newPassphrase);

      await expect(
        decryptKeyBundle(reEncrypted, originalPassphrase)
      ).rejects.toThrow(E2EKeyError);
    });

    test('v2 web device keys survive re-encryption round-trip', async () => {
      const input: E2EInitInput = {
        identityId: 'test-reencrypt-v2',
        passphrase: originalPassphrase,
        deviceName: 'Test',
      };

      const generated = await generateE2EKeys(input);
      const decrypted = await decryptKeyBundle(generated.encryptedBundle, originalPassphrase);

      expect(decrypted.webDevice).toBeDefined();

      const reEncrypted = await encryptKeyBundle(decrypted, newPassphrase);
      const decryptedAgain = await decryptKeyBundle(reEncrypted, newPassphrase);

      expect(decryptedAgain.webDevice).toBeDefined();
      expect(decryptedAgain.webDevice!.deviceId).toBe(decrypted.webDevice!.deviceId);
      expect(constantTimeEqual(
        decryptedAgain.webDevice!.ecdhPrivateKey,
        decrypted.webDevice!.ecdhPrivateKey
      )).toBe(true);
      expect(constantTimeEqual(
        decryptedAgain.webDevice!.kemPrivateKey,
        decrypted.webDevice!.kemPrivateKey
      )).toBe(true);
    });

    test('multiple sequential passphrase changes preserve data', async () => {
      const input: E2EInitInput = {
        identityId: 'test-multi-change',
        passphrase: 'passphrase-one-initial',
        deviceName: 'Test',
      };

      const generated = await generateE2EKeys(input);
      const originalKey = new Uint8Array(generated.signingPrivateKey);

      let currentBundle = generated.encryptedBundle;
      let currentPass = input.passphrase;
      const passphrases = [
        'passphrase-two-changed',
        'passphrase-three-changed',
        'passphrase-four-final',
      ];

      for (const nextPass of passphrases) {
        const decrypted = await decryptKeyBundle(currentBundle, currentPass);
        const reEncrypted = await encryptKeyBundle(decrypted, nextPass);
        currentBundle = reEncrypted;
        currentPass = nextPass;
      }

      const finalDecrypted = await decryptKeyBundle(currentBundle, currentPass);
      expect(constantTimeEqual(finalDecrypted.signingPrivateKey, originalKey)).toBe(true);
    });

    test('re-encrypted bundle has fresh salt and nonce', async () => {
      const input: E2EInitInput = {
        identityId: 'test-fresh-salt',
        passphrase: originalPassphrase,
        deviceName: 'Test',
      };

      const generated = await generateE2EKeys(input);
      const decrypted = await decryptKeyBundle(generated.encryptedBundle, originalPassphrase);
      const reEncrypted = await encryptKeyBundle(decrypted, newPassphrase);

      expect(reEncrypted.salt).not.toBe(generated.encryptedBundle.salt);
      expect(reEncrypted.nonce).not.toBe(generated.encryptedBundle.nonce);
    });

    test('v1 bundle re-encryption preserves signing key', async () => {
      const passphrase = 'v1-reencrypt-test-pass';
      const signingKey = randomBytes(32);
      const salt = randomBytes(16);

      const derivedKey = await deriveKeyFromPassword({
        password: passphrase,
        salt,
        memoryCost: ARGON2_DEFAULTS.memoryCost,
        timeCost: ARGON2_DEFAULTS.timeCost,
        parallelism: ARGON2_DEFAULTS.parallelism,
        outputLength: 32,
      });

      const { ciphertext, nonce } = encryptChaCha20Poly1305(derivedKey, signingKey);

      const v1Bundle = {
        encryptedBundle: toBase64(ciphertext),
        salt: toBase64(salt),
        nonce: toBase64(nonce),
      };

      const decrypted = await decryptKeyBundle(v1Bundle, passphrase);
      expect(decrypted.webDevice).toBeUndefined();

      const reEncrypted = await encryptKeyBundle(decrypted, newPassphrase);
      const decryptedAgain = await decryptKeyBundle(reEncrypted, newPassphrase);

      expect(constantTimeEqual(decryptedAgain.signingPrivateKey, signingKey)).toBe(true);
      expect(decryptedAgain.webDevice).toBeUndefined();
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
