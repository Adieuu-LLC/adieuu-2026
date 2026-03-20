/**
 * DM Reaction Model
 *
 * Represents an encrypted reaction to a direct message.
 * Reactions are E2E encrypted mini-messages -- the server stores only
 * ciphertext and the metadata needed for delivery and queries.
 *
 * Privacy notes:
 * - The emoji and reactor identity are inside the encrypted payload
 * - The server sees messageId and conversationId but never the reaction content
 * - This mirrors the dm_messages privacy model
 *
 * @module models/dm-reaction
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { CryptoProfile } from './identity';
import type { SerializedWrappedKey } from './dm-message';

/**
 * DM reaction document stored in MongoDB.
 */
export interface DmReactionDocument extends BaseDocument {
  /** ID of the message being reacted to */
  messageId: ObjectId;

  /** Blinded conversation ID */
  conversationId: string;

  /** Other participant's identity ID (for delivery routing) */
  toIdentityId: ObjectId;

  /** Encrypted reaction payload (base64) -- contains emoji + reactor identity */
  ciphertext: string;

  /** Nonce used for encryption (base64) */
  nonce: string;

  /** Wrapped session keys for each recipient device */
  wrappedKeys: SerializedWrappedKey[];

  /** Ed25519 signature over (ciphertext || nonce || wrappedKeys) (base64) */
  signature: string;

  /** Crypto profile used for this reaction */
  cryptoProfile: CryptoProfile;

  /** Client-provided reaction ID for deduplication */
  clientReactionId: string;
}

/**
 * Input for creating a new DM reaction.
 */
export interface CreateDmReactionInput {
  messageId: ObjectId;
  conversationId: string;
  toIdentityId: ObjectId;
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: CryptoProfile;
  clientReactionId: string;
}

/**
 * Public DM reaction representation (safe to send to client).
 */
export interface PublicDmReaction {
  id: string;
  messageId: string;
  conversationId: string;
  toIdentityId: string;
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: CryptoProfile;
  clientReactionId: string;
  createdAt: string;
}

/**
 * Convert a DmReactionDocument to PublicDmReaction.
 */
export function toPublicDmReaction(doc: DmReactionDocument): PublicDmReaction {
  return {
    id: doc._id.toHexString(),
    messageId: doc.messageId.toHexString(),
    conversationId: doc.conversationId,
    toIdentityId: doc.toIdentityId.toHexString(),
    ciphertext: doc.ciphertext,
    nonce: doc.nonce,
    wrappedKeys: doc.wrappedKeys,
    signature: doc.signature,
    cryptoProfile: doc.cryptoProfile,
    clientReactionId: doc.clientReactionId,
    createdAt: doc.createdAt.toISOString(),
  };
}
