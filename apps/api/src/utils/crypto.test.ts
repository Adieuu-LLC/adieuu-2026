import { afterAll, describe, expect, test, mock } from 'bun:test';

mock.module('../config', () => ({
  config: {
    security: {
      otpSecret: 'test-otp-secret-for-testing',
      sessionSecret: 'test-session-secret-for-testing',
    },
  },
}));

import {
  hashOtp,
  hashIdentifier,
  hashIp,
  constantTimeCompare,
  hmacSign,
  hmacVerify,
  encrypt,
  decrypt,
  verifyDmMessageSignature,
} from './crypto';

describe('crypto utilities (security-critical)', () => {
  afterAll(() => {
    mock.restore();
  });

  describe('hashOtp', () => {
    test('binds hash to identifier', () => {
      const hashA = hashOtp('123456', 'user@example.com');
      const hashB = hashOtp('123456', 'other@example.com');
      expect(hashA).not.toBe(hashB);
    });

    test('is deterministic for same otp and identifier', () => {
      expect(hashOtp('123456', 'user@example.com')).toBe(
        hashOtp('123456', 'user@example.com')
      );
    });
  });

  describe('hashIdentifier and hashIp', () => {
    test('hashIdentifier does not contain raw identifier', () => {
      const identifier = 'user@example.com';
      const hash = hashIdentifier(identifier);
      expect(hash).toHaveLength(64);
      expect(hash).not.toContain('@');
      expect(hash).not.toContain('user');
    });

    test('hashIp is deterministic and hides raw ip', () => {
      const hash = hashIp('192.168.1.1');
      expect(hash).toHaveLength(64);
      expect(hash).not.toContain('192');
      expect(hashIp('192.168.1.1')).toBe(hash);
    });
  });

  describe('constantTimeCompare', () => {
    test('returns true for equal strings', () => {
      expect(constantTimeCompare('abc', 'abc')).toBe(true);
    });

    test('returns false for different strings of same length', () => {
      expect(constantTimeCompare('abc', 'abd')).toBe(false);
    });

    test('returns false for different lengths without throwing', () => {
      expect(constantTimeCompare('abc', 'abcd')).toBe(false);
    });
  });

  describe('hmacSign and hmacVerify', () => {
    test('round-trips valid signatures', () => {
      const data = 'user@example.com:123456';
      const signature = hmacSign(data);
      expect(hmacVerify(data, signature)).toBe(true);
    });

    test('rejects tampered data', () => {
      const signature = hmacSign('original-data');
      expect(hmacVerify('tampered-data', signature)).toBe(false);
    });

    test('rejects tampered signature', () => {
      const signature = hmacSign('data');
      const tampered = signature.slice(0, -1) + (signature.endsWith('a') ? 'b' : 'a');
      expect(hmacVerify('data', tampered)).toBe(false);
    });
  });

  describe('encrypt and decrypt', () => {
    test('round-trips plaintext', () => {
      const plaintext = 'user@example.com:123456';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    test('returns null for tampered ciphertext', () => {
      const encrypted = encrypt('secret');
      const tampered = encrypted.slice(0, -4) + 'XXXX';
      expect(decrypt(tampered)).toBeNull();
    });

    test('returns null for invalid base64 payload', () => {
      expect(decrypt('not-valid')).toBeNull();
    });
  });

  describe('verifyDmMessageSignature', () => {
    test('accepts valid Ed25519 signature', async () => {
      const { generateSigningKeyPair, sign, toBase64, concatBytes, toBytes, fromBase64 } =
        await import('@adieuu/crypto');
      const { publicKey, privateKey } = generateSigningKeyPair();
      const ciphertext = Buffer.from('cipher').toString('base64');
      const nonce = Buffer.from('nonce').toString('base64');
      const wrappedKeys = [{ deviceId: 'dev1', wrappedKey: 'key' }];
      const signatureData = concatBytes(
        fromBase64(ciphertext),
        fromBase64(nonce),
        toBytes(JSON.stringify(wrappedKeys))
      );
      const signature = sign(privateKey, signatureData);

      expect(
        verifyDmMessageSignature(
          toBase64(publicKey),
          ciphertext,
          nonce,
          wrappedKeys,
          toBase64(signature)
        )
      ).toBe(true);
    });

    test('rejects invalid signature', async () => {
      const { generateSigningKeyPair, sign, toBase64, concatBytes, toBytes, fromBase64 } =
        await import('@adieuu/crypto');
      const { publicKey, privateKey } = generateSigningKeyPair();
      const ciphertext = Buffer.from('cipher').toString('base64');
      const nonce = Buffer.from('nonce').toString('base64');
      const wrappedKeys: unknown[] = [];
      const signatureData = concatBytes(
        fromBase64(ciphertext),
        fromBase64(nonce),
        toBytes(JSON.stringify(wrappedKeys))
      );
      const signature = sign(privateKey, signatureData);
      const { publicKey: wrongPublicKey } = generateSigningKeyPair();

      expect(
        verifyDmMessageSignature(
          toBase64(wrongPublicKey),
          ciphertext,
          nonce,
          wrappedKeys,
          toBase64(signature)
        )
      ).toBe(false);
    });

    test('rejects malformed base64 inputs', () => {
      expect(
        verifyDmMessageSignature('!!!', 'cipher', 'nonce', [], 'signature')
      ).toBe(false);
    });
  });
});
