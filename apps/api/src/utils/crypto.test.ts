import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';

// Mock the config module before importing crypto functions
mock.module('../config', () => ({
  config: {
    security: {
      otpSecret: 'test-otp-secret-for-testing',
      sessionSecret: 'test-session-secret-for-testing',
    },
  },
}));

import {
  generateOtp,
  generateSessionId,
  generateSecureToken,
  hashOtp,
  hashIdentifier,
  hashIp,
  constantTimeCompare,
  base64UrlToBuffer,
  hmacSign,
  hmacVerify,
  encrypt,
  decrypt,
  deriveBundleId,
  verifyDmMessageSignature,
} from './crypto';

describe('crypto utilities', () => {
  describe('generateOtp', () => {
    test('generates a 6-digit OTP by default', () => {
      const otp = generateOtp();
      expect(otp).toMatch(/^\d{6}$/);
      expect(otp.length).toBe(6);
    });

    test('generates OTP with custom length', () => {
      const otp4 = generateOtp(4);
      expect(otp4).toMatch(/^\d{4}$/);
      expect(otp4.length).toBe(4);

      const otp8 = generateOtp(8);
      expect(otp8).toMatch(/^\d{8}$/);
      expect(otp8.length).toBe(8);
    });

    test('generates OTP with length 1', () => {
      const otp = generateOtp(1);
      expect(otp).toMatch(/^\d{1}$/);
      expect(otp.length).toBe(1);
    });

    test('pads with leading zeros when needed', () => {
      // Generate many OTPs and check they all have correct length
      const otps = Array.from({ length: 100 }, () => generateOtp(6));
      for (const otp of otps) {
        expect(otp.length).toBe(6);
      }
    });

    test('generates different OTPs on consecutive calls', () => {
      const otps = new Set<string>();
      for (let i = 0; i < 100; i++) {
        otps.add(generateOtp());
      }
      // Should have at least 90 unique values (allowing for some collisions)
      expect(otps.size).toBeGreaterThan(90);
    });

    test('handles length 0 gracefully', () => {
      const otp = generateOtp(0);
      // With length 0, max = 10^0 = 1, so value % 1 = 0, padStart(0, '0') = ''
      // But toString() of 0 is '0', so we get '0' (single char before padStart takes effect)
      expect(otp).toBe('0');
    });
  });

  describe('generateSessionId', () => {
    test('generates a base64url-encoded session ID', () => {
      const sessionId = generateSessionId();
      // Base64url: a-z, A-Z, 0-9, -, _
      expect(sessionId).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    test('generates a session ID of expected length', () => {
      const sessionId = generateSessionId();
      // 32 bytes = 256 bits, base64 encoded without padding = ~43 chars
      expect(sessionId.length).toBeGreaterThanOrEqual(42);
      expect(sessionId.length).toBeLessThanOrEqual(44);
    });

    test('generates unique session IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId());
      }
      expect(ids.size).toBe(100);
    });

    test('does not contain standard base64 characters +, /, or =', () => {
      for (let i = 0; i < 50; i++) {
        const sessionId = generateSessionId();
        expect(sessionId).not.toContain('+');
        expect(sessionId).not.toContain('/');
        expect(sessionId).not.toContain('=');
      }
    });
  });

  describe('generateSecureToken', () => {
    test('generates a 32-byte token by default', () => {
      const token = generateSecureToken();
      // 32 bytes = ~43 base64url chars
      expect(token.length).toBeGreaterThanOrEqual(42);
      expect(token.length).toBeLessThanOrEqual(44);
    });

    test('generates token with custom byte length', () => {
      const token16 = generateSecureToken(16);
      // 16 bytes = ~22 base64url chars
      expect(token16.length).toBeGreaterThanOrEqual(21);
      expect(token16.length).toBeLessThanOrEqual(22);

      const token64 = generateSecureToken(64);
      // 64 bytes = ~86 base64url chars
      expect(token64.length).toBeGreaterThanOrEqual(85);
      expect(token64.length).toBeLessThanOrEqual(86);
    });

    test('generates base64url-encoded output', () => {
      const token = generateSecureToken();
      expect(token).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    test('generates unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateSecureToken());
      }
      expect(tokens.size).toBe(100);
    });

    test('handles 1 byte', () => {
      const token = generateSecureToken(1);
      expect(token.length).toBeGreaterThanOrEqual(1);
      expect(token.length).toBeLessThanOrEqual(2);
    });
  });

  describe('hashOtp', () => {
    test('returns a 64-character hex string (SHA-256)', () => {
      const hash = hashOtp('123456', 'user@example.com');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('produces consistent hashes for same input', () => {
      const hash1 = hashOtp('123456', 'user@example.com');
      const hash2 = hashOtp('123456', 'user@example.com');
      expect(hash1).toBe(hash2);
    });

    test('produces different hashes for different OTPs', () => {
      const hash1 = hashOtp('123456', 'user@example.com');
      const hash2 = hashOtp('654321', 'user@example.com');
      expect(hash1).not.toBe(hash2);
    });

    test('produces different hashes for different identifiers', () => {
      const hash1 = hashOtp('123456', 'user1@example.com');
      const hash2 = hashOtp('123456', 'user2@example.com');
      expect(hash1).not.toBe(hash2);
    });

    test('handles empty OTP', () => {
      const hash = hashOtp('', 'user@example.com');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('handles empty identifier', () => {
      const hash = hashOtp('123456', '');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('handles special characters in identifier', () => {
      const hash = hashOtp('123456', 'user+tag@example.com');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('hashIdentifier', () => {
    test('returns a 64-character hex string (SHA-256)', () => {
      const hash = hashIdentifier('user@example.com');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('produces consistent hashes for same input', () => {
      const hash1 = hashIdentifier('user@example.com');
      const hash2 = hashIdentifier('user@example.com');
      expect(hash1).toBe(hash2);
    });

    test('produces different hashes for different identifiers', () => {
      const hash1 = hashIdentifier('user1@example.com');
      const hash2 = hashIdentifier('user2@example.com');
      expect(hash1).not.toBe(hash2);
    });

    test('handles phone numbers', () => {
      const hash = hashIdentifier('+15551234567');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('handles empty string', () => {
      const hash = hashIdentifier('');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('handles unicode characters', () => {
      const hash = hashIdentifier('user@example.com');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('hashIp', () => {
    test('returns a 64-character hex string (SHA-256)', () => {
      const hash = hashIp('192.168.1.1');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('produces consistent hashes for same IP', () => {
      const hash1 = hashIp('192.168.1.1');
      const hash2 = hashIp('192.168.1.1');
      expect(hash1).toBe(hash2);
    });

    test('produces different hashes for different IPs', () => {
      const hash1 = hashIp('192.168.1.1');
      const hash2 = hashIp('192.168.1.2');
      expect(hash1).not.toBe(hash2);
    });

    test('handles IPv6 addresses', () => {
      const hash = hashIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('handles localhost', () => {
      const hash = hashIp('127.0.0.1');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('handles empty string', () => {
      const hash = hashIp('');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('constantTimeCompare', () => {
    test('returns true for equal strings', () => {
      expect(constantTimeCompare('abc', 'abc')).toBe(true);
      expect(constantTimeCompare('', '')).toBe(true);
      expect(constantTimeCompare('hello world', 'hello world')).toBe(true);
    });

    test('returns false for different strings of same length', () => {
      expect(constantTimeCompare('abc', 'abd')).toBe(false);
      expect(constantTimeCompare('abc', 'xyz')).toBe(false);
    });

    test('returns false for strings of different lengths', () => {
      expect(constantTimeCompare('abc', 'abcd')).toBe(false);
      expect(constantTimeCompare('abcd', 'abc')).toBe(false);
      expect(constantTimeCompare('', 'a')).toBe(false);
      expect(constantTimeCompare('a', '')).toBe(false);
    });

    test('handles long strings', () => {
      const long1 = 'a'.repeat(10000);
      const long2 = 'a'.repeat(10000);
      const long3 = 'a'.repeat(9999) + 'b';
      expect(constantTimeCompare(long1, long2)).toBe(true);
      expect(constantTimeCompare(long1, long3)).toBe(false);
    });

    test('handles special characters', () => {
      expect(constantTimeCompare('hello\nworld', 'hello\nworld')).toBe(true);
      expect(constantTimeCompare('hello\tworld', 'hello\tworld')).toBe(true);
      expect(constantTimeCompare('emoji', 'emoji')).toBe(true);
    });

    test('handles hex strings (typical hash comparison)', () => {
      const hash1 = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const hash2 = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const hash3 = 'b1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      expect(constantTimeCompare(hash1, hash2)).toBe(true);
      expect(constantTimeCompare(hash1, hash3)).toBe(false);
    });
  });

  describe('base64UrlToBuffer', () => {
    test('converts base64url to Uint8Array', () => {
      const buffer = base64UrlToBuffer('SGVsbG8');
      expect(buffer).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(buffer).toString()).toBe('Hello');
    });

    test('handles URL-safe characters', () => {
      // Standard base64 uses + and /, base64url uses - and _
      const buffer = base64UrlToBuffer('ab-cd_ef');
      expect(buffer).toBeInstanceOf(Uint8Array);
    });

    test('handles padding restoration', () => {
      // Base64url typically omits padding
      const buffer1 = base64UrlToBuffer('YQ'); // "a" without padding
      expect(Buffer.from(buffer1).toString()).toBe('a');

      const buffer2 = base64UrlToBuffer('YWI'); // "ab" without padding
      expect(Buffer.from(buffer2).toString()).toBe('ab');

      const buffer3 = base64UrlToBuffer('YWJj'); // "abc" no padding needed
      expect(Buffer.from(buffer3).toString()).toBe('abc');
    });

    test('roundtrip with generateSessionId', () => {
      const sessionId = generateSessionId();
      const buffer = base64UrlToBuffer(sessionId);
      expect(buffer.length).toBe(32); // 256 bits
    });

    test('roundtrip with generateSecureToken', () => {
      const token = generateSecureToken(16);
      const buffer = base64UrlToBuffer(token);
      expect(buffer.length).toBe(16);
    });

    test('handles empty string', () => {
      const buffer = base64UrlToBuffer('');
      expect(buffer.length).toBe(0);
    });
  });

  describe('cryptographic quality', () => {
    test('OTPs have good distribution', () => {
      const counts: Record<string, number> = {};
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        const otp = generateOtp(1);
        counts[otp] = (counts[otp] || 0) + 1;
      }

      // Each digit should appear roughly 10% of the time
      // Allow for statistical variance (+/- 3%)
      for (let digit = 0; digit <= 9; digit++) {
        const count = counts[digit.toString()] || 0;
        const percentage = count / iterations;
        expect(percentage).toBeGreaterThan(0.07);
        expect(percentage).toBeLessThan(0.13);
      }
    });

    test('session IDs have sufficient entropy', () => {
      // Generate many session IDs and check they're all unique
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateSessionId());
      }
      expect(ids.size).toBe(1000);
    });
  });

  describe('hmacSign', () => {
    test('returns a base64url-encoded signature', () => {
      const signature = hmacSign('test data');
      expect(signature).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    test('produces consistent signatures for same input', () => {
      const sig1 = hmacSign('test data');
      const sig2 = hmacSign('test data');
      expect(sig1).toBe(sig2);
    });

    test('produces different signatures for different input', () => {
      const sig1 = hmacSign('test data 1');
      const sig2 = hmacSign('test data 2');
      expect(sig1).not.toBe(sig2);
    });

    test('handles empty string', () => {
      const signature = hmacSign('');
      expect(signature).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    test('handles unicode characters', () => {
      const signature = hmacSign('Hello World');
      expect(signature).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    test('handles long strings', () => {
      const longString = 'a'.repeat(10000);
      const signature = hmacSign(longString);
      expect(signature).toMatch(/^[a-zA-Z0-9_-]+$/);
    });
  });

  describe('hmacVerify', () => {
    test('returns true for valid signature', () => {
      const data = 'test data';
      const signature = hmacSign(data);
      expect(hmacVerify(data, signature)).toBe(true);
    });

    test('returns false for invalid signature', () => {
      const data = 'test data';
      const signature = hmacSign(data);
      expect(hmacVerify(data, 'invalid-signature')).toBe(false);
    });

    test('returns false for tampered data', () => {
      const signature = hmacSign('original data');
      expect(hmacVerify('tampered data', signature)).toBe(false);
    });

    test('returns false for signature of different data', () => {
      const sig1 = hmacSign('data 1');
      expect(hmacVerify('data 2', sig1)).toBe(false);
    });

    test('handles empty string data', () => {
      const signature = hmacSign('');
      expect(hmacVerify('', signature)).toBe(true);
      expect(hmacVerify('non-empty', signature)).toBe(false);
    });
  });

  describe('encrypt', () => {
    test('returns a base64url-encoded string', () => {
      const encrypted = encrypt('test plaintext');
      expect(encrypted).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    test('produces different ciphertext for same plaintext (due to random IV)', () => {
      const enc1 = encrypt('same plaintext');
      const enc2 = encrypt('same plaintext');
      expect(enc1).not.toBe(enc2);
    });

    test('handles empty string', () => {
      const encrypted = encrypt('');
      expect(encrypted).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    test('handles unicode characters', () => {
      const encrypted = encrypt('Hello World');
      expect(encrypted).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    test('handles long strings', () => {
      const longString = 'a'.repeat(10000);
      const encrypted = encrypt(longString);
      expect(encrypted).toMatch(/^[a-zA-Z0-9_-]+$/);
    });

    test('handles special characters', () => {
      const encrypted = encrypt('user@example.com:123456');
      expect(encrypted).toMatch(/^[a-zA-Z0-9_-]+$/);
    });
  });

  describe('decrypt', () => {
    test('decrypts encrypted data correctly', () => {
      const plaintext = 'test plaintext';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test('decrypts empty string correctly', () => {
      const encrypted = encrypt('');
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe('');
    });

    test('decrypts unicode correctly', () => {
      const plaintext = 'Hello World';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test('decrypts long strings correctly', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test('returns null for invalid ciphertext', () => {
      const result = decrypt('not-valid-ciphertext');
      expect(result).toBeNull();
    });

    test('returns null for tampered ciphertext', () => {
      const encrypted = encrypt('test');
      // Tamper with the middle of the ciphertext by flipping multiple characters
      // This ensures we're modifying actual ciphertext/authTag bytes, not padding
      const midPoint = Math.floor(encrypted.length / 2);
      const tampered = 
        encrypted.slice(0, midPoint - 2) + 
        'ZZZZ' + // Replace 4 characters in the middle
        encrypted.slice(midPoint + 2);
      const result = decrypt(tampered);
      expect(result).toBeNull();
    });

    test('returns null for truncated ciphertext', () => {
      const encrypted = encrypt('test');
      const truncated = encrypted.slice(0, 10);
      const result = decrypt(truncated);
      expect(result).toBeNull();
    });

    test('returns null for empty string', () => {
      const result = decrypt('');
      expect(result).toBeNull();
    });

    test('roundtrip with complex payload', () => {
      const payload = 'user@example.com:123456:1707900000000';
      const encrypted = encrypt(payload);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(payload);
    });
  });

  describe('deriveBundleId', () => {
    test('returns a hex string (SHA3-256 digest)', () => {
      const bundleId = deriveBundleId('some-ident-hash');
      expect(bundleId).toMatch(/^[0-9a-f]{64}$/);
    });

    test('same input produces same output (deterministic)', () => {
      const a = deriveBundleId('deterministic-input');
      const b = deriveBundleId('deterministic-input');
      expect(a).toBe(b);
    });

    test('different inputs produce different outputs', () => {
      const a = deriveBundleId('input-alpha');
      const b = deriveBundleId('input-bravo');
      expect(a).not.toBe(b);
    });
  });

  describe('verifyDmMessageSignature', () => {
    test('returns true for a valid signature', async () => {
      const { generateSigningKeyPair, sign, toBase64, concatBytes, toBytes, fromBase64 } = await import('@adieuu/crypto');
      const { publicKey, privateKey } = generateSigningKeyPair();
      const ciphertext = Buffer.from('encrypted-data').toString('base64');
      const nonce = Buffer.from('nonce-data').toString('base64');
      const wrappedKeys = [{ identityId: 'id-1', key: 'wrapped' }];

      const signatureData = concatBytes(
        fromBase64(ciphertext), fromBase64(nonce), toBytes(JSON.stringify(wrappedKeys))
      );
      const signature = sign(privateKey, signatureData);

      expect(
        verifyDmMessageSignature(
          toBase64(publicKey), ciphertext, nonce, wrappedKeys, toBase64(signature)
        )
      ).toBe(true);
    });

    test('returns false for tampered ciphertext', async () => {
      const { generateSigningKeyPair, sign, toBase64, concatBytes, toBytes, fromBase64 } = await import('@adieuu/crypto');
      const { publicKey, privateKey } = generateSigningKeyPair();
      const ciphertext = Buffer.from('encrypted-data').toString('base64');
      const nonce = Buffer.from('nonce-data').toString('base64');
      const wrappedKeys = [{ identityId: 'id-1', key: 'wrapped' }];

      const signatureData = concatBytes(
        fromBase64(ciphertext), fromBase64(nonce), toBytes(JSON.stringify(wrappedKeys))
      );
      const signature = sign(privateKey, signatureData);

      const tampered = Buffer.from('tampered-data').toString('base64');
      expect(
        verifyDmMessageSignature(
          toBase64(publicKey), tampered, nonce, wrappedKeys, toBase64(signature)
        )
      ).toBe(false);
    });

    test('returns false for tampered nonce', async () => {
      const { generateSigningKeyPair, sign, toBase64, concatBytes, toBytes, fromBase64 } = await import('@adieuu/crypto');
      const { publicKey, privateKey } = generateSigningKeyPair();
      const ciphertext = Buffer.from('encrypted-data').toString('base64');
      const nonce = Buffer.from('nonce-data').toString('base64');
      const wrappedKeys = [{ identityId: 'id-1', key: 'wrapped' }];

      const signatureData = concatBytes(
        fromBase64(ciphertext), fromBase64(nonce), toBytes(JSON.stringify(wrappedKeys))
      );
      const signature = sign(privateKey, signatureData);

      const tamperedNonce = Buffer.from('wrong-nonce').toString('base64');
      expect(
        verifyDmMessageSignature(
          toBase64(publicKey), ciphertext, tamperedNonce, wrappedKeys, toBase64(signature)
        )
      ).toBe(false);
    });

    test('returns false for an invalid public key', async () => {
      const { generateSigningKeyPair, sign, toBase64, concatBytes, toBytes, fromBase64 } = await import('@adieuu/crypto');
      const { publicKey, privateKey } = generateSigningKeyPair();
      const ciphertext = Buffer.from('encrypted-data').toString('base64');
      const nonce = Buffer.from('nonce-data').toString('base64');
      const wrappedKeys = [{ identityId: 'id-1', key: 'wrapped' }];

      const signatureData = concatBytes(
        fromBase64(ciphertext), fromBase64(nonce), toBytes(JSON.stringify(wrappedKeys))
      );
      const signature = sign(privateKey, signatureData);

      const { publicKey: wrongPub } = generateSigningKeyPair();
      expect(
        verifyDmMessageSignature(
          toBase64(wrongPub), ciphertext, nonce, wrappedKeys, toBase64(signature)
        )
      ).toBe(false);
    });

    test('returns false (not throw) on malformed input', () => {
      expect(
        verifyDmMessageSignature('not-base64!', 'x', 'y', [], 'z')
      ).toBe(false);
    });
  });
});
