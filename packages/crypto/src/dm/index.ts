/**
 * DM (Direct Messaging) Cryptographic Utilities
 *
 * Provides utilities for DM conversation handling, including
 * blinded conversation ID derivation for privacy-preserving messaging.
 *
 * @module crypto/dm
 */

import { sha3_256 } from '@noble/hashes/sha3';
import { toHex, toBytes } from '../utils';

/**
 * Domain separator for DM conversation ID derivation.
 * Ensures conversation IDs are cryptographically distinct from other hash uses.
 */
const DM_CONVERSATION_DOMAIN = 'dm-v1';

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
