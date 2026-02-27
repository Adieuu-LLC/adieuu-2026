/**
 * Conversation Utilities Module
 *
 * Provides utilities for DM conversation handling, including
 * blinded conversation ID derivation for privacy-preserving messaging.
 *
 * @module utils/conversation
 */

import { createHash } from 'crypto';

/**
 * Domain separator for DM conversation ID derivation.
 * Ensures conversation IDs are cryptographically distinct from other hash uses.
 */
const DM_CONVERSATION_DOMAIN = 'dm-v1';

/**
 * Domain separator for participant hash derivation.
 * Used to identify participants without exposing their identity IDs.
 */
const DM_PARTICIPANT_DOMAIN = 'participant-v1';

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
  return createHash('sha3-256').update(data).digest('hex');
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
 * if (!validateConversationId(req.conversationId, authIdentityId, req.toIdentityId)) {
 *   return errors.badRequest('Invalid conversation ID');
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
  return createHash('sha3-256').update(data).digest('hex');
}
