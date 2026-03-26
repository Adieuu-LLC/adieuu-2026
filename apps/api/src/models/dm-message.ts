/**
 * DM Message Model
 *
 * Represents an encrypted direct message between two identities.
 * Messages are end-to-end encrypted - the server only sees ciphertext.
 *
 * Privacy notes:
 * - `fromIdentityId` is stored in plaintext for delivery and participant resolution
 * - `toIdentityId` is stored in plaintext for delivery queries
 * - Combined with blinded `conversationId`, pattern analysis is needed to correlate
 *
 * @module models/dm-message
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { CryptoProfile } from './identity';

/**
 * Which key exchange mode was used for wrapping.
 * - 'otpk': Signed pre-key + one-time pre-key (best forward secrecy)
 * - 'spk': Signed pre-key only (medium-term forward secrecy, OTPKs exhausted)
 * - 'static': Static device key (no forward secrecy, fallback only)
 */
export type PreKeyType = 'otpk' | 'spk' | 'static';

/**
 * Serialized wrapped key for a recipient device.
 * All binary fields are base64-encoded for storage.
 */
export interface SerializedWrappedKey {
  /** Identity ID this key is wrapped for */
  identityId: string;
  /** Device ID within the identity */
  deviceId: string;
  /** Ephemeral X25519 public key used for wrapping (base64) */
  ephemeralPublicKey: string;
  /** ML-KEM ciphertext for signed pre-key or static device key (base64) */
  kemCiphertext: string;
  /** AES-GCM wrapped session key (base64) */
  wrappedSessionKey: string;
  /** Nonce used for AES-GCM wrapping (base64) */
  wrappingNonce: string;
  /** Which key exchange mode was used */
  preKeyType: PreKeyType;
  /** ID of the one-time pre-key consumed (when preKeyType is 'otpk') */
  oneTimePreKeyId?: string;
  /** ID of the signed pre-key used (when preKeyType is 'otpk' or 'spk') */
  signedPreKeyId?: string;
  /** ML-KEM ciphertext for the one-time pre-key (when preKeyType is 'otpk', base64) */
  oneTimeKemCiphertext?: string;
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

  /** Sender identity ID - stored for participant resolution and delivery */
  fromIdentityId: ObjectId;

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
  fromIdentityId: ObjectId;
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
  fromIdentityId: string;
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
    fromIdentityId: doc.fromIdentityId.toHexString(),
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
