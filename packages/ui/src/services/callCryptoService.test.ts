/**
 * Tests for call E2EE crypto service.
 *
 * Verifies serialization round-trips, key generation, wrapping/unwrapping,
 * and security properties (key zeroing, mismatched identity rejection).
 */

import { describe, expect, test } from 'bun:test';
import {
  generateIdentityKeyBundle,
  extractPublicKeys,
  toBase64,
  constantTimeEqual,
  CALL_KEY_SIZE,
} from '@adieuu/crypto';
import {
  generateCallE2EEKey,
  wrapAndSerializeCallKey,
  deserializeAndUnwrapCallKey,
  serializeWrappedCallKeys,
  deserializeWrappedCallKeys,
  zeroCallKey,
  type CallKeyRecipient,
} from './callCryptoService';

function makeRecipient(identityId: string): {
  recipient: CallKeyRecipient;
  privateKeys: { ecdhPrivate: Uint8Array; kemPrivate: Uint8Array };
} {
  const bundle = generateIdentityKeyBundle();
  const pub = extractPublicKeys(bundle);
  return {
    recipient: {
      identityId,
      ecdhPublicKey: toBase64(pub.ecdh),
      kemPublicKey: toBase64(pub.kem),
      signingPublicKey: toBase64(pub.signing),
      preferredCryptoProfile: 'default',
    },
    privateKeys: {
      ecdhPrivate: bundle.ecdh.privateKey,
      kemPrivate: bundle.kem.privateKey,
    },
  };
}

describe('callCryptoService', () => {
  // ---------- Key Generation ----------

  describe('generateCallE2EEKey', () => {
    test('returns a 32-byte Uint8Array', () => {
      const key = generateCallE2EEKey();
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(CALL_KEY_SIZE);
    });

    test('generates unique keys each time', () => {
      const a = generateCallE2EEKey();
      const b = generateCallE2EEKey();
      expect(constantTimeEqual(a, b)).toBe(false);
    });
  });

  // ---------- Serialization Round-Trip ----------

  describe('serialization round-trip', () => {
    test('serializeWrappedCallKeys and deserializeWrappedCallKeys are inverses', () => {
      const callKey = generateCallE2EEKey();
      const { recipient } = makeRecipient('alice');

      const serialized = wrapAndSerializeCallKey(callKey, [recipient]);
      expect(serialized).toHaveLength(1);
      expect(serialized[0].recipientIdentityId).toBe('alice');
      expect(typeof serialized[0].ephemeralPublicKey).toBe('string');
      expect(typeof serialized[0].kemCiphertext).toBe('string');
      expect(typeof serialized[0].wrappedKey).toBe('string');
      expect(typeof serialized[0].wrappingNonce).toBe('string');

      const deserialized = deserializeWrappedCallKeys(serialized);
      expect(deserialized).toHaveLength(1);
      expect(deserialized[0].recipientIdentityId).toBe('alice');
      expect(deserialized[0].ephemeralPublicKey).toBeInstanceOf(Uint8Array);
      expect(deserialized[0].kemCiphertext).toBeInstanceOf(Uint8Array);
      expect(deserialized[0].wrappedKey).toBeInstanceOf(Uint8Array);
      expect(deserialized[0].wrappingNonce).toBeInstanceOf(Uint8Array);
    });

    test('all base64 fields are non-empty strings', () => {
      const callKey = generateCallE2EEKey();
      const { recipient } = makeRecipient('bob');
      const serialized = wrapAndSerializeCallKey(callKey, [recipient]);

      for (const key of serialized) {
        expect(key.ephemeralPublicKey.length).toBeGreaterThan(0);
        expect(key.kemCiphertext.length).toBeGreaterThan(0);
        expect(key.wrappedKey.length).toBeGreaterThan(0);
        expect(key.wrappingNonce.length).toBeGreaterThan(0);
      }
    });
  });

  // ---------- Full Wrap/Unwrap Round-Trip ----------

  describe('wrap and unwrap round-trip', () => {
    test('single recipient can unwrap the call key', () => {
      const callKey = generateCallE2EEKey();
      const { recipient, privateKeys } = makeRecipient('alice');

      const serialized = wrapAndSerializeCallKey(callKey, [recipient]);

      const unwrapped = deserializeAndUnwrapCallKey(
        serialized,
        'alice',
        privateKeys.ecdhPrivate,
        privateKeys.kemPrivate,
      );

      expect(unwrapped).not.toBeNull();
      expect(constantTimeEqual(unwrapped!, callKey)).toBe(true);
    });

    test('multiple recipients each receive the same call key', () => {
      const callKey = generateCallE2EEKey();
      const alice = makeRecipient('alice');
      const bob = makeRecipient('bob');
      const carol = makeRecipient('carol');

      const serialized = wrapAndSerializeCallKey(callKey, [
        alice.recipient,
        bob.recipient,
        carol.recipient,
      ]);

      expect(serialized).toHaveLength(3);

      const aliceKey = deserializeAndUnwrapCallKey(
        serialized,
        'alice',
        alice.privateKeys.ecdhPrivate,
        alice.privateKeys.kemPrivate,
      );
      const bobKey = deserializeAndUnwrapCallKey(
        serialized,
        'bob',
        bob.privateKeys.ecdhPrivate,
        bob.privateKeys.kemPrivate,
      );
      const carolKey = deserializeAndUnwrapCallKey(
        serialized,
        'carol',
        carol.privateKeys.ecdhPrivate,
        carol.privateKeys.kemPrivate,
      );

      expect(aliceKey).not.toBeNull();
      expect(bobKey).not.toBeNull();
      expect(carolKey).not.toBeNull();
      expect(constantTimeEqual(aliceKey!, callKey)).toBe(true);
      expect(constantTimeEqual(bobKey!, callKey)).toBe(true);
      expect(constantTimeEqual(carolKey!, callKey)).toBe(true);
    });

    test('wrong identity ID returns null', () => {
      const callKey = generateCallE2EEKey();
      const { recipient, privateKeys } = makeRecipient('alice');
      const serialized = wrapAndSerializeCallKey(callKey, [recipient]);

      const result = deserializeAndUnwrapCallKey(
        serialized,
        'unknown-identity',
        privateKeys.ecdhPrivate,
        privateKeys.kemPrivate,
      );

      expect(result).toBeNull();
    });

    test('multiple wrapped keys for the same identity unwrap with the matching device keys', () => {
      const callKey = generateCallE2EEKey();
      const device1 = makeRecipient('alice');
      const device2 = makeRecipient('alice');

      const serialized = wrapAndSerializeCallKey(callKey, [
        device1.recipient,
        device2.recipient,
      ]);

      expect(serialized).toHaveLength(2);
      expect(serialized[0].recipientIdentityId).toBe('alice');
      expect(serialized[1].recipientIdentityId).toBe('alice');

      const unwrapped = deserializeAndUnwrapCallKey(
        serialized,
        'alice',
        device2.privateKeys.ecdhPrivate,
        device2.privateKeys.kemPrivate,
      );

      expect(unwrapped).not.toBeNull();
      expect(constantTimeEqual(unwrapped!, callKey)).toBe(true);
    });

    test('wrong private keys fail to unwrap', () => {
      const callKey = generateCallE2EEKey();
      const alice = makeRecipient('alice');
      const eve = makeRecipient('eve');

      const serialized = wrapAndSerializeCallKey(callKey, [alice.recipient]);

      expect(() =>
        deserializeAndUnwrapCallKey(
          serialized,
          'alice',
          eve.privateKeys.ecdhPrivate,
          eve.privateKeys.kemPrivate,
        )
      ).toThrow();
    });

    test('empty wrapped keys array returns null', () => {
      const alice = makeRecipient('alice');

      const result = deserializeAndUnwrapCallKey(
        [],
        'alice',
        alice.privateKeys.ecdhPrivate,
        alice.privateKeys.kemPrivate,
      );

      expect(result).toBeNull();
    });
  });

  // ---------- Key Zeroing ----------

  describe('zeroCallKey', () => {
    test('zeroes all bytes of the key', () => {
      const key = generateCallE2EEKey();
      const allNonZero = key.some((b) => b !== 0);
      expect(allNonZero).toBe(true);

      zeroCallKey(key);

      const allZero = key.every((b) => b === 0);
      expect(allZero).toBe(true);
    });

    test('handles null gracefully', () => {
      expect(() => zeroCallKey(null)).not.toThrow();
    });
  });

  // ---------- Determinism / Uniqueness ----------

  describe('security properties', () => {
    test('wrapping the same key for the same recipient produces different ciphertexts', () => {
      const callKey = generateCallE2EEKey();
      const { recipient } = makeRecipient('alice');

      const wrap1 = wrapAndSerializeCallKey(callKey, [recipient]);
      const wrap2 = wrapAndSerializeCallKey(callKey, [recipient]);

      expect(wrap1[0].wrappedKey).not.toBe(wrap2[0].wrappedKey);
      expect(wrap1[0].ephemeralPublicKey).not.toBe(wrap2[0].ephemeralPublicKey);
    });

    test('each recipient gets a unique ephemeral key and ciphertext', () => {
      const callKey = generateCallE2EEKey();
      const alice = makeRecipient('alice');
      const bob = makeRecipient('bob');

      const serialized = wrapAndSerializeCallKey(callKey, [
        alice.recipient,
        bob.recipient,
      ]);

      expect(serialized[0].ephemeralPublicKey).not.toBe(
        serialized[1].ephemeralPublicKey,
      );
      expect(serialized[0].wrappedKey).not.toBe(serialized[1].wrappedKey);
    });
  });
});
