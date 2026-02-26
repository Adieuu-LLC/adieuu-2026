/**
 * DM Message Model
 *
 * Represents an encrypted direct message between two identities.
 * Messages are end-to-end encrypted - the server only sees ciphertext.
 *
 * Privacy notes:
 * - `fromIdentityId` is NOT stored - revealed only after decryption
 * - `toIdentityId` IS stored (needed for delivery queries)
 * - Combined with blinded `conversationId`, pattern analysis is needed to correlate
 *
 * @module models/dm-message
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { CryptoProfile } from './identity';

/**
 * Serialized wrapped key for a recipient device.
 * All binary fields are base64-encoded for storage.
 */
export interface SerializedWrappedKey {
  /** Identity ID this key is wrapped for */
  identityId: string;
  /** Device ID within the identity (optional - if not set, try all devices) */
  deviceId?: string;
  /** Ephemeral X25519 public key used for wrapping (base64) */
  ephemeralPublicKey: string;
  /** ML-KEM ciphertext (base64) */
  kemCiphertext: string;
  /** AES-GCM wrapped session key (base64) */
  wrappedSessionKey: string;
  /** Nonce used for AES-GCM wrapping (base64) */
  wrappingNonce: string;
}

/**
 * DM message document stored in MongoDB.
 *
 * The message content is encrypted client-side. The server stores
 * only the ciphertext and metadata needed for delivery and queries.
 */
export interface DmMessageDocument extends BaseDocument {
  /** Blinded conversation ID */
  conversationId: string;

  /** Recipient identity ID - needed for delivery/queries */
  toIdentityId: ObjectId;

  /**
   * Encrypted sender identity hint (base64).
   * Encrypted with: HKDF(conversationId, "adieuu-sender-hint-v1")
   * Allows recipient to identify sender for signature verification
   * before decrypting the main payload. Server cannot decrypt.
   */
  encryptedSenderId: string;

  /** Encrypted message content (base64) */
  ciphertext: string;

  /** Nonce used for encryption (base64) */
  nonce: string;

  /** Wrapped session keys for each recipient device */
  wrappedKeys: SerializedWrappedKey[];

  /** Ed25519 signature over (ciphertext || wrappedKeys) (base64) */
  signature: string;

  /** Crypto profile used for this message */
  cryptoProfile: CryptoProfile;

  /** Optional expiration time (TTL) */
  expiresAt?: Date;

  /** Client-provided message ID for deduplication */
  clientMessageId: string;

  /** Reply reference - inline reply to another message */
  replyToId?: ObjectId;

  /** Thread root - groups messages in a thread */
  threadRootId?: ObjectId;

  /** Whether this message was deleted for everyone (by sender) */
  deletedForEveryone: boolean;

  /** Identities who deleted this message for themselves */
  deletedFor: ObjectId[];
}

/**
 * Input for creating a new DM message.
 */
export interface CreateDmMessageInput {
  conversationId: string;
  toIdentityId: ObjectId;
  encryptedSenderId: string;
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: CryptoProfile;
  clientMessageId: string;
  expiresAt?: Date;
  replyToId?: ObjectId;
  threadRootId?: ObjectId;
}

/**
 * Public DM message representation (safe to send to client).
 * Does not include deletedFor array (privacy).
 */
export interface PublicDmMessage {
  id: string;
  conversationId: string;
  toIdentityId: string;
  encryptedSenderId: string;
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: CryptoProfile;
  clientMessageId: string;
  createdAt: string;
  expiresAt?: string;
  replyToId?: string;
  threadRootId?: string;
  deleted?: boolean;
}

/**
 * Tombstone representation for deleted messages.
 * Returned instead of full message when deleted.
 */
export interface DmMessageTombstone {
  id: string;
  conversationId: string;
  deleted: true;
  createdAt: string;
}

/**
 * Convert a DmMessageDocument to PublicDmMessage.
 * Returns tombstone if message is deleted for the requesting identity.
 */
export function toPublicDmMessage(
  doc: DmMessageDocument,
  requestingIdentityId?: ObjectId
): PublicDmMessage | DmMessageTombstone {
  const isDeletedForEveryone = doc.deletedForEveryone;
  const isDeletedForRequester = requestingIdentityId
    ? doc.deletedFor.some((id) => id.equals(requestingIdentityId))
    : false;

  if (isDeletedForEveryone || isDeletedForRequester) {
    return {
      id: doc._id.toHexString(),
      conversationId: doc.conversationId,
      deleted: true,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  return {
    id: doc._id.toHexString(),
    conversationId: doc.conversationId,
    toIdentityId: doc.toIdentityId.toHexString(),
    encryptedSenderId: doc.encryptedSenderId,
    ciphertext: doc.ciphertext,
    nonce: doc.nonce,
    wrappedKeys: doc.wrappedKeys,
    signature: doc.signature,
    cryptoProfile: doc.cryptoProfile,
    clientMessageId: doc.clientMessageId,
    createdAt: doc.createdAt.toISOString(),
    expiresAt: doc.expiresAt?.toISOString(),
    replyToId: doc.replyToId?.toHexString(),
    threadRootId: doc.threadRootId?.toHexString(),
  };
}

/**
 * Type guard to check if a message response is a tombstone.
 */
export function isDmMessageTombstone(
  msg: PublicDmMessage | DmMessageTombstone
): msg is DmMessageTombstone {
  return 'deleted' in msg && msg.deleted === true;
}
