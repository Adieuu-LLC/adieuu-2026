import { describe, expect, test } from 'bun:test';

import {
  sign,
  verify,
  signChunks,
  verifyChunks,
  signPrehashed,
  verifyPrehashed,
  ED25519_SIGNATURE_SIZE,
  ED25519_PUBLIC_KEY_SIZE,
  ED25519_PRIVATE_KEY_SIZE,
} from './ed25519';
import { generateSigningKeyPair } from '../keys';
import { randomBytes, toBytes, constantTimeEqual } from '../utils';

describe('sign/ed25519', () => {
  describe('constants', () => {
    test('ED25519_SIGNATURE_SIZE is 64', () => {
      expect(ED25519_SIGNATURE_SIZE).toBe(64);
    });

    test('ED25519_PUBLIC_KEY_SIZE is 32', () => {
      expect(ED25519_PUBLIC_KEY_SIZE).toBe(32);
    });

    test('ED25519_PRIVATE_KEY_SIZE is 32', () => {
      expect(ED25519_PRIVATE_KEY_SIZE).toBe(32);
    });
  });

  describe('sign', () => {
    test('produces 64-byte signature', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Hello, World!');
      const signature = sign(keyPair.privateKey, message);

      expect(signature).toBeInstanceOf(Uint8Array);
      expect(signature.length).toBe(64);
    });

    test('is deterministic (same message + key = same signature)', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Deterministic test');

      const sig1 = sign(keyPair.privateKey, message);
      const sig2 = sign(keyPair.privateKey, message);

      expect(constantTimeEqual(sig1, sig2)).toBe(true);
    });

    test('different messages produce different signatures', () => {
      const keyPair = generateSigningKeyPair();
      const msg1 = toBytes('Message 1');
      const msg2 = toBytes('Message 2');

      const sig1 = sign(keyPair.privateKey, msg1);
      const sig2 = sign(keyPair.privateKey, msg2);

      expect(constantTimeEqual(sig1, sig2)).toBe(false);
    });

    test('different keys produce different signatures', () => {
      const keyPair1 = generateSigningKeyPair();
      const keyPair2 = generateSigningKeyPair();
      const message = toBytes('Same message');

      const sig1 = sign(keyPair1.privateKey, message);
      const sig2 = sign(keyPair2.privateKey, message);

      expect(constantTimeEqual(sig1, sig2)).toBe(false);
    });

    test('handles empty message', () => {
      const keyPair = generateSigningKeyPair();
      const message = new Uint8Array(0);
      const signature = sign(keyPair.privateKey, message);

      expect(signature.length).toBe(64);
    });

    test('handles large message', () => {
      const keyPair = generateSigningKeyPair();
      const message = randomBytes(100000);
      const signature = sign(keyPair.privateKey, message);

      expect(signature.length).toBe(64);
    });

    test('throws on invalid private key size', () => {
      const shortKey = randomBytes(16);
      const message = toBytes('Test');

      expect(() => sign(shortKey, message)).toThrow(
        'Private key must be 32 bytes, got 16'
      );
    });

    test('throws on empty private key', () => {
      const emptyKey = new Uint8Array(0);
      const message = toBytes('Test');

      expect(() => sign(emptyKey, message)).toThrow(
        'Private key must be 32 bytes, got 0'
      );
    });
  });

  describe('verify', () => {
    test('returns true for valid signature', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Hello, World!');
      const signature = sign(keyPair.privateKey, message);

      expect(verify(keyPair.publicKey, message, signature)).toBe(true);
    });

    test('returns false for wrong public key', () => {
      const keyPair1 = generateSigningKeyPair();
      const keyPair2 = generateSigningKeyPair();
      const message = toBytes('Test');
      const signature = sign(keyPair1.privateKey, message);

      expect(verify(keyPair2.publicKey, message, signature)).toBe(false);
    });

    test('returns false for wrong message', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Original');
      const signature = sign(keyPair.privateKey, message);
      const tamperedMessage = toBytes('Tampered');

      expect(verify(keyPair.publicKey, tamperedMessage, signature)).toBe(false);
    });

    test('returns false for tampered signature', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Test');
      const signature = sign(keyPair.privateKey, message);

      // Tamper with signature
      const tampered = new Uint8Array(signature);
      tampered[0] = (tampered[0]! + 1) % 256;

      expect(verify(keyPair.publicKey, message, tampered)).toBe(false);
    });

    test('returns false for wrong signature size', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Test');
      const shortSig = randomBytes(32);

      expect(verify(keyPair.publicKey, message, shortSig)).toBe(false);
    });

    test('returns false for wrong public key size', () => {
      const shortPubKey = randomBytes(16);
      const message = toBytes('Test');
      const signature = randomBytes(64);

      expect(verify(shortPubKey, message, signature)).toBe(false);
    });

    test('returns false for invalid signature format', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Test');
      const invalidSig = randomBytes(64);

      expect(verify(keyPair.publicKey, message, invalidSig)).toBe(false);
    });

    test('verifies empty message', () => {
      const keyPair = generateSigningKeyPair();
      const message = new Uint8Array(0);
      const signature = sign(keyPair.privateKey, message);

      expect(verify(keyPair.publicKey, message, signature)).toBe(true);
    });

    test('verifies large message', () => {
      const keyPair = generateSigningKeyPair();
      const message = randomBytes(100000);
      const signature = sign(keyPair.privateKey, message);

      expect(verify(keyPair.publicKey, message, signature)).toBe(true);
    });
  });

  describe('signChunks', () => {
    test('signs multiple chunks', () => {
      const keyPair = generateSigningKeyPair();
      const chunk1 = toBytes('Hello, ');
      const chunk2 = toBytes('World!');

      const signature = signChunks(keyPair.privateKey, [chunk1, chunk2]);

      expect(signature.length).toBe(64);
    });

    test('signature matches concatenated sign', () => {
      const keyPair = generateSigningKeyPair();
      const chunk1 = toBytes('Hello, ');
      const chunk2 = toBytes('World!');
      const combined = new Uint8Array([...chunk1, ...chunk2]);

      const chunkSig = signChunks(keyPair.privateKey, [chunk1, chunk2]);
      const directSig = sign(keyPair.privateKey, combined);

      expect(constantTimeEqual(chunkSig, directSig)).toBe(true);
    });

    test('handles empty chunks array', () => {
      const keyPair = generateSigningKeyPair();
      const signature = signChunks(keyPair.privateKey, []);

      expect(signature.length).toBe(64);
    });

    test('handles single chunk', () => {
      const keyPair = generateSigningKeyPair();
      const chunk = toBytes('Single chunk');
      const signature = signChunks(keyPair.privateKey, [chunk]);

      expect(verify(keyPair.publicKey, chunk, signature)).toBe(true);
    });

    test('handles many chunks', () => {
      const keyPair = generateSigningKeyPair();
      const chunks = Array.from({ length: 100 }, (_, i) => toBytes(`Chunk ${i}`));
      const signature = signChunks(keyPair.privateKey, chunks);

      expect(signature.length).toBe(64);
    });
  });

  describe('verifyChunks', () => {
    test('verifies chunked signature', () => {
      const keyPair = generateSigningKeyPair();
      const chunk1 = toBytes('Hello, ');
      const chunk2 = toBytes('World!');
      const signature = signChunks(keyPair.privateKey, [chunk1, chunk2]);

      expect(verifyChunks(keyPair.publicKey, [chunk1, chunk2], signature)).toBe(true);
    });

    test('returns false for wrong chunks', () => {
      const keyPair = generateSigningKeyPair();
      const chunk1 = toBytes('Hello, ');
      const chunk2 = toBytes('World!');
      const signature = signChunks(keyPair.privateKey, [chunk1, chunk2]);

      const tamperedChunk = toBytes('Tampered');
      expect(verifyChunks(keyPair.publicKey, [tamperedChunk, chunk2], signature)).toBe(false);
    });

    test('returns false for wrong order', () => {
      const keyPair = generateSigningKeyPair();
      const chunk1 = toBytes('First');
      const chunk2 = toBytes('Second');
      const signature = signChunks(keyPair.privateKey, [chunk1, chunk2]);

      expect(verifyChunks(keyPair.publicKey, [chunk2, chunk1], signature)).toBe(false);
    });

    test('returns false for missing chunk', () => {
      const keyPair = generateSigningKeyPair();
      const chunk1 = toBytes('First');
      const chunk2 = toBytes('Second');
      const signature = signChunks(keyPair.privateKey, [chunk1, chunk2]);

      expect(verifyChunks(keyPair.publicKey, [chunk1], signature)).toBe(false);
    });

    test('verifies empty chunks', () => {
      const keyPair = generateSigningKeyPair();
      const signature = signChunks(keyPair.privateKey, []);

      expect(verifyChunks(keyPair.publicKey, [], signature)).toBe(true);
    });
  });

  describe('signPrehashed', () => {
    test('produces 64-byte signature', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Test message');
      const signature = signPrehashed(keyPair.privateKey, message);

      expect(signature.length).toBe(64);
    });

    test('is deterministic', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Test');

      const sig1 = signPrehashed(keyPair.privateKey, message);
      const sig2 = signPrehashed(keyPair.privateKey, message);

      expect(constantTimeEqual(sig1, sig2)).toBe(true);
    });

    test('different from regular sign', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Test');

      const regularSig = sign(keyPair.privateKey, message);
      const prehashedSig = signPrehashed(keyPair.privateKey, message);

      expect(constantTimeEqual(regularSig, prehashedSig)).toBe(false);
    });

    test('handles large message efficiently', () => {
      const keyPair = generateSigningKeyPair();
      const largeMessage = randomBytes(10000000); // 10MB

      const start = performance.now();
      const signature = signPrehashed(keyPair.privateKey, largeMessage);
      const duration = performance.now() - start;

      expect(signature.length).toBe(64);
      // Should be reasonably fast (< 1 second for 10MB)
      expect(duration).toBeLessThan(1000);
    });

    test('throws on invalid private key', () => {
      const shortKey = randomBytes(16);
      const message = toBytes('Test');

      expect(() => signPrehashed(shortKey, message)).toThrow(
        'Private key must be 32 bytes'
      );
    });
  });

  describe('verifyPrehashed', () => {
    test('verifies prehashed signature', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Test message');
      const signature = signPrehashed(keyPair.privateKey, message);

      expect(verifyPrehashed(keyPair.publicKey, message, signature)).toBe(true);
    });

    test('returns false for wrong message', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Original');
      const signature = signPrehashed(keyPair.privateKey, message);
      const tampered = toBytes('Tampered');

      expect(verifyPrehashed(keyPair.publicKey, tampered, signature)).toBe(false);
    });

    test('returns false for regular signature', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Test');

      // Sign with regular sign, try to verify with prehashed
      const regularSig = sign(keyPair.privateKey, message);
      expect(verifyPrehashed(keyPair.publicKey, message, regularSig)).toBe(false);
    });

    test('returns false for wrong public key size', () => {
      const shortKey = randomBytes(16);
      const message = toBytes('Test');
      const signature = randomBytes(64);

      expect(verifyPrehashed(shortKey, message, signature)).toBe(false);
    });

    test('returns false for wrong signature size', () => {
      const keyPair = generateSigningKeyPair();
      const message = toBytes('Test');
      const shortSig = randomBytes(32);

      expect(verifyPrehashed(keyPair.publicKey, message, shortSig)).toBe(false);
    });
  });

  describe('cross-compatibility', () => {
    test('many sign/verify cycles', () => {
      const keyPair = generateSigningKeyPair();

      for (let i = 0; i < 100; i++) {
        const message = randomBytes(Math.floor(Math.random() * 1000));
        const signature = sign(keyPair.privateKey, message);
        expect(verify(keyPair.publicKey, message, signature)).toBe(true);
      }
    });

    test('signatures from different keys never match', () => {
      const message = toBytes('Test');
      const signatures = new Set<string>();

      for (let i = 0; i < 50; i++) {
        const keyPair = generateSigningKeyPair();
        const sig = sign(keyPair.privateKey, message);
        signatures.add(Buffer.from(sig).toString('hex'));
      }

      expect(signatures.size).toBe(50);
    });
  });
});
