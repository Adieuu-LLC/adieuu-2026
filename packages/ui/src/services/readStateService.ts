/**
 * Read State Service
 *
 * Handles encryption and decryption of read state (lastReadMessageId) for
 * DM conversations. This prevents the server from tracking when users
 * read messages, as MongoDB ObjectIds contain timestamps.
 *
 * SECURITY ARCHITECTURE:
 * - Read state key is derived from conversationId using HKDF
 * - Server cannot compute this key (doesn't know participant IDs)
 * - Random nonce included in output for each encryption
 * - Output format: base64(nonce || ciphertext)
 *
 * @module services/readStateService
 */

import {
  encrypt,
  decrypt,
  randomBytes,
  deriveReadStateKey,
  toBase64,
  fromBase64,
  toBytes,
  fromBytes,
  clearBytes,
  concatBytes,
  CHACHA_NONCE_SIZE,
  type CryptoProfile,
} from '@adieuu/crypto';

/**
 * Nonce size for symmetric encryption (12 bytes).
 */
const NONCE_SIZE = CHACHA_NONCE_SIZE;

/**
 * Encrypts the lastReadMessageId for a conversation.
 *
 * The encrypted value can be sent to the server without revealing
 * which specific message was last read (and thus when the user
 * was active in the conversation).
 *
 * @param conversationId - The blinded conversation ID (64-char hex)
 * @param lastReadMessageId - The MongoDB ObjectId of the last read message (24-char hex)
 * @param profile - Crypto profile (default: 'default')
 * @returns Base64-encoded encrypted read state (nonce || ciphertext)
 */
export function encryptLastReadId(
  conversationId: string,
  lastReadMessageId: string,
  profile: CryptoProfile = 'default'
): string {
  const key = deriveReadStateKey(conversationId, profile);
  const nonce = randomBytes(NONCE_SIZE);
  const plaintext = toBytes(lastReadMessageId);

  const { ciphertext } = encrypt(key, plaintext, profile, nonce);

  clearBytes(key);

  const combined = concatBytes(nonce, ciphertext);
  return toBase64(combined);
}

/**
 * Decrypts the lastReadMessageId from encrypted read state.
 *
 * Used by the client to determine which message was last read
 * when computing unread indicators.
 *
 * @param conversationId - The blinded conversation ID (64-char hex)
 * @param encryptedReadState - Base64-encoded encrypted read state
 * @param profile - Crypto profile (default: 'default')
 * @returns The last read message ID (24-char hex ObjectId)
 * @throws Error if decryption fails
 */
export function decryptLastReadId(
  conversationId: string,
  encryptedReadState: string,
  profile: CryptoProfile = 'default'
): string {
  const key = deriveReadStateKey(conversationId, profile);
  const combined = fromBase64(encryptedReadState);

  if (combined.length < NONCE_SIZE) {
    throw new Error('Invalid encrypted read state: too short');
  }

  const nonce = combined.slice(0, NONCE_SIZE);
  const ciphertext = combined.slice(NONCE_SIZE);

  let plaintext: Uint8Array;
  try {
    plaintext = decrypt(key, ciphertext, nonce, profile);
  } finally {
    clearBytes(key);
  }

  return fromBytes(plaintext);
}

/**
 * Checks if a message ID is newer than the last read message ID.
 *
 * MongoDB ObjectIds are sortable by creation time, so we can compare
 * them lexicographically to determine which is newer.
 *
 * @param messageId - The message ID to check
 * @param lastReadMessageId - The last read message ID
 * @returns true if messageId is newer than lastReadMessageId
 */
export function isMessageUnread(
  messageId: string,
  lastReadMessageId: string | null
): boolean {
  if (!lastReadMessageId) {
    return true;
  }
  return messageId > lastReadMessageId;
}

/**
 * Determines if a conversation has any unread messages.
 *
 * @param lastMessageId - The most recent message ID in the conversation
 * @param lastReadMessageId - The last read message ID (null if never read)
 * @returns true if there are unread messages
 */
export function hasUnreadMessages(
  lastMessageId: string | null,
  lastReadMessageId: string | null
): boolean {
  if (!lastMessageId) {
    return false;
  }
  return isMessageUnread(lastMessageId, lastReadMessageId);
}
