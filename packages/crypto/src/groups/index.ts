/**
 * Group Chat Encryption Module
 *
 * Implements Sender Keys protocol for efficient group messaging.
 *
 * ## Overview
 *
 * In group chats, each member has a "sender key" - a symmetric key they
 * use to encrypt messages. Other members hold copies of this key to decrypt.
 *
 * ## Benefits vs Per-Message Fan-Out
 *
 * - O(1) encryption per message (vs O(N) for fan-out)
 * - ~200 bytes per message (vs ~1KB per recipient for hybrid)
 * - Scales to groups of 50+ members efficiently
 *
 * ## Key Lifecycle
 *
 * 1. **Group Creation**: Creator generates sender key, distributes to members
 * 2. **Member Joins**: All existing members send their sender keys to new member
 * 3. **Member Removed**: ALL members generate NEW sender keys and redistribute
 *
 * ## Security Properties
 *
 * - Forward secrecy within sender key epoch (via chain index)
 * - No backward secrecy on member join (new member can't read old messages)
 * - Full key rotation on member removal (removed member can't read new messages)
 *
 * @example
 * ```typescript
 * import {
 *   generateSenderKey,
 *   deriveMessageKey,
 *   wrapSenderKeyForRecipients,
 *   unwrapSenderKey,
 * } from '@adieuu/crypto';
 *
 * // Generate your sender key when joining a group
 * const mySenderKey = generateSenderKey();
 *
 * // Distribute to other members
 * const wrapped = wrapSenderKeyForRecipients(
 *   mySenderKey,
 *   groupId,
 *   myIdentityId,
 *   otherMembers
 * );
 *
 * // Encrypt a message
 * const messageKey = deriveMessageKey(mySenderKey.key, mySenderKey.chainIndex++);
 * const { ciphertext, nonce } = encrypt(messageKey, plaintext);
 * ```
 *
 * @module crypto/groups
 */

// Sender key generation and message key derivation
export {
  generateSenderKey,
  deriveMessageKey,
  advanceAndDeriveMessageKey,
  createSenderKey,
  isValidChainIndex,
  validateAndUpdateChainIndex,
  SENDER_KEY_SIZE,
  SENDER_KEY_MESSAGE_INFO,
} from './senderkey';

// Sender key distribution (wrapping/unwrapping)
export {
  wrapSenderKeyForRecipient,
  wrapSenderKeyForRecipients,
  unwrapSenderKey,
  findAndUnwrapSenderKey,
  prepareKeysForNewMember,
  type MemberJoinKeyDistribution,
} from './distribute';
