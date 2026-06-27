import { describe, expect, test } from 'bun:test';

import {
  encryptChaCha20Poly1305,
  decryptChaCha20Poly1305,
  encryptAES256GCM,
  decryptAES256GCM,
  encrypt,
  decrypt,
  CHACHA_NONCE_SIZE,
  AES_GCM_NONCE_SIZE,
  SYMMETRIC_KEY_SIZE,
  AUTH_TAG_SIZE,
} from './symmetric';
import { randomBytes, constantTimeEqual, toBytes } from '../utils';

describe('encrypt/symmetric', () => {
  describe('constants', () => {
    test('CHACHA_NONCE_SIZE is 12', () => {
      expect(CHACHA_NONCE_SIZE).toBe(12);
    });

    test('AES_GCM_NONCE_SIZE is 12', () => {
      expect(AES_GCM_NONCE_SIZE).toBe(12);
    });

    test('SYMMETRIC_KEY_SIZE is 32', () => {
      expect(SYMMETRIC_KEY_SIZE).toBe(32);
    });

    test('AUTH_TAG_SIZE is 16', () => {
      expect(AUTH_TAG_SIZE).toBe(16);
    });
  });

  describe('encryptChaCha20Poly1305', () => {
    test('encrypts and produces ciphertext', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello, World!');
      const result = encryptChaCha20Poly1305(key, plaintext);

      expect(result.ciphertext).toBeInstanceOf(Uint8Array);
      expect(result.nonce).toBeInstanceOf(Uint8Array);
      expect(result.nonce.length).toBe(12);
    });

    test('ciphertext includes auth tag', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const result = encryptChaCha20Poly1305(key, plaintext);

      // Ciphertext should be plaintext length + auth tag (16 bytes)
      expect(result.ciphertext.length).toBe(plaintext.length + AUTH_TAG_SIZE);
    });

    test('produces different ciphertext for same plaintext (random nonce)', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const result1 = encryptChaCha20Poly1305(key, plaintext);
      const result2 = encryptChaCha20Poly1305(key, plaintext);

      expect(constantTimeEqual(result1.ciphertext, result2.ciphertext)).toBe(false);
      expect(constantTimeEqual(result1.nonce, result2.nonce)).toBe(false);
    });

    test('produces same ciphertext with same nonce', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const nonce = randomBytes(12);
      const result1 = encryptChaCha20Poly1305(key, plaintext, nonce);
      const result2 = encryptChaCha20Poly1305(key, plaintext, nonce);

      expect(constantTimeEqual(result1.ciphertext, result2.ciphertext)).toBe(true);
    });

    test('handles empty plaintext', () => {
      const key = randomBytes(32);
      const plaintext = new Uint8Array(0);
      const result = encryptChaCha20Poly1305(key, plaintext);

      expect(result.ciphertext.length).toBe(AUTH_TAG_SIZE);
    });

    test('handles large plaintext', () => {
      const key = randomBytes(32);
      const plaintext = randomBytes(100000);
      const result = encryptChaCha20Poly1305(key, plaintext);

      expect(result.ciphertext.length).toBe(plaintext.length + AUTH_TAG_SIZE);
    });

    test('throws on invalid key size', () => {
      const shortKey = randomBytes(16);
      const plaintext = toBytes('Hello');

      expect(() => encryptChaCha20Poly1305(shortKey, plaintext)).toThrow(
        'Key must be 32 bytes, got 16'
      );
    });

    test('throws on invalid nonce size', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const shortNonce = randomBytes(8);

      expect(() => encryptChaCha20Poly1305(key, plaintext, shortNonce)).toThrow(
        'Nonce must be 12 bytes, got 8'
      );
    });

    test('accepts associated data', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const aad = toBytes('additional-context');
      const result = encryptChaCha20Poly1305(key, plaintext, undefined, aad);

      expect(result.ciphertext).toBeDefined();
    });
  });

  describe('decryptChaCha20Poly1305', () => {
    test('decrypts to original plaintext', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello, World!');
      const { ciphertext, nonce } = encryptChaCha20Poly1305(key, plaintext);

      const decrypted = decryptChaCha20Poly1305(key, ciphertext, nonce);
      expect(constantTimeEqual(decrypted, plaintext)).toBe(true);
    });

    test('decrypts empty plaintext', () => {
      const key = randomBytes(32);
      const plaintext = new Uint8Array(0);
      const { ciphertext, nonce } = encryptChaCha20Poly1305(key, plaintext);

      const decrypted = decryptChaCha20Poly1305(key, ciphertext, nonce);
      expect(decrypted.length).toBe(0);
    });

    test('decrypts large plaintext', () => {
      const key = randomBytes(32);
      const plaintext = randomBytes(100000);
      const { ciphertext, nonce } = encryptChaCha20Poly1305(key, plaintext);

      const decrypted = decryptChaCha20Poly1305(key, ciphertext, nonce);
      expect(constantTimeEqual(decrypted, plaintext)).toBe(true);
    });

    test('throws on wrong key', () => {
      const key1 = randomBytes(32);
      const key2 = randomBytes(32);
      const plaintext = toBytes('Hello');
      const { ciphertext, nonce } = encryptChaCha20Poly1305(key1, plaintext);

      expect(() => decryptChaCha20Poly1305(key2, ciphertext, nonce)).toThrow();
    });

    test('throws on wrong nonce', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const { ciphertext } = encryptChaCha20Poly1305(key, plaintext);
      const wrongNonce = randomBytes(12);

      expect(() => decryptChaCha20Poly1305(key, ciphertext, wrongNonce)).toThrow();
    });

    test('throws on tampered ciphertext', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const { ciphertext, nonce } = encryptChaCha20Poly1305(key, plaintext);

      // Tamper with ciphertext
      const tampered = new Uint8Array(ciphertext);
      tampered[0] = (tampered[0]! + 1) % 256;

      expect(() => decryptChaCha20Poly1305(key, tampered, nonce)).toThrow();
    });

    test('throws on truncated ciphertext', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const { ciphertext, nonce } = encryptChaCha20Poly1305(key, plaintext);

      const truncated = ciphertext.slice(0, 10);
      expect(() => decryptChaCha20Poly1305(key, truncated, nonce)).toThrow(
        'Ciphertext too short'
      );
    });

    test('throws on invalid key size', () => {
      const shortKey = randomBytes(16);
      const ciphertext = randomBytes(32);
      const nonce = randomBytes(12);

      expect(() => decryptChaCha20Poly1305(shortKey, ciphertext, nonce)).toThrow(
        'Key must be 32 bytes'
      );
    });

    test('throws on invalid nonce size', () => {
      const key = randomBytes(32);
      const ciphertext = randomBytes(32);
      const shortNonce = randomBytes(8);

      expect(() => decryptChaCha20Poly1305(key, ciphertext, shortNonce)).toThrow(
        'Nonce must be 12 bytes'
      );
    });

    test('verifies associated data', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const aad = toBytes('context');
      const { ciphertext, nonce } = encryptChaCha20Poly1305(key, plaintext, undefined, aad);

      // Correct AAD
      const decrypted = decryptChaCha20Poly1305(key, ciphertext, nonce, aad);
      expect(constantTimeEqual(decrypted, plaintext)).toBe(true);

      // Wrong AAD
      const wrongAad = toBytes('wrong-context');
      expect(() => decryptChaCha20Poly1305(key, ciphertext, nonce, wrongAad)).toThrow();

      // Missing AAD
      expect(() => decryptChaCha20Poly1305(key, ciphertext, nonce)).toThrow();
    });
  });

  describe('encryptAES256GCM', () => {
    test('encrypts and produces ciphertext', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello, World!');
      const result = encryptAES256GCM(key, plaintext);

      expect(result.ciphertext).toBeInstanceOf(Uint8Array);
      expect(result.nonce).toBeInstanceOf(Uint8Array);
      expect(result.nonce.length).toBe(12);
    });

    test('ciphertext includes auth tag', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const result = encryptAES256GCM(key, plaintext);

      expect(result.ciphertext.length).toBe(plaintext.length + AUTH_TAG_SIZE);
    });

    test('produces different ciphertext with random nonce', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const result1 = encryptAES256GCM(key, plaintext);
      const result2 = encryptAES256GCM(key, plaintext);

      expect(constantTimeEqual(result1.ciphertext, result2.ciphertext)).toBe(false);
    });

    test('handles empty plaintext', () => {
      const key = randomBytes(32);
      const plaintext = new Uint8Array(0);
      const result = encryptAES256GCM(key, plaintext);

      expect(result.ciphertext.length).toBe(AUTH_TAG_SIZE);
    });

    test('throws on invalid key size', () => {
      const shortKey = randomBytes(16);
      const plaintext = toBytes('Hello');

      expect(() => encryptAES256GCM(shortKey, plaintext)).toThrow('Key must be 32 bytes');
    });

    test('throws on invalid nonce size', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const shortNonce = randomBytes(8);

      expect(() => encryptAES256GCM(key, plaintext, shortNonce)).toThrow(
        'Nonce must be 12 bytes'
      );
    });
  });

  describe('decryptAES256GCM', () => {
    test('decrypts to original plaintext', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello, World!');
      const { ciphertext, nonce } = encryptAES256GCM(key, plaintext);

      const decrypted = decryptAES256GCM(key, ciphertext, nonce);
      expect(constantTimeEqual(decrypted, plaintext)).toBe(true);
    });

    test('decrypts empty plaintext', () => {
      const key = randomBytes(32);
      const plaintext = new Uint8Array(0);
      const { ciphertext, nonce } = encryptAES256GCM(key, plaintext);

      const decrypted = decryptAES256GCM(key, ciphertext, nonce);
      expect(decrypted.length).toBe(0);
    });

    test('throws on wrong key', () => {
      const key1 = randomBytes(32);
      const key2 = randomBytes(32);
      const plaintext = toBytes('Hello');
      const { ciphertext, nonce } = encryptAES256GCM(key1, plaintext);

      expect(() => decryptAES256GCM(key2, ciphertext, nonce)).toThrow();
    });

    test('throws on tampered ciphertext', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const { ciphertext, nonce } = encryptAES256GCM(key, plaintext);

      const tampered = new Uint8Array(ciphertext);
      tampered[0] = (tampered[0]! + 1) % 256;

      expect(() => decryptAES256GCM(key, tampered, nonce)).toThrow();
    });

    test('throws on truncated ciphertext', () => {
      const key = randomBytes(32);
      const ciphertext = randomBytes(10);
      const nonce = randomBytes(12);

      expect(() => decryptAES256GCM(key, ciphertext, nonce)).toThrow('Ciphertext too short');
    });

    test('throws on invalid key size', () => {
      const shortKey = randomBytes(16);
      const ciphertext = randomBytes(32);
      const nonce = randomBytes(12);

      expect(() => decryptAES256GCM(shortKey, ciphertext, nonce)).toThrow('Key must be 32 bytes');
    });

    test('throws on invalid nonce size', () => {
      const key = randomBytes(32);
      const ciphertext = randomBytes(32);
      const shortNonce = randomBytes(8);

      expect(() => decryptAES256GCM(key, ciphertext, shortNonce)).toThrow('Nonce must be 12 bytes');
    });

    test('verifies associated data', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const aad = toBytes('context');
      const { ciphertext, nonce } = encryptAES256GCM(key, plaintext, undefined, aad);

      // Correct AAD
      const decrypted = decryptAES256GCM(key, ciphertext, nonce, aad);
      expect(constantTimeEqual(decrypted, plaintext)).toBe(true);

      // Wrong AAD
      const wrongAad = toBytes('wrong');
      expect(() => decryptAES256GCM(key, ciphertext, nonce, wrongAad)).toThrow();
    });
  });

  describe('profile-aware encrypt/decrypt', () => {
    test('default profile uses ChaCha20-Poly1305', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');

      const { ciphertext, nonce } = encrypt(key, plaintext, 'default');
      const decrypted = decrypt(key, ciphertext, nonce, 'default');

      expect(constantTimeEqual(decrypted, plaintext)).toBe(true);
    });

    test('cnsa2 profile uses AES-256-GCM', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');

      const { ciphertext, nonce } = encrypt(key, plaintext, 'cnsa2');
      const decrypted = decrypt(key, ciphertext, nonce, 'cnsa2');

      expect(constantTimeEqual(decrypted, plaintext)).toBe(true);
    });

    test('default profile is used when not specified', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');

      const { ciphertext, nonce } = encrypt(key, plaintext);
      const decrypted = decrypt(key, ciphertext, nonce);

      expect(constantTimeEqual(decrypted, plaintext)).toBe(true);
    });

    test('profiles are not interchangeable', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');

      // Encrypt with one profile, try to decrypt with other
      const { ciphertext, nonce } = encrypt(key, plaintext, 'default');

      // This may or may not throw depending on whether the ciphertext
      // happens to be valid AES-GCM, but the plaintext should be wrong
      try {
        const decrypted = decrypt(key, ciphertext, nonce, 'cnsa2');
        // If it doesn't throw, the plaintext should be different
        expect(constantTimeEqual(decrypted, plaintext)).toBe(false);
      } catch {
        // Expected - authentication failed
        expect(true).toBe(true);
      }
    });

    test('encrypt accepts associated data', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const aad = toBytes('context');

      const { ciphertext, nonce } = encrypt(key, plaintext, 'default', undefined, aad);
      const decrypted = decrypt(key, ciphertext, nonce, 'default', aad);

      expect(constantTimeEqual(decrypted, plaintext)).toBe(true);
    });

    test('encrypt accepts custom nonce', () => {
      const key = randomBytes(32);
      const plaintext = toBytes('Hello');
      const customNonce = randomBytes(12);

      const { nonce } = encrypt(key, plaintext, 'default', customNonce);
      expect(constantTimeEqual(nonce, customNonce)).toBe(true);
    });
  });

  describe('cross-algorithm compatibility', () => {
    test('roundtrip many messages', () => {
      const key = randomBytes(32);

      for (let i = 0; i < 100; i++) {
        const plaintext = randomBytes(Math.floor(Math.random() * 1000));
        const { ciphertext, nonce } = encryptChaCha20Poly1305(key, plaintext);
        const decrypted = decryptChaCha20Poly1305(key, ciphertext, nonce);
        expect(constantTimeEqual(decrypted, plaintext)).toBe(true);
      }
    });

    test('different keys produce different ciphertext', () => {
      const key1 = randomBytes(32);
      const key2 = randomBytes(32);
      const plaintext = toBytes('Hello');
      const nonce = randomBytes(12);

      const result1 = encryptChaCha20Poly1305(key1, plaintext, nonce);
      const result2 = encryptChaCha20Poly1305(key2, plaintext, nonce);

      expect(constantTimeEqual(result1.ciphertext, result2.ciphertext)).toBe(false);
    });
  });
});
