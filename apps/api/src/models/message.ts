/**
 * Message model
 * Represents an E2E encrypted message within a conversation.
 *
 * PRIVACY NOTES:
 * - fromIdentityId stored in plaintext (needed for lookups/signature verification)
 * - All message content is E2E encrypted; server sees only ciphertext
 * - Each message uses a fresh random session key wrapped per-device
 * - Forward secrecy supported via preKeyType field on wrapped keys
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { CryptoProfile } from './identity';

/**
 * Pre-key type indicating the key exchange mode used for each wrapped key.
 * - 'static': Standard device key wrapping (no forward secrecy)
 * - 'spk': Wrapped using signed pre-key (forward secrecy at SPK granularity)
 * - 'otpk': Wrapped using signed pre-key + one-time pre-key (per-message FS)
 */
export type PreKeyType = 'static' | 'spk' | 'otpk';

/**
 * Message type discriminator.
 * - 'user': Standard E2E encrypted user message (default)
 * - 'system': Server-generated event (e.g. member joined), not encrypted
 */
export type MessageType = 'user' | 'system';

/**
 * Structured data for system messages (not encrypted).
 */
export interface SystemEvent {
  type: string;
  identityId: string;
  displayName?: string;
  /** Invited or affected user's username (plaintext, for system copy) */
  username?: string;
  actorIdentityId?: string;
  actorDisplayName?: string;
  actorUsername?: string;
}

/**
 * Serialised wrapped session key for a single device.
 * The session key is wrapped with a per-device hybrid key exchange.
 */
export interface SerializedWrappedKey {
  /** Identity ID this key is wrapped for */
  identityId: string;
  /** Ephemeral X25519 public key (base64) */
  ephemeralPublicKey: string;
  /** ML-KEM ciphertext (base64) */
  kemCiphertext: string;
  /** Session key wrapped with the derived key (base64) */
  wrappedSessionKey: string;
  /** Nonce used for session key wrapping (base64) */
  wrappingNonce: string;
  /** Key exchange mode used */
  preKeyType: PreKeyType;
  /** Signed pre-key ID used (when preKeyType is 'spk' or 'otpk') */
  signedPreKeyId?: string;
  /** One-time pre-key ID consumed (when preKeyType is 'otpk') */
  oneTimePreKeyId?: string;
  /** ML-KEM ciphertext for SPK (when using pre-keys, base64) */
  spkKemCiphertext?: string;
  /** ML-KEM ciphertext for OTPK (when preKeyType is 'otpk', base64) */
  otpkKemCiphertext?: string;
  /** Truncated SHA-256 routing tag for O(1) wrapped key lookup on multi-device identities */
  routingTag?: string;
}

/**
 * A superseded E2E snapshot (same shape as a single message's encrypted payload),
 * plus when it was replaced by a newer version.
 */
export interface EncryptedMessageRevision {
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: CryptoProfile;
  /** Server time when this version was superseded by an edit. */
  replacedAt: Date;
}

/**
 * Message document stored in MongoDB
 */
export interface MessageDocument extends BaseDocument {
  /** Reference to the parent conversation */
  conversationId: ObjectId;

  /** Sender identity (plaintext for lookups and signature verification) */
  fromIdentityId: ObjectId;

  /** Distinguishes user messages from system events (defaults to 'user') */
  messageType?: MessageType;

  /** Structured data for system messages */
  systemEvent?: SystemEvent;

  /** ChaCha20-Poly1305 encrypted message content (base64) */
  ciphertext: string;

  /** Encryption nonce (base64) */
  nonce: string;

  /** Session key wrapped per-device for all conversation participants */
  wrappedKeys: SerializedWrappedKey[];

  /** Ed25519 signature over ciphertext || nonce || wrappedKeys (base64) */
  signature: string;

  /** Crypto profile used for this message */
  cryptoProfile: CryptoProfile;

  /** Client-generated UUID for deduplication */
  clientMessageId: string;

  /**
   * Optional reference to another message in this conversation (reply threading).
   * Server stores only the id; plaintext preview is derived client-side after decrypt.
   */
  replyToMessageId?: ObjectId;

  /**
   * E2E media IDs attached to this message (server-visible for gating and cleanup).
   * Actual attachment metadata (dimensions, filename, etc.) lives inside the
   * encrypted ciphertext and is invisible to the server.
   */
  e2eMediaIds?: string[];

  /**
   * Whether the sender performed client-side moderation scanning for attachments.
   * Plaintext; only meaningful when e2eMediaIds is non-empty.
   */
  moderationEnabled?: boolean;

  /** TTL expiry (MongoDB auto-deletes via TTL index) */
  expiresAt?: Date;

  /** Whether the sender deleted this message for all participants */
  deletedForEveryone: boolean;

  /** Identities that deleted this message for themselves only */
  deletedFor: ObjectId[];

  /**
   * Prior E2E snapshots (oldest to newest), from successful edits.
   * Capped at `MAX_MESSAGE_REVISIONS` in `apps/api/src/constants/messages.ts`.
   */
  encryptedRevisionHistory?: EncryptedMessageRevision[];

  /** Set on each successful edit (for clients). Omitted for messages never edited. */
  lastEditedAt?: Date;

  /** Idempotency key for the last successful edit. */
  lastClientEditId?: string;
}

/**
 * Input for creating a new message
 */
export interface CreateMessageInput {
  conversationId: ObjectId;
  fromIdentityId: ObjectId;
  messageType?: MessageType;
  systemEvent?: SystemEvent;
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: CryptoProfile;
  clientMessageId: string;
  e2eMediaIds?: string[];
  moderationEnabled?: boolean;
  expiresAt?: Date;
  replyToMessageId?: ObjectId;
}

/**
 * A stored revision, safe for the wire (timestamps as ISO-8601).
 */
export interface PublicMessageRevision {
  ciphertext: string;
  nonce: string;
  wrappedKeys: SerializedWrappedKey[];
  signature: string;
  cryptoProfile: CryptoProfile;
  replacedAt: string;
}

/**
 * Public message representation (safe to send to client).
 * Deleted messages are returned as tombstones (ciphertext omitted).
 */
export interface PublicMessage {
  id: string;
  conversationId: string;
  fromIdentityId: string;
  messageType?: MessageType;
  systemEvent?: SystemEvent;
  ciphertext?: string;
  nonce?: string;
  wrappedKeys?: SerializedWrappedKey[];
  signature?: string;
  cryptoProfile: CryptoProfile;
  clientMessageId: string;
  e2eMediaIds?: string[];
  expiresAt?: string;
  deleted: boolean;
  createdAt: string;
  /** Present when this message is a reply to another message in the same conversation */
  replyToMessageId?: string;
  /** Number of successful edits (length of `encryptedRevisionHistory` on the server). 0 if never edited. */
  revisionCount: number;
  /** ISO-8601 time of the most recent successful edit, if any. */
  lastEditedAt?: string;
  /** Omitted in list views unless the client asked for full history. */
  encryptedRevisionHistory?: PublicMessageRevision[];
}

function toPublicMessageRevisions(
  history: EncryptedMessageRevision[] | undefined
): PublicMessageRevision[] {
  if (!history?.length) return [];
  return history.map((h) => ({
    ciphertext: h.ciphertext,
    nonce: h.nonce,
    wrappedKeys: h.wrappedKeys,
    signature: h.signature,
    cryptoProfile: h.cryptoProfile,
    replacedAt: h.replacedAt.toISOString(),
  }));
}

export type ToPublicMessageOptions = {
  /** When true, include full `encryptedRevisionHistory` in the response. */
  includeRevisionHistory?: boolean;
};

/**
 * Convert a MessageDocument to PublicMessage (safe for client).
 * When a message is deleted for the requesting identity or for everyone,
 * a tombstone is returned with encrypted content stripped.
 */
export function toPublicMessage(
  doc: MessageDocument,
  requestingIdentityId?: ObjectId,
  options?: ToPublicMessageOptions
): PublicMessage {
  const includeRevisionHistory = options?.includeRevisionHistory === true;
  const revisionCount = doc.encryptedRevisionHistory?.length ?? 0;
  const lastEditedAt = doc.lastEditedAt?.toISOString();

  const isDeletedForRequester =
    doc.deletedForEveryone ||
    (requestingIdentityId &&
      doc.deletedFor.some((id) => id.equals(requestingIdentityId)));

  if (isDeletedForRequester) {
    return {
      id: doc._id.toHexString(),
      conversationId: doc.conversationId.toHexString(),
      fromIdentityId: doc.fromIdentityId.toHexString(),
      messageType: doc.messageType,
      systemEvent: doc.systemEvent,
      cryptoProfile: doc.cryptoProfile,
      clientMessageId: doc.clientMessageId,
      deleted: true,
      createdAt: doc.createdAt.toISOString(),
      revisionCount: 0,
      ...(doc.replyToMessageId
        ? { replyToMessageId: doc.replyToMessageId.toHexString() }
        : {}),
    };
  }

  return {
    id: doc._id.toHexString(),
    conversationId: doc.conversationId.toHexString(),
    fromIdentityId: doc.fromIdentityId.toHexString(),
    messageType: doc.messageType,
    systemEvent: doc.systemEvent,
    ciphertext: doc.ciphertext,
    nonce: doc.nonce,
    wrappedKeys: doc.wrappedKeys,
    signature: doc.signature,
    cryptoProfile: doc.cryptoProfile,
    clientMessageId: doc.clientMessageId,
    ...(doc.e2eMediaIds?.length ? { e2eMediaIds: doc.e2eMediaIds } : {}),
    ...(doc.moderationEnabled != null ? { moderationEnabled: doc.moderationEnabled } : {}),
    expiresAt: doc.expiresAt?.toISOString(),
    deleted: false,
    createdAt: doc.createdAt.toISOString(),
    revisionCount,
    ...(lastEditedAt ? { lastEditedAt } : {}),
    ...(includeRevisionHistory && revisionCount > 0
      ? { encryptedRevisionHistory: toPublicMessageRevisions(doc.encryptedRevisionHistory) }
      : {}),
    ...(doc.replyToMessageId
      ? { replyToMessageId: doc.replyToMessageId.toHexString() }
      : {}),
  };
}
