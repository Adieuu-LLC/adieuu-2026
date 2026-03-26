/**
 * DM Conversation Model
 *
 * Represents a direct message conversation between two identities.
 * Uses blinded conversation IDs for privacy - participants are not
 * directly stored but derived client-side.
 *
 * @module models/dm-conversation
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';
import type { CryptoProfile } from './identity';

/**
 * Profile change history entry.
 * Tracks when and who initiated crypto profile changes.
 */
export interface ProfileHistoryEntry {
  /** The crypto profile that was active */
  profile: CryptoProfile;
  /** When this profile became active */
  changedAt: Date;
  /**
   * Hashed participant identifier who initiated the change.
   * Computed as SHA3-256(identityId || conversationId || "participant-v1")
   * This prevents revealing participant identity to DB administrators.
   */
  initiatedByHash: string;
}

/**
 * Read state entry for a participant.
 * Stores encrypted last-read message ID to prevent activity timing analysis.
 * The server cannot decrypt this - only conversation participants can.
 */
export interface ReadStateEntry {
  /**
   * Hashed participant identifier.
   * Computed as SHA3-256(identityId || conversationId || "participant-v1")
   * This prevents revealing participant identity to DB administrators.
   */
  participantHash: string;
  /**
   * Encrypted last-read message ID (base64).
   * Encrypted with: HKDF(conversationId, "adieuu-read-state-v1")
   * Contains the MongoDB ObjectId of the last read message, encrypted.
   * Server cannot determine read position or activity timing.
   */
  encryptedLastReadId: string;
  /** When read state was last updated (coarse timing only) */
  updatedAt: Date;
}

/**
 * DM conversation document stored in MongoDB.
 *
 * Privacy notes:
 * - `conversationId` is a blinded hash that doesn't reveal participants
 * - `participants` stores plaintext identity IDs for query efficiency
 * - Profile changes are tracked for audit but don't expose participants
 */
export interface DmConversationDocument extends BaseDocument {
  /**
   * Blinded conversation ID.
   * Computed as: SHA3-256(sort([identityA, identityB]) || "dm-v1")
   */
  conversationId: string;

  /** Plaintext participant identity IDs for query efficiency */
  participants: ObjectId[];

  /**
   * Current active crypto profile for this conversation.
   * Both participants must use this profile for new messages.
   */
  activeCryptoProfile: CryptoProfile;

  /**
   * History of crypto profile changes.
   * Used for audit and understanding when old messages become unreadable.
   */
  profileHistory: ProfileHistoryEntry[];

  /**
   * Read state for each participant.
   * Stores encrypted last-read message ID per participant.
   * Encryption key: HKDF(conversationId, "adieuu-read-state-v1")
   */
  readState: ReadStateEntry[];
}

/**
 * Input for creating a new DM conversation.
 */
export interface CreateDmConversationInput {
  conversationId: string;
  participants: ObjectId[];
  activeCryptoProfile: CryptoProfile;
  /** Hashed participant identifier of the initiator */
  initiatedByHash: string;
}

/**
 * Public read state entry for a single participant.
 */
export interface PublicReadStateEntry {
  /** Hashed participant identifier (64-char hex) */
  participantHash: string;
  encryptedLastReadId: string;
  updatedAt: string;
}

/**
 * Public DM conversation representation (safe to send to client).
 */
export interface PublicDmConversation {
  id: string;
  conversationId: string;
  participants: string[];
  activeCryptoProfile: CryptoProfile;
  readState: PublicReadStateEntry[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert a DmConversationDocument to PublicDmConversation.
 */
export function toPublicDmConversation(doc: DmConversationDocument): PublicDmConversation {
  const readState: PublicReadStateEntry[] = (doc.readState ?? []).map((entry) => ({
    participantHash: entry.participantHash,
    encryptedLastReadId: entry.encryptedLastReadId,
    updatedAt: entry.updatedAt.toISOString(),
  }));

  return {
    id: doc._id.toHexString(),
    conversationId: doc.conversationId,
    participants: (doc.participants ?? []).map((p) => p.toHexString()),
    activeCryptoProfile: doc.activeCryptoProfile,
    readState,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
