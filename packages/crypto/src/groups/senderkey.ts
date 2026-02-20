/**
 * Sender Key Module for Group Chat Encryption
 *
 * Implements the Sender Keys protocol for efficient group messaging.
 * Each group member has a symmetric "sender key" that they use to encrypt
 * messages. Other members hold copies of this key to decrypt.
 *
 * Benefits over per-message fan-out:
 * - O(1) encryption per message (vs O(N) for fan-out)
 * - Much smaller message sizes in large groups
 *
 * Key rotation:
 * - Member joins: Distribute existing sender keys to new member
 * - Member removed: ALL members generate new sender keys
 *
 * @module crypto/groups/senderkey
 */

import { randomBytes } from '../utils';
import { deriveKey, KDF_INFO } from '../kdf';
import type { CryptoProfile, SenderKey } from '../types';

/**
 * Sender key size (256 bits).
 */
export const SENDER_KEY_SIZE = 32;

/**
 * Info string for sender key message derivation.
 */
export const SENDER_KEY_MESSAGE_INFO = 'adieuu-sender-key-message-v1';

/**
 * Generates a new sender key for group messaging.
 *
 * Each group member generates their own sender key when:
 * - Creating a new group
 * - Joining a group
 * - After a member is removed (key rotation)
 *
 * @param initialChainIndex - Starting chain index (default: 0)
 * @returns New sender key with chain index
 *
 * @example
 * ```typescript
 * // When joining a group, generate your sender key
 * const mySenderKey = generateSenderKey();
 *
 * // Distribute to other members using wrapSenderKeyForRecipients()
 * ```
 */
export function generateSenderKey(initialChainIndex = 0): SenderKey {
  return {
    key: randomBytes(SENDER_KEY_SIZE),
    chainIndex: initialChainIndex,
  };
}

/**
 * Derives a message encryption key from a sender key and chain index.
 *
 * Each message uses a unique key derived from the sender key and an
 * incrementing chain index. This provides:
 * - Unique key per message
 * - Forward secrecy within the sender key epoch
 * - Efficient key derivation
 *
 * @param senderKey - The sender key material (32 bytes)
 * @param chainIndex - Message chain index
 * @param profile - Crypto profile
 * @returns 32-byte message encryption key
 *
 * @example
 * ```typescript
 * // Encrypt a message
 * const messageKey = deriveMessageKey(mySenderKey.key, mySenderKey.chainIndex);
 * const { ciphertext, nonce } = encrypt(messageKey, plaintext);
 *
 * // Increment chain index for next message
 * mySenderKey.chainIndex++;
 * ```
 */
export function deriveMessageKey(
  senderKey: Uint8Array,
  chainIndex: number,
  profile: CryptoProfile = 'default'
): Uint8Array {
  if (senderKey.length !== SENDER_KEY_SIZE) {
    throw new Error(`Sender key must be ${SENDER_KEY_SIZE} bytes`);
  }
  if (chainIndex < 0 || !Number.isInteger(chainIndex)) {
    throw new Error('Chain index must be a non-negative integer');
  }

  // Convert chain index to bytes (big-endian, 8 bytes for large groups)
  const indexBytes = new Uint8Array(8);
  const view = new DataView(indexBytes.buffer);
  // Use two 32-bit writes for compatibility (no BigInt needed)
  view.setUint32(0, Math.floor(chainIndex / 0x100000000), false);
  view.setUint32(4, chainIndex >>> 0, false);

  return deriveKey(
    {
      ikm: senderKey,
      salt: indexBytes,
      info: SENDER_KEY_MESSAGE_INFO,
      length: 32,
    },
    profile
  );
}

/**
 * Advances the sender key chain index and returns the message key.
 *
 * This is a convenience function that derives the message key and
 * increments the chain index atomically.
 *
 * @param senderKey - Sender key (will be mutated - chainIndex incremented)
 * @param profile - Crypto profile
 * @returns Message encryption key for the current chain index
 *
 * @example
 * ```typescript
 * // Send a message
 * const messageKey = advanceAndDeriveMessageKey(mySenderKey);
 * const { ciphertext, nonce } = encrypt(messageKey, plaintext);
 *
 * // mySenderKey.chainIndex is now incremented
 * ```
 */
export function advanceAndDeriveMessageKey(
  senderKey: SenderKey,
  profile: CryptoProfile = 'default'
): Uint8Array {
  const messageKey = deriveMessageKey(senderKey.key, senderKey.chainIndex, profile);
  senderKey.chainIndex++;
  return messageKey;
}

/**
 * Creates a copy of a sender key with a specific chain index.
 *
 * Useful when receiving sender keys from other members - you want
 * to track their chain index separately.
 *
 * @param key - Sender key material
 * @param chainIndex - Initial chain index
 * @returns New SenderKey object
 */
export function createSenderKey(key: Uint8Array, chainIndex: number): SenderKey {
  if (key.length !== SENDER_KEY_SIZE) {
    throw new Error(`Sender key must be ${SENDER_KEY_SIZE} bytes`);
  }
  return {
    key: new Uint8Array(key), // Copy to prevent external mutation
    chainIndex,
  };
}

/**
 * Checks if a received chain index is valid (not replayed).
 *
 * For security, we should reject messages with chain indexes we've
 * already seen. This function checks if the received index is greater
 * than or equal to the expected index.
 *
 * @param receivedIndex - Chain index from received message
 * @param expectedIndex - Our tracked chain index for this sender
 * @returns True if valid (not a replay)
 */
export function isValidChainIndex(receivedIndex: number, expectedIndex: number): boolean {
  return receivedIndex >= expectedIndex;
}

/**
 * Validates and updates chain index after receiving a message.
 *
 * If the received index is ahead of expected (messages arrived out of order
 * or some were missed), we update our tracking to the received index + 1.
 *
 * @param receivedIndex - Chain index from received message
 * @param currentSenderKey - Our copy of the sender's key (will be mutated)
 * @returns True if valid, false if replay detected
 */
export function validateAndUpdateChainIndex(
  receivedIndex: number,
  currentSenderKey: SenderKey
): boolean {
  if (!isValidChainIndex(receivedIndex, currentSenderKey.chainIndex)) {
    return false; // Replay attack or out-of-order beyond window
  }

  // Update to received index + 1 (even if we skipped some)
  currentSenderKey.chainIndex = receivedIndex + 1;
  return true;
}
