/**
 * Reaction model
 * Represents an E2E encrypted emoji reaction linked to a message.
 *
 * PRIVACY NOTES:
 * - fromIdentityId stored in plaintext (needed for per-user limit enforcement)
 * - Reaction content (emoji + reactor) is E2E encrypted; server sees only ciphertext
 * - Each reaction uses a fresh random session key wrapped per-device
 * - Reactions are signed with Ed25519 to prevent forgery
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { CryptoProfile } from './identity';
import type { SerializedWrappedKey } from './message';

export const MAX_REACTIONS_PER_USER_PER_MESSAGE = 5;
export const MAX_REACTIONS_PER_MESSAGE = 25;

/**
 * Reaction document stored in MongoDB
 */
export interface ReactionDocument extends BaseDocument {
  /** Reference to the message being reacted to */
  messageId: ObjectId;

  /** Reference to the parent conversation */
  conversationId: ObjectId;

  /** Reactor identity (plaintext for limit enforcement and routing) */
  fromIdentityId: ObjectId;

  /** ChaCha20-Poly1305 encrypted reaction content (base64) */
  ciphertext: string;

  /** Encryption nonce (base64) */
  nonce: string;

  /** Session key wrapped per-device for all conversation participants */
  wrappedKeys: SerializedWrappedKey[];

  /** Ed25519 signature over ciphertext || nonce (base64) */
  signature: string;

  /** Crypto profile used for this reaction */
  cryptoProfile: CryptoProfile;

  /** Client-generated UUID for deduplication */
  clientReactionId: string;

  /** Inherited from parent message for TTL cascade (MongoDB auto-deletes at this time) */
  expiresAt?: Date;
}

/**
 * Input for creating a new reaction
 */
export interface CreateReactionInput {
  messageId: ObjectId;
  conversationId: ObjectId;
  fromIdentityId: ObjectId;
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: CryptoProfile;
  clientReactionId: string;
  expiresAt?: Date;
}

/**
 * Public reaction representation (safe to send to client)
 */
export interface PublicReaction {
  id: string;
  messageId: string;
  conversationId: string;
  fromIdentityId: string;
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: CryptoProfile;
  clientReactionId: string;
  createdAt: string;
  expiresAt?: string;
}

/**
 * Convert a ReactionDocument to PublicReaction (safe for client)
 */
export function toPublicReaction(doc: ReactionDocument): PublicReaction {
  return {
    id: doc._id.toHexString(),
    messageId: doc.messageId.toHexString(),
    conversationId: doc.conversationId.toHexString(),
    fromIdentityId: doc.fromIdentityId.toHexString(),
    ciphertext: doc.ciphertext,
    nonce: doc.nonce,
    wrappedKeys: doc.wrappedKeys,
    signature: doc.signature,
    cryptoProfile: doc.cryptoProfile,
    clientReactionId: doc.clientReactionId,
    createdAt: doc.createdAt.toISOString(),
    ...(doc.expiresAt ? { expiresAt: doc.expiresAt.toISOString() } : {}),
  };
}
