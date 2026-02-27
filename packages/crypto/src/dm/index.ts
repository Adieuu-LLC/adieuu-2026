/**
 * DM (Direct Messaging) Cryptographic Utilities
 *
 * Provides utilities for DM conversation handling, including:
 * - Blinded conversation ID derivation for privacy-preserving messaging
 * - Sender hint key derivation for pre-verification sender discovery
 * - Read state key derivation for encrypted unread tracking
 *
 * @module crypto/dm
 */

import { sha3_256 } from '@noble/hashes/sha3';
import { toHex, toBytes, fromHex } from '../utils';
import { deriveKey } from '../kdf/hkdf';
import type { CryptoProfile } from '../types';

/**
 * Domain separator for DM conversation ID derivation.
 * Ensures conversation IDs are cryptographically distinct from other hash uses.
 */
const DM_CONVERSATION_DOMAIN = 'dm-v1';

/**
 * Domain separator for sender hint key derivation.
 * Used to encrypt sender identity before signature verification.
 */
const DM_SENDER_HINT_DOMAIN = 'adieuu-sender-hint-v1';

/**
 * Domain separator for read state key derivation.
 * Used to encrypt lastReadMessageId to hide activity patterns.
 */
const DM_READ_STATE_DOMAIN = 'adieuu-read-state-v1';

/**
 * Domain separator for participant hash derivation.
 * Used to identify participants without exposing their identity IDs.
 */
const DM_PARTICIPANT_DOMAIN = 'participant-v1';

/**
 * Nonce size for symmetric encryption (12 bytes for ChaCha20/AES-GCM).
 */
const NONCE_SIZE = 12;

/**
 * Derives a blinded conversation ID from two identity IDs.
 *
 * The conversation ID is computed as: SHA3-256(sort([A, B]) || "dm-v1")
 *
 * This provides:
 * - **Determinism**: Same two identities always produce the same conversation ID
 * - **Symmetry**: Order of identities doesn't matter (sorted before hashing)
 * - **Privacy**: Conversation ID doesn't directly reveal participants
 * - **Uniqueness**: Domain separator prevents collision with other hash uses
 *
 * @param identityIdA - First identity ID (hex string, 24 chars)
 * @param identityIdB - Second identity ID (hex string, 24 chars)
 * @returns The blinded conversation ID as a hex string (64 chars)
 *
 * @example
 * ```typescript
 * const convId = deriveConversationId(aliceId, bobId);
 * // Same result regardless of order
 * const convId2 = deriveConversationId(bobId, aliceId);
 * assert(convId === convId2);
 * ```
 */
export function deriveConversationId(identityIdA: string, identityIdB: string): string {
  const sorted = [identityIdA, identityIdB].sort();
  const data = `${sorted[0]}${sorted[1]}${DM_CONVERSATION_DOMAIN}`;
  const hash = sha3_256(toBytes(data));
  return toHex(hash);
}

/**
 * Validates that a conversation ID matches the expected derivation.
 *
 * Used to verify that a provided conversation ID is correctly derived
 * from the given identity pair. This prevents malformed requests that
 * could break the obfuscation model.
 *
 * @param conversationId - The conversation ID to validate
 * @param identityIdA - First identity ID
 * @param identityIdB - Second identity ID
 * @returns true if the conversation ID matches the expected derivation
 *
 * @example
 * ```typescript
 * if (!validateConversationId(req.conversationId, myIdentityId, otherIdentityId)) {
 *   throw new Error('Invalid conversation ID');
 * }
 * ```
 */
export function validateConversationId(
  conversationId: string,
  identityIdA: string,
  identityIdB: string
): boolean {
  const expected = deriveConversationId(identityIdA, identityIdB);
  return conversationId === expected;
}

/**
 * Derives the sender hint key for a DM conversation.
 *
 * Both participants can compute this key from the conversationId.
 * The server cannot derive it since it doesn't know the participant IDs
 * that compose the blinded conversationId.
 *
 * Used to encrypt/decrypt the sender identity before signature verification,
 * allowing recipients to fetch the sender's signing key without decrypting
 * potentially malicious payloads first.
 *
 * @param conversationId - The blinded conversation ID (64-char hex string)
 * @param profile - Crypto profile (default: 'default')
 * @returns 32-byte key for sender hint encryption
 *
 * @example
 * ```typescript
 * const key = deriveSenderHintKey(conversationId);
 * const nonce = deriveSenderHintNonce(clientMessageId);
 * const encrypted = encrypt(key, toBytes(senderId), 'default', nonce);
 * ```
 */
export function deriveSenderHintKey(
  conversationId: string,
  profile: CryptoProfile = 'default'
): Uint8Array {
  const ikm = fromHex(conversationId);
  return deriveKey(
    {
      ikm,
      salt: undefined,
      info: DM_SENDER_HINT_DOMAIN,
      length: 32,
    },
    profile
  );
}

/**
 * Derives the read state key for a DM conversation.
 *
 * Both participants can compute this key from the conversationId.
 * Used to encrypt/decrypt the lastReadMessageId, preventing the server
 * from tracking when users read messages (ObjectIds contain timestamps).
 *
 * @param conversationId - The blinded conversation ID (64-char hex string)
 * @param profile - Crypto profile (default: 'default')
 * @returns 32-byte key for read state encryption
 *
 * @example
 * ```typescript
 * const key = deriveReadStateKey(conversationId);
 * const { ciphertext, nonce } = encrypt(key, toBytes(lastReadMessageId));
 * const encryptedReadState = base64(concat(nonce, ciphertext));
 * ```
 */
export function deriveReadStateKey(
  conversationId: string,
  profile: CryptoProfile = 'default'
): Uint8Array {
  const ikm = fromHex(conversationId);
  return deriveKey(
    {
      ikm,
      salt: undefined,
      info: DM_READ_STATE_DOMAIN,
      length: 32,
    },
    profile
  );
}

/**
 * Derives a 12-byte nonce from a clientMessageId for sender hint encryption.
 *
 * Uses SHA3-256 of the clientMessageId, truncated to 12 bytes (nonce size).
 * This provides a deterministic nonce that is unique per message, allowing
 * the recipient to derive the same nonce for decryption.
 *
 * The clientMessageId format is `${timestamp}-${random8bytes}`, ensuring
 * uniqueness across messages from the same sender.
 *
 * @param clientMessageId - Client-generated message ID
 * @returns 12-byte nonce suitable for ChaCha20-Poly1305 or AES-256-GCM
 *
 * @example
 * ```typescript
 * const nonce = deriveSenderHintNonce(clientMessageId);
 * const encrypted = encrypt(senderHintKey, plaintext, profile, nonce);
 * ```
 */
export function deriveSenderHintNonce(clientMessageId: string): Uint8Array {
  const hash = sha3_256(toBytes(clientMessageId));
  return hash.slice(0, NONCE_SIZE);
}

/**
 * Derives a participant hash for privacy-preserving participant identification.
 *
 * The hash is computed as: SHA3-256(identityId || conversationId || "participant-v1")
 *
 * This provides:
 * - **Privacy**: The hash cannot be reversed to reveal the identity ID
 * - **Binding**: The hash is tied to a specific conversation, preventing cross-conversation tracking
 * - **Determinism**: Same inputs always produce the same hash
 * - **Uniqueness**: Each participant in each conversation has a unique hash
 *
 * Used to identify participants in read state and profile history without
 * storing plaintext identity IDs in the database.
 *
 * @param identityId - The identity ID (hex string, 24 chars)
 * @param conversationId - The blinded conversation ID (hex string, 64 chars)
 * @returns The participant hash as a hex string (64 chars)
 *
 * @example
 * ```typescript
 * const myHash = deriveParticipantHash(myIdentityId, conversationId);
 * const myReadState = conversation.readState.find(r => r.participantHash === myHash);
 * ```
 */
export function deriveParticipantHash(identityId: string, conversationId: string): string {
  const data = `${identityId}${conversationId}${DM_PARTICIPANT_DOMAIN}`;
  const hash = sha3_256(toBytes(data));
  return toHex(hash);
}
