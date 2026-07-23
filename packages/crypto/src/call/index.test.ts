/**
 * Tests for call E2EE key derivation and distribution.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateCallKey,
  deriveCallE2EEKey,
  deriveVoiceChannelMediaKey,
  wrapCallKeyForRecipient,
  wrapCallKeyForRecipients,
  unwrapCallKey,
  findAndUnwrapCallKey,
  CALL_KEY_SIZE,
  CALL_E2EE_INFO,
} from './index';
import { generateIdentityKeyBundle, extractPublicKeys } from '../keys';
import { deriveCommunityCipher, createTextEntropy } from '../ciphers';
import { constantTimeEqual } from '../utils';

describe('call E2EE keys', () => {
  test('CALL constants are defined', () => {
    expect(CALL_KEY_SIZE).toBe(32);
    expect(CALL_E2EE_INFO).toBe('adieuu-call-e2ee-v1');
  });

  test('generateCallKey returns 32 random bytes', () => {
    const a = generateCallKey();
    const b = generateCallKey();
    expect(a).toBeInstanceOf(Uint8Array);
    expect(a.length).toBe(32);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  test('deriveCallE2EEKey is deterministic for same inputs', () => {
    const material = new Uint8Array(32).fill(7);
    const callId = '507f1f77bcf86cd799439012';
    const a = deriveCallE2EEKey(material, callId);
    const b = deriveCallE2EEKey(material, callId);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  test('deriveCallE2EEKey rejects short material', () => {
    expect(() => deriveCallE2EEKey(new Uint8Array(8), 'call-id')).toThrow(
      'Conversation key material must be at least 16 bytes',
    );
  });

  test('deriveVoiceChannelMediaKey is deterministic and channel-bound', () => {
    const cipher = deriveCommunityCipher([createTextEntropy('voice-test-phrase')]);
    const spaceId = '507f1f77bcf86cd799439011';
    const channelA = '507f1f77bcf86cd799439012';
    const channelB = '507f1f77bcf86cd799439013';
    const a1 = deriveVoiceChannelMediaKey(cipher, spaceId, channelA);
    const a2 = deriveVoiceChannelMediaKey(cipher, spaceId, channelA);
    const b = deriveVoiceChannelMediaKey(cipher, spaceId, channelB);
    expect(a1.length).toBe(32);
    expect(constantTimeEqual(a1, a2)).toBe(true);
    expect(constantTimeEqual(a1, b)).toBe(false);
  });

  test('wrap and unwrap round-trip for a recipient', () => {
    const callKey = generateCallKey();
    const recipient = generateIdentityKeyBundle();
    const recipientPublic = extractPublicKeys(recipient);

    const wrapped = wrapCallKeyForRecipient(
      callKey,
      recipientPublic,
      'recipient-identity-id',
    );

    const unwrapped = unwrapCallKey(
      wrapped,
      recipient.ecdh.privateKey,
      recipient.kem.privateKey,
    );

    expect(constantTimeEqual(unwrapped, callKey)).toBe(true);
  });

  test('wrapCallKeyForRecipients produces one wrap per recipient', () => {
    const callKey = generateCallKey();
    const alice = generateIdentityKeyBundle();
    const bob = generateIdentityKeyBundle();

    const wrapped = wrapCallKeyForRecipients(callKey, [
      { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
      { identityId: 'bob', publicKeys: extractPublicKeys(bob) },
    ]);

    expect(wrapped).toHaveLength(2);
    expect(wrapped[0].recipientIdentityId).toBe('alice');
    expect(wrapped[1].recipientIdentityId).toBe('bob');
  });

  test('findAndUnwrapCallKey returns null when no key for recipient', () => {
    const callKey = generateCallKey();
    const alice = generateIdentityKeyBundle();
    const wrapped = wrapCallKeyForRecipient(
      callKey,
      extractPublicKeys(alice),
      'alice',
    );

    const bob = generateIdentityKeyBundle();
    const result = findAndUnwrapCallKey(
      [wrapped],
      'bob',
      bob.ecdh.privateKey,
      bob.kem.privateKey,
    );

    expect(result).toBeNull();
  });

  test('findAndUnwrapCallKey unwraps the matching recipient key', () => {
    const callKey = generateCallKey();
    const alice = generateIdentityKeyBundle();
    const bob = generateIdentityKeyBundle();

    const wrapped = wrapCallKeyForRecipients(callKey, [
      { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
      { identityId: 'bob', publicKeys: extractPublicKeys(bob) },
    ]);

    const unwrapped = findAndUnwrapCallKey(
      wrapped,
      'bob',
      bob.ecdh.privateKey,
      bob.kem.privateKey,
    );

    expect(unwrapped).not.toBeNull();
    expect(constantTimeEqual(unwrapped!, callKey)).toBe(true);
  });

  test('findAndUnwrapCallKey tries all wrapped keys for the same identity (multi-device)', () => {
    const callKey = generateCallKey();
    const device1 = generateIdentityKeyBundle();
    const device2 = generateIdentityKeyBundle();

    const wrapped = [
      wrapCallKeyForRecipient(callKey, extractPublicKeys(device1), 'alice'),
      wrapCallKeyForRecipient(callKey, extractPublicKeys(device2), 'alice'),
    ];

    const unwrapped = findAndUnwrapCallKey(
      wrapped,
      'alice',
      device2.ecdh.privateKey,
      device2.kem.privateKey,
    );

    expect(unwrapped).not.toBeNull();
    expect(constantTimeEqual(unwrapped!, callKey)).toBe(true);
  });

  test('findAndUnwrapCallKey throws when keys exist for the identity but none decrypt', () => {
    const callKey = generateCallKey();
    const alice = generateIdentityKeyBundle();
    const wrapped = wrapCallKeyForRecipient(callKey, extractPublicKeys(alice), 'alice');

    // Wrong device keys for the right identity: exhausts all candidates and
    // all profiles, then surfaces a hard failure (not null).
    const stranger = generateIdentityKeyBundle();
    expect(() =>
      findAndUnwrapCallKey(
        [wrapped],
        'alice',
        stranger.ecdh.privateKey,
        stranger.kem.privateKey,
      ),
    ).toThrow('Failed to unwrap call key');
  });

  test('deriveCallE2EEKey binds the callId: different calls get different keys', () => {
    const material = new Uint8Array(32).fill(9);
    const keyA = deriveCallE2EEKey(material, 'call-a');
    const keyB = deriveCallE2EEKey(material, 'call-b');
    expect(constantTimeEqual(keyA, keyB)).toBe(false);
  });

  test('deriveCallE2EEKey binds the key material: different conversations get different keys', () => {
    const callId = '507f1f77bcf86cd799439012';
    const keyA = deriveCallE2EEKey(new Uint8Array(32).fill(1), callId);
    const keyB = deriveCallE2EEKey(new Uint8Array(32).fill(2), callId);
    expect(constantTimeEqual(keyA, keyB)).toBe(false);
  });

  test('wrapping the same call key twice produces unique ephemeral material and ciphertexts', () => {
    const callKey = generateCallKey();
    const alice = generateIdentityKeyBundle();
    const publicKeys = extractPublicKeys(alice);

    const wrap1 = wrapCallKeyForRecipient(callKey, publicKeys, 'alice');
    const wrap2 = wrapCallKeyForRecipient(callKey, publicKeys, 'alice');

    expect(constantTimeEqual(wrap1.ephemeralPublicKey, wrap2.ephemeralPublicKey)).toBe(false);
    expect(constantTimeEqual(wrap1.wrappedKey, wrap2.wrappedKey)).toBe(false);
    expect(constantTimeEqual(wrap1.wrappingNonce, wrap2.wrappingNonce)).toBe(false);
  });

  test('tampered wrapped call key fails to unwrap', () => {
    const callKey = generateCallKey();
    const alice = generateIdentityKeyBundle();
    const wrapped = wrapCallKeyForRecipient(callKey, extractPublicKeys(alice), 'alice');

    const tamperedKey = new Uint8Array(wrapped.wrappedKey);
    tamperedKey[0]! ^= 0xff;

    expect(() =>
      unwrapCallKey(
        { ...wrapped, wrappedKey: tamperedKey },
        alice.ecdh.privateKey,
        alice.kem.privateKey,
      ),
    ).toThrow();
  });
});
