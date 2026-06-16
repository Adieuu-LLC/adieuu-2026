/**
 * End-to-end integration test for call E2EE key lifecycle.
 *
 * Simulates the full flow: generate -> wrap for N recipients ->
 * serialize to JSON (API transport) -> deserialize -> unwrap.
 *
 * This test verifies the complete data path that would occur in production:
 * 1. Initiator generates call key
 * 2. Initiator wraps for all participants via hybrid encryption
 * 3. Wrapped keys are serialized to base64 JSON (API request body)
 * 4. Server stores and returns the JSON (simulated by JSON.parse(JSON.stringify()))
 * 5. Joiner deserializes and unwraps their copy
 * 6. Both parties hold the same 32-byte symmetric key
 */

import { describe, expect, test } from 'bun:test';
import {
  generateCallKey,
  wrapCallKeyForRecipient,
  wrapCallKeyForRecipients,
  unwrapCallKey,
  findAndUnwrapCallKey,
  generateIdentityKeyBundle,
  extractPublicKeys,
  toBase64,
  fromBase64,
  constantTimeEqual,
  clearBytes,
  CALL_KEY_SIZE,
  type WrappedCallKey,
} from '../index';

interface SerializedWrappedCallKey {
  recipientIdentityId: string;
  ephemeralPublicKey: string;
  kemCiphertext: string;
  wrappedKey: string;
  wrappingNonce: string;
}

function serializeWrappedCallKeys(keys: WrappedCallKey[]): SerializedWrappedCallKey[] {
  return keys.map((k) => ({
    recipientIdentityId: k.recipientIdentityId,
    ephemeralPublicKey: toBase64(k.ephemeralPublicKey),
    kemCiphertext: toBase64(k.kemCiphertext),
    wrappedKey: toBase64(k.wrappedKey),
    wrappingNonce: toBase64(k.wrappingNonce),
  }));
}

function deserializeWrappedCallKeys(serialized: SerializedWrappedCallKey[]): WrappedCallKey[] {
  return serialized.map((s) => ({
    recipientIdentityId: s.recipientIdentityId,
    ephemeralPublicKey: fromBase64(s.ephemeralPublicKey),
    kemCiphertext: fromBase64(s.kemCiphertext),
    wrappedKey: fromBase64(s.wrappedKey),
    wrappingNonce: fromBase64(s.wrappingNonce),
  }));
}

describe('call E2EE integration', () => {
  test('full lifecycle: generate -> wrap -> JSON serialize -> JSON deserialize -> unwrap', () => {
    const callKey = generateCallKey();
    expect(callKey.length).toBe(CALL_KEY_SIZE);

    const alice = generateIdentityKeyBundle();
    const bob = generateIdentityKeyBundle();
    const carol = generateIdentityKeyBundle();

    const wrappedKeys = wrapCallKeyForRecipients(callKey, [
      { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
      { identityId: 'bob', publicKeys: extractPublicKeys(bob) },
      { identityId: 'carol', publicKeys: extractPublicKeys(carol) },
    ]);
    expect(wrappedKeys).toHaveLength(3);

    // Simulate API transport: serialize to JSON, then parse back
    const serialized = serializeWrappedCallKeys(wrappedKeys);
    const jsonString = JSON.stringify(serialized);
    const parsed: SerializedWrappedCallKey[] = JSON.parse(jsonString);
    const deserialized = deserializeWrappedCallKeys(parsed);

    // Each participant unwraps their key
    const aliceKey = findAndUnwrapCallKey(
      deserialized, 'alice', alice.ecdh.privateKey, alice.kem.privateKey,
    );
    const bobKey = findAndUnwrapCallKey(
      deserialized, 'bob', bob.ecdh.privateKey, bob.kem.privateKey,
    );
    const carolKey = findAndUnwrapCallKey(
      deserialized, 'carol', carol.ecdh.privateKey, carol.kem.privateKey,
    );

    expect(aliceKey).not.toBeNull();
    expect(bobKey).not.toBeNull();
    expect(carolKey).not.toBeNull();

    expect(constantTimeEqual(aliceKey!, callKey)).toBe(true);
    expect(constantTimeEqual(bobKey!, callKey)).toBe(true);
    expect(constantTimeEqual(carolKey!, callKey)).toBe(true);
  });

  test('non-participant cannot unwrap', () => {
    const callKey = generateCallKey();
    const alice = generateIdentityKeyBundle();
    const eve = generateIdentityKeyBundle();

    const wrappedKeys = wrapCallKeyForRecipients(callKey, [
      { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
    ]);

    const serialized = serializeWrappedCallKeys(wrappedKeys);
    const jsonString = JSON.stringify(serialized);
    const parsed = JSON.parse(jsonString) as SerializedWrappedCallKey[];
    const deserialized = deserializeWrappedCallKeys(parsed);

    // Eve's identity ID is not in the wrapped keys
    const eveKey = findAndUnwrapCallKey(
      deserialized, 'eve', eve.ecdh.privateKey, eve.kem.privateKey,
    );
    expect(eveKey).toBeNull();
  });

  test('wrong private keys produce decryption failure', () => {
    const callKey = generateCallKey();
    const alice = generateIdentityKeyBundle();
    const eve = generateIdentityKeyBundle();

    const wrappedKeys = wrapCallKeyForRecipients(callKey, [
      { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
    ]);

    const serialized = serializeWrappedCallKeys(wrappedKeys);
    const deserialized = deserializeWrappedCallKeys(serialized);

    // Eve tries to use alice's identity ID but her own keys
    expect(() =>
      findAndUnwrapCallKey(
        deserialized, 'alice', eve.ecdh.privateKey, eve.kem.privateKey,
      )
    ).toThrow();
  });

  test('key zeroing clears all bytes', () => {
    const callKey = generateCallKey();
    expect(callKey.some((b) => b !== 0)).toBe(true);

    clearBytes(callKey);
    expect(callKey.every((b) => b === 0)).toBe(true);
  });

  test('serialized keys survive JSON.parse -> JSON.stringify -> JSON.parse cycle', () => {
    const callKey = generateCallKey();
    const alice = generateIdentityKeyBundle();

    const wrapped = wrapCallKeyForRecipient(
      callKey,
      extractPublicKeys(alice),
      'alice',
    );

    const serialized = serializeWrappedCallKeys([wrapped]);
    const cycled = JSON.parse(JSON.stringify(JSON.parse(JSON.stringify(serialized))));
    const deserialized = deserializeWrappedCallKeys(cycled);

    const unwrapped = unwrapCallKey(
      deserialized[0],
      alice.ecdh.privateKey,
      alice.kem.privateKey,
    );

    expect(constantTimeEqual(unwrapped, callKey)).toBe(true);
  });

  test('wrapping produces unique ciphertext for each call', () => {
    const key1 = generateCallKey();
    const key2 = generateCallKey();
    const alice = generateIdentityKeyBundle();
    const alicePub = extractPublicKeys(alice);

    const wrap1 = wrapCallKeyForRecipient(key1, alicePub, 'alice');
    const wrap2 = wrapCallKeyForRecipient(key2, alicePub, 'alice');

    const s1 = serializeWrappedCallKeys([wrap1]);
    const s2 = serializeWrappedCallKeys([wrap2]);

    expect(s1[0].wrappedKey).not.toBe(s2[0].wrappedKey);
    expect(s1[0].ephemeralPublicKey).not.toBe(s2[0].ephemeralPublicKey);
    expect(s1[0].kemCiphertext).not.toBe(s2[0].kemCiphertext);
  });

  test('large participant count (20 recipients)', () => {
    const callKey = generateCallKey();
    const participants = Array.from({ length: 20 }, (_, i) => ({
      id: `participant-${i}`,
      bundle: generateIdentityKeyBundle(),
    }));

    const wrappedKeys = wrapCallKeyForRecipients(
      callKey,
      participants.map((p) => ({
        identityId: p.id,
        publicKeys: extractPublicKeys(p.bundle),
      })),
    );
    expect(wrappedKeys).toHaveLength(20);

    const serialized = serializeWrappedCallKeys(wrappedKeys);
    const jsonString = JSON.stringify(serialized);
    expect(jsonString.length).toBeGreaterThan(0);

    const deserialized = deserializeWrappedCallKeys(JSON.parse(jsonString));

    // Verify a random subset can unwrap
    for (const idx of [0, 5, 10, 15, 19]) {
      const p = participants[idx];
      const key = findAndUnwrapCallKey(
        deserialized, p.id, p.bundle.ecdh.privateKey, p.bundle.kem.privateKey,
      );
      expect(key).not.toBeNull();
      expect(constantTimeEqual(key!, callKey)).toBe(true);
    }
  });
});
