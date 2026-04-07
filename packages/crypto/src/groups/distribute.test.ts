import { describe, expect, test } from 'bun:test';

import {
  wrapSenderKeyForRecipient,
  wrapSenderKeyForRecipients,
  unwrapSenderKey,
  findAndUnwrapSenderKey,
  prepareKeysForNewMember,
} from './distribute';
import { generateSenderKey, SENDER_KEY_SIZE } from './senderkey';
import {
  generateIdentityKeyBundle,
  extractPublicKeys,
  generateECDHKeyPair,
  generateKEMKeyPair,
} from '../keys';
import { constantTimeEqual } from '../utils';

describe('groups/distribute', () => {
  describe('wrapSenderKeyForRecipient', () => {
    test('wraps sender key successfully', () => {
      const recipient = generateIdentityKeyBundle();
      const recipientKeys = extractPublicKeys(recipient);
      const senderKey = generateSenderKey();

      const wrapped = wrapSenderKeyForRecipient(
        senderKey,
        'group-123',
        'owner-alice',
        recipientKeys,
        'recipient-bob'
      );

      expect(wrapped.groupId).toBe('group-123');
      expect(wrapped.ownerIdentityId).toBe('owner-alice');
      expect(wrapped.recipientIdentityId).toBe('recipient-bob');
      expect(wrapped.ephemeralPublicKey).toBeInstanceOf(Uint8Array);
      expect(wrapped.kemCiphertext).toBeInstanceOf(Uint8Array);
      expect(wrapped.wrappedSenderKey).toBeInstanceOf(Uint8Array);
      expect(wrapped.wrappingNonce).toBeInstanceOf(Uint8Array);
      expect(wrapped.initialChainIndex).toBe(0);
    });

    test('preserves chain index', () => {
      const recipient = generateIdentityKeyBundle();
      const recipientKeys = extractPublicKeys(recipient);
      const senderKey = generateSenderKey(42);

      const wrapped = wrapSenderKeyForRecipient(
        senderKey,
        'group-123',
        'owner',
        recipientKeys,
        'recipient'
      );

      expect(wrapped.initialChainIndex).toBe(42);
    });

    test('wrappedSenderKey is encrypted (not plaintext)', () => {
      const recipient = generateIdentityKeyBundle();
      const recipientKeys = extractPublicKeys(recipient);
      const senderKey = generateSenderKey();

      const wrapped = wrapSenderKeyForRecipient(
        senderKey,
        'group',
        'owner',
        recipientKeys,
        'recipient'
      );

      // Wrapped key should be larger than original (includes auth tag)
      expect(wrapped.wrappedSenderKey.length).toBe(SENDER_KEY_SIZE + 16);
      expect(
        constantTimeEqual(wrapped.wrappedSenderKey.slice(0, SENDER_KEY_SIZE), senderKey.key)
      ).toBe(false);
    });

    test('different wraps produce different ciphertext', () => {
      const recipient = generateIdentityKeyBundle();
      const recipientKeys = extractPublicKeys(recipient);
      const senderKey = generateSenderKey();

      const wrapped1 = wrapSenderKeyForRecipient(
        senderKey,
        'group',
        'owner',
        recipientKeys,
        'recipient'
      );
      const wrapped2 = wrapSenderKeyForRecipient(
        senderKey,
        'group',
        'owner',
        recipientKeys,
        'recipient'
      );

      expect(constantTimeEqual(wrapped1.wrappedSenderKey, wrapped2.wrappedSenderKey)).toBe(false);
    });
  });

  describe('unwrapSenderKey', () => {
    test('unwraps to original sender key', () => {
      const recipient = generateIdentityKeyBundle();
      const recipientKeys = extractPublicKeys(recipient);
      const originalSenderKey = generateSenderKey();

      const wrapped = wrapSenderKeyForRecipient(
        originalSenderKey,
        'group',
        'owner',
        recipientKeys,
        'recipient'
      );

      const unwrapped = unwrapSenderKey(
        wrapped,
        recipient.ecdh.privateKey,
        recipient.kem.privateKey
      );

      expect(constantTimeEqual(unwrapped.key, originalSenderKey.key)).toBe(true);
      expect(unwrapped.chainIndex).toBe(originalSenderKey.chainIndex);
    });

    test('preserves chain index through wrap/unwrap', () => {
      const recipient = generateIdentityKeyBundle();
      const recipientKeys = extractPublicKeys(recipient);
      const originalSenderKey = generateSenderKey(100);

      const wrapped = wrapSenderKeyForRecipient(
        originalSenderKey,
        'group',
        'owner',
        recipientKeys,
        'recipient'
      );

      const unwrapped = unwrapSenderKey(
        wrapped,
        recipient.ecdh.privateKey,
        recipient.kem.privateKey
      );

      expect(unwrapped.chainIndex).toBe(100);
    });

    test('works with default profile', () => {
      const recipient = generateIdentityKeyBundle('default');
      const recipientKeys = extractPublicKeys(recipient);
      const originalSenderKey = generateSenderKey();

      const wrapped = wrapSenderKeyForRecipient(
        originalSenderKey,
        'group',
        'owner',
        recipientKeys,
        'recipient'
      );

      const unwrapped = unwrapSenderKey(
        wrapped,
        recipient.ecdh.privateKey,
        recipient.kem.privateKey,
        'default'
      );

      expect(constantTimeEqual(unwrapped.key, originalSenderKey.key)).toBe(true);
    });

    test('works with cnsa2 profile', () => {
      const recipient = generateIdentityKeyBundle('cnsa2');
      const recipientKeys = extractPublicKeys(recipient);
      const originalSenderKey = generateSenderKey();

      const wrapped = wrapSenderKeyForRecipient(
        originalSenderKey,
        'group',
        'owner',
        recipientKeys,
        'recipient'
      );

      const unwrapped = unwrapSenderKey(
        wrapped,
        recipient.ecdh.privateKey,
        recipient.kem.privateKey,
        'cnsa2'
      );

      expect(constantTimeEqual(unwrapped.key, originalSenderKey.key)).toBe(true);
    });

    test('throws with wrong ECDH private key', () => {
      const recipient = generateIdentityKeyBundle();
      const wrongEcdh = generateECDHKeyPair();
      const recipientKeys = extractPublicKeys(recipient);
      const senderKey = generateSenderKey();

      const wrapped = wrapSenderKeyForRecipient(
        senderKey,
        'group',
        'owner',
        recipientKeys,
        'recipient'
      );

      expect(() =>
        unwrapSenderKey(wrapped, wrongEcdh.privateKey, recipient.kem.privateKey)
      ).toThrow();
    });

    test('throws with wrong KEM private key', () => {
      const recipient = generateIdentityKeyBundle();
      const wrongKem = generateKEMKeyPair();
      const recipientKeys = extractPublicKeys(recipient);
      const senderKey = generateSenderKey();

      const wrapped = wrapSenderKeyForRecipient(
        senderKey,
        'group',
        'owner',
        recipientKeys,
        'recipient'
      );

      expect(() =>
        unwrapSenderKey(wrapped, recipient.ecdh.privateKey, wrongKem.privateKey)
      ).toThrow();
    });

    test('throws when decrypting with mismatched profile', () => {
      const recipient = generateIdentityKeyBundle('cnsa2');
      const recipientKeys = extractPublicKeys(recipient);
      const senderKey = generateSenderKey();
      const wrapped = wrapSenderKeyForRecipient(
        senderKey,
        'group',
        'owner',
        recipientKeys,
        'recipient'
      );

      expect(() =>
        unwrapSenderKey(
          wrapped,
          recipient.ecdh.privateKey,
          recipient.kem.privateKey,
          'default'
        )
      ).toThrow();
    });
  });

  describe('wrapSenderKeyForRecipients', () => {
    test('wraps for multiple recipients', () => {
      const alice = generateIdentityKeyBundle();
      const bob = generateIdentityKeyBundle();
      const senderKey = generateSenderKey();

      const recipients = [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
        { identityId: 'bob', publicKeys: extractPublicKeys(bob) },
      ];

      const wrappedKeys = wrapSenderKeyForRecipients(
        senderKey,
        'group-123',
        'owner-carol',
        recipients
      );

      expect(wrappedKeys.length).toBe(2);
      expect(wrappedKeys[0]!.recipientIdentityId).toBe('alice');
      expect(wrappedKeys[1]!.recipientIdentityId).toBe('bob');
      expect(wrappedKeys[0]!.ownerIdentityId).toBe('owner-carol');
      expect(wrappedKeys[0]!.groupId).toBe('group-123');
    });

    test('each recipient can unwrap', () => {
      const alice = generateIdentityKeyBundle();
      const bob = generateIdentityKeyBundle();
      const senderKey = generateSenderKey();

      const recipients = [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
        { identityId: 'bob', publicKeys: extractPublicKeys(bob) },
      ];

      const wrappedKeys = wrapSenderKeyForRecipients(senderKey, 'group', 'owner', recipients);

      const aliceUnwrapped = unwrapSenderKey(
        wrappedKeys[0]!,
        alice.ecdh.privateKey,
        alice.kem.privateKey
      );
      expect(constantTimeEqual(aliceUnwrapped.key, senderKey.key)).toBe(true);

      const bobUnwrapped = unwrapSenderKey(
        wrappedKeys[1]!,
        bob.ecdh.privateKey,
        bob.kem.privateKey
      );
      expect(constantTimeEqual(bobUnwrapped.key, senderKey.key)).toBe(true);
    });

    test('handles empty recipients array', () => {
      const senderKey = generateSenderKey();
      const wrappedKeys = wrapSenderKeyForRecipients(senderKey, 'group', 'owner', []);

      expect(wrappedKeys.length).toBe(0);
    });

    test('handles many recipients', () => {
      const senderKey = generateSenderKey();
      const recipients = Array.from({ length: 30 }, (_, i) => ({
        identityId: `user-${i}`,
        publicKeys: extractPublicKeys(generateIdentityKeyBundle()),
      }));

      const wrappedKeys = wrapSenderKeyForRecipients(senderKey, 'group', 'owner', recipients);

      expect(wrappedKeys.length).toBe(30);
    });
  });

  describe('findAndUnwrapSenderKey', () => {
    test('finds and unwraps correct key', () => {
      const alice = generateIdentityKeyBundle();
      const bob = generateIdentityKeyBundle();
      const senderKey = generateSenderKey();

      const recipients = [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
        { identityId: 'bob', publicKeys: extractPublicKeys(bob) },
      ];

      const wrappedKeys = wrapSenderKeyForRecipients(senderKey, 'group', 'owner', recipients);

      const result = findAndUnwrapSenderKey(
        wrappedKeys,
        'bob',
        bob.ecdh.privateKey,
        bob.kem.privateKey
      );

      expect(result).not.toBeNull();
      expect(result!.ownerIdentityId).toBe('owner');
      expect(result!.groupId).toBe('group');
      expect(constantTimeEqual(result!.senderKey.key, senderKey.key)).toBe(true);
    });

    test('returns null for unknown identity', () => {
      const alice = generateIdentityKeyBundle();
      const senderKey = generateSenderKey();

      const wrappedKeys = wrapSenderKeyForRecipients(senderKey, 'group', 'owner', [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
      ]);

      const result = findAndUnwrapSenderKey(
        wrappedKeys,
        'unknown',
        alice.ecdh.privateKey,
        alice.kem.privateKey
      );

      expect(result).toBeNull();
    });

    test('returns null for empty wrapped keys array', () => {
      const alice = generateIdentityKeyBundle();

      const result = findAndUnwrapSenderKey(
        [],
        'alice',
        alice.ecdh.privateKey,
        alice.kem.privateKey
      );

      expect(result).toBeNull();
    });
  });

  describe('prepareKeysForNewMember', () => {
    test('wraps all existing sender keys for new member', () => {
      const alice = generateIdentityKeyBundle();
      const bob = generateIdentityKeyBundle();
      const carol = generateIdentityKeyBundle(); // New member

      const aliceSenderKey = generateSenderKey();
      const bobSenderKey = generateSenderKey();

      const existingMembers = [
        { identityId: 'alice', senderKey: aliceSenderKey },
        { identityId: 'bob', senderKey: bobSenderKey },
      ];

      const distribution = prepareKeysForNewMember(
        existingMembers,
        extractPublicKeys(carol),
        'carol',
        'group-123'
      );

      expect(distribution.wrappedKeysForNewMember.length).toBe(2);

      // Carol can unwrap both keys
      const aliceKeyForCarol = distribution.wrappedKeysForNewMember.find(
        (wk) => wk.ownerIdentityId === 'alice'
      );
      const bobKeyForCarol = distribution.wrappedKeysForNewMember.find(
        (wk) => wk.ownerIdentityId === 'bob'
      );

      expect(aliceKeyForCarol).toBeDefined();
      expect(bobKeyForCarol).toBeDefined();
      expect(aliceKeyForCarol!.recipientIdentityId).toBe('carol');
      expect(bobKeyForCarol!.recipientIdentityId).toBe('carol');

      // Unwrap and verify
      const aliceUnwrapped = unwrapSenderKey(
        aliceKeyForCarol!,
        carol.ecdh.privateKey,
        carol.kem.privateKey
      );
      expect(constantTimeEqual(aliceUnwrapped.key, aliceSenderKey.key)).toBe(true);

      const bobUnwrapped = unwrapSenderKey(
        bobKeyForCarol!,
        carol.ecdh.privateKey,
        carol.kem.privateKey
      );
      expect(constantTimeEqual(bobUnwrapped.key, bobSenderKey.key)).toBe(true);
    });

    test('handles empty existing members', () => {
      const newMember = generateIdentityKeyBundle();

      const distribution = prepareKeysForNewMember(
        [],
        extractPublicKeys(newMember),
        'new-member',
        'group'
      );

      expect(distribution.wrappedKeysForNewMember.length).toBe(0);
    });
  });

  describe('end-to-end group messaging simulation', () => {
    test('complete group creation and messaging flow', () => {
      // Step 1: Create group with 3 members
      const alice = generateIdentityKeyBundle();
      const bob = generateIdentityKeyBundle();
      const carol = generateIdentityKeyBundle();

      // Step 2: Each member generates their sender key
      const aliceSenderKey = generateSenderKey();
      const bobSenderKey = generateSenderKey();
      const carolSenderKey = generateSenderKey();

      // Step 3: Distribute sender keys to all members
      const aliceDistribution = wrapSenderKeyForRecipients(aliceSenderKey, 'group', 'alice', [
        { identityId: 'bob', publicKeys: extractPublicKeys(bob) },
        { identityId: 'carol', publicKeys: extractPublicKeys(carol) },
      ]);

      const bobDistribution = wrapSenderKeyForRecipients(bobSenderKey, 'group', 'bob', [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
        { identityId: 'carol', publicKeys: extractPublicKeys(carol) },
      ]);

      const carolDistribution = wrapSenderKeyForRecipients(carolSenderKey, 'group', 'carol', [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
        { identityId: 'bob', publicKeys: extractPublicKeys(bob) },
      ]);

      // Step 4: Bob receives Alice's sender key
      const aliceKeyForBob = findAndUnwrapSenderKey(
        aliceDistribution,
        'bob',
        bob.ecdh.privateKey,
        bob.kem.privateKey
      );
      expect(aliceKeyForBob).not.toBeNull();
      expect(constantTimeEqual(aliceKeyForBob!.senderKey.key, aliceSenderKey.key)).toBe(true);

      // Step 5: Carol receives Bob's sender key
      const bobKeyForCarol = findAndUnwrapSenderKey(
        bobDistribution,
        'carol',
        carol.ecdh.privateKey,
        carol.kem.privateKey
      );
      expect(bobKeyForCarol).not.toBeNull();
      expect(constantTimeEqual(bobKeyForCarol!.senderKey.key, bobSenderKey.key)).toBe(true);

      // Step 6: Verify all members have all keys
      expect(aliceDistribution.length).toBe(2); // Alice sends to Bob, Carol
      expect(bobDistribution.length).toBe(2); // Bob sends to Alice, Carol
      expect(carolDistribution.length).toBe(2); // Carol sends to Alice, Bob
    });

    test('member joins existing group', () => {
      // Initial group: Alice and Bob
      const alice = generateIdentityKeyBundle();
      const bob = generateIdentityKeyBundle();
      const aliceSenderKey = generateSenderKey();
      const bobSenderKey = generateSenderKey();

      // Dave joins
      const dave = generateIdentityKeyBundle();

      // Prepare keys for Dave
      const keysForDave = prepareKeysForNewMember(
        [
          { identityId: 'alice', senderKey: aliceSenderKey },
          { identityId: 'bob', senderKey: bobSenderKey },
        ],
        extractPublicKeys(dave),
        'dave',
        'group'
      );

      expect(keysForDave.wrappedKeysForNewMember.length).toBe(2);

      // Dave unwraps and stores all keys
      for (const wrapped of keysForDave.wrappedKeysForNewMember) {
        const unwrapped = unwrapSenderKey(
          wrapped,
          dave.ecdh.privateKey,
          dave.kem.privateKey
        );

        if (wrapped.ownerIdentityId === 'alice') {
          expect(constantTimeEqual(unwrapped.key, aliceSenderKey.key)).toBe(true);
        } else if (wrapped.ownerIdentityId === 'bob') {
          expect(constantTimeEqual(unwrapped.key, bobSenderKey.key)).toBe(true);
        }
      }

      // Dave generates and distributes their own sender key
      const daveSenderKey = generateSenderKey();
      const daveDistribution = wrapSenderKeyForRecipients(daveSenderKey, 'group', 'dave', [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
        { identityId: 'bob', publicKeys: extractPublicKeys(bob) },
      ]);

      expect(daveDistribution.length).toBe(2);
    });

    test('member removal triggers key rotation', () => {
      // Group: Alice, Bob, Eve (who will be removed)
      const alice = generateIdentityKeyBundle();
      const bob = generateIdentityKeyBundle();

      // Old sender keys (compromised because Eve had them)
      const oldAliceSenderKey = generateSenderKey();
      const oldBobSenderKey = generateSenderKey();

      // After removing Eve, Alice and Bob generate NEW sender keys
      const newAliceSenderKey = generateSenderKey();
      const newBobSenderKey = generateSenderKey();

      // Verify old and new keys are different
      expect(constantTimeEqual(oldAliceSenderKey.key, newAliceSenderKey.key)).toBe(false);
      expect(constantTimeEqual(oldBobSenderKey.key, newBobSenderKey.key)).toBe(false);

      // Distribute new keys (Eve not included)
      const aliceNewDistribution = wrapSenderKeyForRecipients(newAliceSenderKey, 'group', 'alice', [
        { identityId: 'bob', publicKeys: extractPublicKeys(bob) },
        // Eve NOT included
      ]);

      const bobNewDistribution = wrapSenderKeyForRecipients(newBobSenderKey, 'group', 'bob', [
        { identityId: 'alice', publicKeys: extractPublicKeys(alice) },
        // Eve NOT included
      ]);

      expect(aliceNewDistribution.length).toBe(1); // Only Bob
      expect(bobNewDistribution.length).toBe(1); // Only Alice

      // Bob can still decrypt Alice's new sender key
      const aliceKeyForBob = findAndUnwrapSenderKey(
        aliceNewDistribution,
        'bob',
        bob.ecdh.privateKey,
        bob.kem.privateKey
      );
      expect(aliceKeyForBob).not.toBeNull();
      expect(constantTimeEqual(aliceKeyForBob!.senderKey.key, newAliceSenderKey.key)).toBe(true);
    });
  });
});
