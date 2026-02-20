/**
 * Sender Key Distribution Module
 *
 * Handles encrypting sender keys for distribution to group members.
 * Uses the same hybrid encryption (X25519 + ML-KEM) as DM session keys.
 *
 * Distribution scenarios:
 * 1. Group creation: Creator distributes their sender key to all members
 * 2. Member joins: All existing members send their sender keys to new member
 * 3. Key rotation: After member removal, all members generate and distribute new keys
 *
 * @module crypto/groups/distribute
 */

import { hybridKeyExchange, hybridDecapsulate } from '../encrypt/hybrid';
import { encrypt, decrypt } from '../encrypt/symmetric';
import { SENDER_KEY_SIZE, createSenderKey } from './senderkey';
import type {
  CryptoProfile,
  IdentityPublicKeys,
  SenderKey,
  WrappedSenderKey,
} from '../types';

/**
 * Wraps a sender key for a single recipient.
 *
 * Uses hybrid encryption (X25519 + ML-KEM) to encrypt the sender key
 * so only the recipient can decrypt it.
 *
 * @param senderKey - The sender key to distribute
 * @param groupId - Group identifier
 * @param ownerIdentityId - Identity ID of the sender key owner
 * @param recipientKeys - Recipient's public keys
 * @param recipientIdentityId - Recipient's identity ID
 * @returns Wrapped sender key for the recipient
 *
 * @example
 * ```typescript
 * // When Alice joins a group, Bob wraps his sender key for her
 * const wrapped = wrapSenderKeyForRecipient(
 *   bobSenderKey,
 *   groupId,
 *   bobIdentityId,
 *   alicePublicKeys,
 *   aliceIdentityId
 * );
 * ```
 */
export function wrapSenderKeyForRecipient(
  senderKey: SenderKey,
  groupId: string,
  ownerIdentityId: string,
  recipientKeys: IdentityPublicKeys,
  recipientIdentityId: string
): WrappedSenderKey {
  if (senderKey.key.length !== SENDER_KEY_SIZE) {
    throw new Error(`Sender key must be ${SENDER_KEY_SIZE} bytes`);
  }

  // Perform hybrid key exchange
  const { sharedSecret, ephemeralPublicKey, kemCiphertext } = hybridKeyExchange(
    recipientKeys.ecdh,
    recipientKeys.kem,
    recipientKeys.profile
  );

  // Encrypt sender key with derived wrapping key
  const { ciphertext: wrappedSenderKey, nonce: wrappingNonce } = encrypt(
    sharedSecret,
    senderKey.key,
    recipientKeys.profile
  );

  return {
    groupId,
    ownerIdentityId,
    recipientIdentityId,
    ephemeralPublicKey,
    kemCiphertext,
    wrappedSenderKey,
    wrappingNonce,
    initialChainIndex: senderKey.chainIndex,
  };
}

/**
 * Wraps a sender key for multiple recipients.
 *
 * @param senderKey - The sender key to distribute
 * @param groupId - Group identifier
 * @param ownerIdentityId - Identity ID of the sender key owner
 * @param recipients - Array of recipient public keys with identity IDs
 * @returns Array of wrapped sender keys, one per recipient
 *
 * @example
 * ```typescript
 * // Distribute sender key to all group members
 * const wrappedKeys = wrapSenderKeyForRecipients(
 *   mySenderKey,
 *   groupId,
 *   myIdentityId,
 *   groupMembers.map(m => ({
 *     identityId: m.identityId,
 *     publicKeys: m.publicKeys
 *   }))
 * );
 * ```
 */
export function wrapSenderKeyForRecipients(
  senderKey: SenderKey,
  groupId: string,
  ownerIdentityId: string,
  recipients: Array<{ identityId: string; publicKeys: IdentityPublicKeys }>
): WrappedSenderKey[] {
  return recipients.map(({ identityId, publicKeys }) =>
    wrapSenderKeyForRecipient(senderKey, groupId, ownerIdentityId, publicKeys, identityId)
  );
}

/**
 * Unwraps a sender key received from another group member.
 *
 * @param wrappedKey - Wrapped sender key from the owner
 * @param ecdhPrivate - Recipient's X25519 private key
 * @param kemPrivate - Recipient's ML-KEM private key
 * @param profile - Crypto profile
 * @returns Unwrapped sender key
 *
 * @example
 * ```typescript
 * // Alice receives Bob's wrapped sender key
 * const bobSenderKey = unwrapSenderKey(
 *   wrappedBobKey,
 *   aliceKeys.ecdh.privateKey,
 *   aliceKeys.kem.privateKey
 * );
 *
 * // Now Alice can decrypt messages from Bob
 * const messageKey = deriveMessageKey(bobSenderKey.key, message.chainIndex);
 * ```
 */
export function unwrapSenderKey(
  wrappedKey: WrappedSenderKey,
  ecdhPrivate: Uint8Array,
  kemPrivate: Uint8Array,
  profile: CryptoProfile = 'default'
): SenderKey {
  // Decapsulate to get shared secret
  const sharedSecret = hybridDecapsulate(
    ecdhPrivate,
    kemPrivate,
    wrappedKey.ephemeralPublicKey,
    wrappedKey.kemCiphertext,
    profile
  );

  // Decrypt sender key
  const senderKeyBytes = decrypt(
    sharedSecret,
    wrappedKey.wrappedSenderKey,
    wrappedKey.wrappingNonce,
    profile
  );

  return createSenderKey(senderKeyBytes, wrappedKey.initialChainIndex);
}

/**
 * Finds and unwraps a sender key for a given recipient identity.
 *
 * @param wrappedKeys - Array of wrapped sender keys
 * @param recipientIdentityId - Identity ID of the recipient
 * @param ecdhPrivate - Recipient's X25519 private key
 * @param kemPrivate - Recipient's ML-KEM private key
 * @param profile - Crypto profile
 * @returns Unwrapped sender key with owner info, or null if not found
 *
 * @example
 * ```typescript
 * const result = findAndUnwrapSenderKey(
 *   receivedWrappedKeys,
 *   myIdentityId,
 *   myKeys.ecdh.privateKey,
 *   myKeys.kem.privateKey
 * );
 *
 * if (result) {
 *   storeSenderKey(result.ownerIdentityId, result.senderKey);
 * }
 * ```
 */
export function findAndUnwrapSenderKey(
  wrappedKeys: WrappedSenderKey[],
  recipientIdentityId: string,
  ecdhPrivate: Uint8Array,
  kemPrivate: Uint8Array,
  profile: CryptoProfile = 'default'
): { ownerIdentityId: string; groupId: string; senderKey: SenderKey } | null {
  const wrappedKey = wrappedKeys.find((wk) => wk.recipientIdentityId === recipientIdentityId);
  if (!wrappedKey) {
    return null;
  }

  const senderKey = unwrapSenderKey(wrappedKey, ecdhPrivate, kemPrivate, profile);

  return {
    ownerIdentityId: wrappedKey.ownerIdentityId,
    groupId: wrappedKey.groupId,
    senderKey,
  };
}

/**
 * Result of preparing sender keys for a new group member.
 */
export interface MemberJoinKeyDistribution {
  /** Wrapped sender keys from all existing members to the new member */
  wrappedKeysForNewMember: WrappedSenderKey[];
  /** The new member should generate their own sender key and distribute */
}

/**
 * Prepares sender key distribution for when a new member joins.
 *
 * All existing members wrap their sender keys for the new member.
 *
 * @param existingMembers - Array of existing members with their sender keys
 * @param newMemberKeys - New member's public keys
 * @param newMemberIdentityId - New member's identity ID
 * @param groupId - Group identifier
 * @returns Wrapped keys for the new member
 *
 * @example
 * ```typescript
 * // When Alice joins the group
 * const distribution = prepareKeysForNewMember(
 *   [
 *     { identityId: 'bob', senderKey: bobSenderKey },
 *     { identityId: 'carol', senderKey: carolSenderKey },
 *   ],
 *   alicePublicKeys,
 *   'alice',
 *   groupId
 * );
 *
 * // Send distribution.wrappedKeysForNewMember to Alice
 * ```
 */
export function prepareKeysForNewMember(
  existingMembers: Array<{ identityId: string; senderKey: SenderKey }>,
  newMemberKeys: IdentityPublicKeys,
  newMemberIdentityId: string,
  groupId: string
): MemberJoinKeyDistribution {
  const wrappedKeysForNewMember = existingMembers.map((member) =>
    wrapSenderKeyForRecipient(
      member.senderKey,
      groupId,
      member.identityId,
      newMemberKeys,
      newMemberIdentityId
    )
  );

  return { wrappedKeysForNewMember };
}
