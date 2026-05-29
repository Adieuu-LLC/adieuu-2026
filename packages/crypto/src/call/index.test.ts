/**
 * Tests for call E2EE key derivation and distribution.
 */

import { describe, expect, test } from 'bun:test';
import {
  generateCallKey,
  deriveCallE2EEKey,
  wrapCallKeyForRecipient,
  wrapCallKeyForRecipients,
  unwrapCallKey,
  findAndUnwrapCallKey,
  CALL_KEY_SIZE,
  CALL_E2EE_INFO,
} from './index';
import { generateIdentityKeyBundle, extractPublicKeys } from '../keys';
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
});
