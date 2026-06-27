import { describe, expect, test } from 'bun:test';

import {
  hybridKeyExchange,
  hybridDecapsulate,
  wrapSessionKey,
  unwrapSessionKey,
  wrapSessionKeyForRecipients,
  findAndUnwrapSessionKey,
  computeRoutingTag,
  SESSION_KEY_SIZE,
} from './hybrid';
import {
  generateIdentityKeyBundle,
  generateECDHKeyPair,
  generateKEMKeyPair,
  extractPublicKeys,
} from '../keys';
import { randomBytes, constantTimeEqual } from '../utils';
import type { IdentityPublicKeys, WrappedKey } from '../types';

describe('encrypt/hybrid', () => {
  describe('constants', () => {
    test('SESSION_KEY_SIZE is 32', () => {
      expect(SESSION_KEY_SIZE).toBe(32);
    });
  });

  describe('hybridKeyExchange', () => {
    test('returns all required components', () => {
      const ecdh = generateECDHKeyPair();
      const kem = generateKEMKeyPair();

      const result = hybridKeyExchange(ecdh.publicKey, kem.publicKey);

      expect(result.sharedSecret).toBeInstanceOf(Uint8Array);
      expect(result.ephemeralPublicKey).toBeInstanceOf(Uint8Array);
      expect(result.kemCiphertext).toBeInstanceOf(Uint8Array);
    });

    test('sharedSecret is 32 bytes', () => {
      const ecdh = generateECDHKeyPair();
      const kem = generateKEMKeyPair();

      const result = hybridKeyExchange(ecdh.publicKey, kem.publicKey);

      expect(result.sharedSecret.length).toBe(32);
    });

    test('ephemeralPublicKey is 32 bytes', () => {
      const ecdh = generateECDHKeyPair();
      const kem = generateKEMKeyPair();

      const result = hybridKeyExchange(ecdh.publicKey, kem.publicKey);

      expect(result.ephemeralPublicKey.length).toBe(32);
    });

    test('kemCiphertext has correct size for default profile', () => {
      const ecdh = generateECDHKeyPair();
      const kem = generateKEMKeyPair('default');

      const result = hybridKeyExchange(ecdh.publicKey, kem.publicKey, 'default');

      expect(result.kemCiphertext.length).toBe(1088); // ML-KEM-768
    });

    test('kemCiphertext has correct size for cnsa2 profile', () => {
      const ecdh = generateECDHKeyPair();
      const kem = generateKEMKeyPair('cnsa2');

      const result = hybridKeyExchange(ecdh.publicKey, kem.publicKey, 'cnsa2');

      expect(result.kemCiphertext.length).toBe(1568); // ML-KEM-1024
    });

    test('generates different ephemeral keys each time', () => {
      const ecdh = generateECDHKeyPair();
      const kem = generateKEMKeyPair();

      const result1 = hybridKeyExchange(ecdh.publicKey, kem.publicKey);
      const result2 = hybridKeyExchange(ecdh.publicKey, kem.publicKey);

      expect(constantTimeEqual(result1.ephemeralPublicKey, result2.ephemeralPublicKey)).toBe(false);
    });

    test('generates different shared secrets each time', () => {
      const ecdh = generateECDHKeyPair();
      const kem = generateKEMKeyPair();

      const result1 = hybridKeyExchange(ecdh.publicKey, kem.publicKey);
      const result2 = hybridKeyExchange(ecdh.publicKey, kem.publicKey);

      expect(constantTimeEqual(result1.sharedSecret, result2.sharedSecret)).toBe(false);
    });
  });

  describe('hybridDecapsulate', () => {
    test('derives same shared secret as exchange', () => {
      const ecdh = generateECDHKeyPair();
      const kem = generateKEMKeyPair();

      const exchange = hybridKeyExchange(ecdh.publicKey, kem.publicKey);
      const decapsulated = hybridDecapsulate(
        ecdh.privateKey,
        kem.privateKey,
        exchange.ephemeralPublicKey,
        exchange.kemCiphertext
      );

      expect(constantTimeEqual(exchange.sharedSecret, decapsulated)).toBe(true);
    });

    test('works with default profile', () => {
      const ecdh = generateECDHKeyPair();
      const kem = generateKEMKeyPair('default');

      const exchange = hybridKeyExchange(ecdh.publicKey, kem.publicKey, 'default');
      const decapsulated = hybridDecapsulate(
        ecdh.privateKey,
        kem.privateKey,
        exchange.ephemeralPublicKey,
        exchange.kemCiphertext,
        'default'
      );

      expect(constantTimeEqual(exchange.sharedSecret, decapsulated)).toBe(true);
    });

    test('works with cnsa2 profile', () => {
      const ecdh = generateECDHKeyPair();
      const kem = generateKEMKeyPair('cnsa2');

      const exchange = hybridKeyExchange(ecdh.publicKey, kem.publicKey, 'cnsa2');
      const decapsulated = hybridDecapsulate(
        ecdh.privateKey,
        kem.privateKey,
        exchange.ephemeralPublicKey,
        exchange.kemCiphertext,
        'cnsa2'
      );

      expect(constantTimeEqual(exchange.sharedSecret, decapsulated)).toBe(true);
    });

    test('different ECDH private key produces different secret', () => {
      const ecdh1 = generateECDHKeyPair();
      const ecdh2 = generateECDHKeyPair();
      const kem = generateKEMKeyPair();

      const exchange = hybridKeyExchange(ecdh1.publicKey, kem.publicKey);

      // Using wrong ECDH private key
      const wrongDecap = hybridDecapsulate(
        ecdh2.privateKey,
        kem.privateKey,
        exchange.ephemeralPublicKey,
        exchange.kemCiphertext
      );

      expect(constantTimeEqual(exchange.sharedSecret, wrongDecap)).toBe(false);
    });

    test('different KEM private key produces different secret', () => {
      const ecdh = generateECDHKeyPair();
      const kem1 = generateKEMKeyPair();
      const kem2 = generateKEMKeyPair();

      const exchange = hybridKeyExchange(ecdh.publicKey, kem1.publicKey);

      // Using wrong KEM private key produces a different (wrong) shared secret
      // ML-KEM decapsulation with wrong key returns implicit rejection value
      const wrongDecap = hybridDecapsulate(
        ecdh.privateKey,
        kem2.privateKey,
        exchange.ephemeralPublicKey,
        exchange.kemCiphertext
      );

      expect(constantTimeEqual(exchange.sharedSecret, wrongDecap)).toBe(false);
    });
  });

  describe('wrapSessionKey', () => {
    test('wraps session key successfully', () => {
      const bundle = generateIdentityKeyBundle();
      const publicKeys = extractPublicKeys(bundle);
      const sessionKey = randomBytes(32);

      const wrapped = wrapSessionKey(sessionKey, publicKeys, 'test-identity');

      expect(wrapped.identityId).toBe('test-identity');
      expect(wrapped.ephemeralPublicKey).toBeInstanceOf(Uint8Array);
      expect(wrapped.kemCiphertext).toBeInstanceOf(Uint8Array);
      expect(wrapped.wrappedSessionKey).toBeInstanceOf(Uint8Array);
      expect(wrapped.wrappingNonce).toBeInstanceOf(Uint8Array);
    });

    test('wrappedSessionKey is encrypted (not plaintext)', () => {
      const bundle = generateIdentityKeyBundle();
      const publicKeys = extractPublicKeys(bundle);
      const sessionKey = randomBytes(32);

      const wrapped = wrapSessionKey(sessionKey, publicKeys, 'test');

      // Wrapped key should be larger than original (includes auth tag)
      expect(wrapped.wrappedSessionKey.length).toBe(sessionKey.length + 16);
      expect(constantTimeEqual(wrapped.wrappedSessionKey.slice(0, 32), sessionKey)).toBe(false);
    });

    test('throws on invalid session key size', () => {
      const bundle = generateIdentityKeyBundle();
      const publicKeys = extractPublicKeys(bundle);
      const shortKey = randomBytes(16);

      expect(() => wrapSessionKey(shortKey, publicKeys, 'test')).toThrow(
        'Session key must be 32 bytes'
      );
    });

    test('different wraps produce different ciphertext', () => {
      const bundle = generateIdentityKeyBundle();
      const publicKeys = extractPublicKeys(bundle);
      const sessionKey = randomBytes(32);

      const wrapped1 = wrapSessionKey(sessionKey, publicKeys, 'test');
      const wrapped2 = wrapSessionKey(sessionKey, publicKeys, 'test');

      expect(constantTimeEqual(wrapped1.wrappedSessionKey, wrapped2.wrappedSessionKey)).toBe(false);
    });
  });

  describe('unwrapSessionKey', () => {
    test('unwraps to original session key', () => {
      const bundle = generateIdentityKeyBundle();
      const publicKeys = extractPublicKeys(bundle);
      const sessionKey = randomBytes(32);

      const wrapped = wrapSessionKey(sessionKey, publicKeys, 'test');
      const unwrapped = unwrapSessionKey(
        wrapped,
        bundle.ecdh.privateKey,
        bundle.kem.privateKey
      );

      expect(constantTimeEqual(unwrapped, sessionKey)).toBe(true);
    });

    test('works with default profile', () => {
      const bundle = generateIdentityKeyBundle('default');
      const publicKeys = extractPublicKeys(bundle);
      const sessionKey = randomBytes(32);

      const wrapped = wrapSessionKey(sessionKey, publicKeys, 'test');
      const unwrapped = unwrapSessionKey(
        wrapped,
        bundle.ecdh.privateKey,
        bundle.kem.privateKey,
        'default'
      );

      expect(constantTimeEqual(unwrapped, sessionKey)).toBe(true);
    });

    test('works with cnsa2 profile', () => {
      const bundle = generateIdentityKeyBundle('cnsa2');
      const publicKeys = extractPublicKeys(bundle);
      const sessionKey = randomBytes(32);

      const wrapped = wrapSessionKey(sessionKey, publicKeys, 'test');
      const unwrapped = unwrapSessionKey(
        wrapped,
        bundle.ecdh.privateKey,
        bundle.kem.privateKey,
        'cnsa2'
      );

      expect(constantTimeEqual(unwrapped, sessionKey)).toBe(true);
    });

    test('throws when decrypting with mismatched profile', () => {
      const bundle = generateIdentityKeyBundle('cnsa2');
      const publicKeys = extractPublicKeys(bundle);
      const sessionKey = randomBytes(32);
      const wrapped = wrapSessionKey(sessionKey, publicKeys, 'test');

      expect(() =>
        unwrapSessionKey(
          wrapped,
          bundle.ecdh.privateKey,
          bundle.kem.privateKey,
          'default'
        )
      ).toThrow();
    });

    test('throws with wrong ECDH private key', () => {
      const bundle = generateIdentityKeyBundle();
      const wrongEcdh = generateECDHKeyPair();
      const publicKeys = extractPublicKeys(bundle);
      const sessionKey = randomBytes(32);

      const wrapped = wrapSessionKey(sessionKey, publicKeys, 'test');

      // Wrong key should fail to decrypt
      expect(() =>
        unwrapSessionKey(
          wrapped,
          wrongEcdh.privateKey,
          bundle.kem.privateKey
        )
      ).toThrow();
    });

    test('throws with wrong KEM private key', () => {
      const bundle = generateIdentityKeyBundle();
      const wrongKem = generateKEMKeyPair();
      const publicKeys = extractPublicKeys(bundle);
      const sessionKey = randomBytes(32);

      const wrapped = wrapSessionKey(sessionKey, publicKeys, 'test');

      expect(() =>
        unwrapSessionKey(
          wrapped,
          bundle.ecdh.privateKey,
          wrongKem.privateKey
        )
      ).toThrow();
    });
  });

  describe('computeRoutingTag', () => {
    test('returns an 8-character base64 tag', () => {
      const bundle = generateIdentityKeyBundle();
      const tag = computeRoutingTag(bundle.ecdh.publicKey, bundle.kem.publicKey);

      expect(tag).toMatch(/^[A-Za-z0-9+/]{8}$/);
    });

    test('is deterministic for same key material', () => {
      const bundle = generateIdentityKeyBundle();
      const tag1 = computeRoutingTag(bundle.ecdh.publicKey, bundle.kem.publicKey);
      const tag2 = computeRoutingTag(bundle.ecdh.publicKey, bundle.kem.publicKey);
      expect(tag1).toBe(tag2);
    });

    test('matches between raw bytes and base64 inputs', () => {
      const bundle = generateIdentityKeyBundle();
      const tagFromBytes = computeRoutingTag(bundle.ecdh.publicKey, bundle.kem.publicKey);
      const tagFromBase64 = computeRoutingTag(
        Buffer.from(bundle.ecdh.publicKey).toString('base64'),
        Buffer.from(bundle.kem.publicKey).toString('base64')
      );
      expect(tagFromBase64).toBe(tagFromBytes);
    });

    test('handles malformed base64 input without matching valid key tag', () => {
      const bundle = generateIdentityKeyBundle();
      const validTag = computeRoutingTag(bundle.ecdh.publicKey, bundle.kem.publicKey);
      const malformedTag = computeRoutingTag('not-base64!', bundle.kem.publicKey);
      expect(malformedTag).toMatch(/^[A-Za-z0-9+/]{8}$/);
      expect(malformedTag).not.toBe(validTag);
    });
  });

  describe('wrapSessionKeyForRecipients', () => {
    test('wraps for multiple recipients', () => {
      const alice = generateIdentityKeyBundle();
      const bob = generateIdentityKeyBundle();
      const sessionKey = randomBytes(32);

      const recipients = [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
        { identityId: 'bob', publicKeys: extractPublicKeys(bob) },
      ];

      const wrappedKeys = wrapSessionKeyForRecipients(sessionKey, recipients);

      expect(wrappedKeys.length).toBe(2);
      expect(wrappedKeys[0]!.identityId).toBe('alice');
      expect(wrappedKeys[1]!.identityId).toBe('bob');
    });

    test('each recipient can unwrap', () => {
      const alice = generateIdentityKeyBundle();
      const bob = generateIdentityKeyBundle();
      const sessionKey = randomBytes(32);

      const recipients = [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
        { identityId: 'bob', publicKeys: extractPublicKeys(bob) },
      ];

      const wrappedKeys = wrapSessionKeyForRecipients(sessionKey, recipients);

      // Alice can unwrap her key
      const aliceKey = unwrapSessionKey(
        wrappedKeys[0]!,
        alice.ecdh.privateKey,
        alice.kem.privateKey
      );
      expect(constantTimeEqual(aliceKey, sessionKey)).toBe(true);

      // Bob can unwrap his key
      const bobKey = unwrapSessionKey(
        wrappedKeys[1]!,
        bob.ecdh.privateKey,
        bob.kem.privateKey
      );
      expect(constantTimeEqual(bobKey, sessionKey)).toBe(true);
    });

    test('handles empty recipients array', () => {
      const sessionKey = randomBytes(32);
      const wrappedKeys = wrapSessionKeyForRecipients(sessionKey, []);

      expect(wrappedKeys.length).toBe(0);
    });

    test('handles single recipient', () => {
      const alice = generateIdentityKeyBundle();
      const sessionKey = randomBytes(32);

      const recipients = [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
      ];

      const wrappedKeys = wrapSessionKeyForRecipients(sessionKey, recipients);

      expect(wrappedKeys.length).toBe(1);
    });

    test('handles many recipients', () => {
      const sessionKey = randomBytes(32);
      const recipients = Array.from({ length: 20 }, (_, i) => ({
        identityId: `user-${i}`,
        publicKeys: extractPublicKeys(generateIdentityKeyBundle()),
      }));

      const wrappedKeys = wrapSessionKeyForRecipients(sessionKey, recipients);

      expect(wrappedKeys.length).toBe(20);
    });
  });

  describe('findAndUnwrapSessionKey', () => {
    test('finds and unwraps correct key', () => {
      const alice = generateIdentityKeyBundle();
      const bob = generateIdentityKeyBundle();
      const sessionKey = randomBytes(32);

      const recipients = [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
        { identityId: 'bob', publicKeys: extractPublicKeys(bob) },
      ];

      const wrappedKeys = wrapSessionKeyForRecipients(sessionKey, recipients);

      const bobKey = findAndUnwrapSessionKey(
        wrappedKeys,
        'bob',
        bob.ecdh.privateKey,
        bob.kem.privateKey
      );

      expect(bobKey).not.toBeNull();
      expect(constantTimeEqual(bobKey!, sessionKey)).toBe(true);
    });

    test('returns null for unknown identity', () => {
      const alice = generateIdentityKeyBundle();
      const sessionKey = randomBytes(32);

      const wrappedKeys = wrapSessionKeyForRecipients(sessionKey, [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
      ]);

      const result = findAndUnwrapSessionKey(
        wrappedKeys,
        'unknown-identity',
        alice.ecdh.privateKey,
        alice.kem.privateKey
      );

      expect(result).toBeNull();
    });

    test('returns null for empty wrapped keys array', () => {
      const alice = generateIdentityKeyBundle();

      const result = findAndUnwrapSessionKey(
        [],
        'alice',
        alice.ecdh.privateKey,
        alice.kem.privateKey
      );

      expect(result).toBeNull();
    });

    test('respects profile parameter', () => {
      const alice = generateIdentityKeyBundle('cnsa2');
      const sessionKey = randomBytes(32);

      const wrappedKeys = wrapSessionKeyForRecipients(sessionKey, [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
      ]);

      const result = findAndUnwrapSessionKey(
        wrappedKeys,
        'alice',
        alice.ecdh.privateKey,
        alice.kem.privateKey,
        'cnsa2'
      );

      expect(result).not.toBeNull();
      expect(constantTimeEqual(result!, sessionKey)).toBe(true);
    });
  });

  describe('end-to-end message encryption simulation', () => {
    test('complete encryption/decryption flow', () => {
      // Sender and recipients
      const sender = generateIdentityKeyBundle();
      const recipient1 = generateIdentityKeyBundle();
      const recipient2 = generateIdentityKeyBundle();

      // Message
      const plaintext = new TextEncoder().encode('Hello, World!');

      // Step 1: Generate session key
      const sessionKey = randomBytes(32);

      // Step 2: Encrypt message (simulated - just checking key works)
      // In real code, this would use symmetric encrypt

      // Step 3: Wrap session key for all recipients (including sender for multi-device)
      const wrappedKeys = wrapSessionKeyForRecipients(sessionKey, [
        { identityId: 'sender', publicKeys: extractPublicKeys(sender) },
        { identityId: 'recipient1', publicKeys: extractPublicKeys(recipient1) },
        { identityId: 'recipient2', publicKeys: extractPublicKeys(recipient2) },
      ]);

      expect(wrappedKeys.length).toBe(3);

      // Step 4: Each party can decrypt
      const senderDecrypted = findAndUnwrapSessionKey(
        wrappedKeys,
        'sender',
        sender.ecdh.privateKey,
        sender.kem.privateKey
      );
      expect(constantTimeEqual(senderDecrypted!, sessionKey)).toBe(true);

      const r1Decrypted = findAndUnwrapSessionKey(
        wrappedKeys,
        'recipient1',
        recipient1.ecdh.privateKey,
        recipient1.kem.privateKey
      );
      expect(constantTimeEqual(r1Decrypted!, sessionKey)).toBe(true);

      const r2Decrypted = findAndUnwrapSessionKey(
        wrappedKeys,
        'recipient2',
        recipient2.ecdh.privateKey,
        recipient2.kem.privateKey
      );
      expect(constantTimeEqual(r2Decrypted!, sessionKey)).toBe(true);
    });
  });
});
