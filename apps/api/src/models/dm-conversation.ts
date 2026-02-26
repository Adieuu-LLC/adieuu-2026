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
  /** Identity who initiated the change */
  initiatedBy: ObjectId;
}

/**
 * DM conversation document stored in MongoDB.
 *
 * Privacy notes:
 * - `conversationId` is a blinded hash that doesn't reveal participants
 * - No participant list is stored - derived client-side from conversationId
 * - Profile changes are tracked for audit but don't expose participants
 */
export interface DmConversationDocument extends BaseDocument {
  /**
   * Blinded conversation ID.
   * Computed as: SHA3-256(sort([identityA, identityB]) || "dm-v1")
   */
  conversationId: string;

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
}

/**
 * Input for creating a new DM conversation.
 */
export interface CreateDmConversationInput {
  conversationId: string;
  activeCryptoProfile: CryptoProfile;
  initiatedBy: ObjectId;
}

/**
 * Public DM conversation representation (safe to send to client).
 */
export interface PublicDmConversation {
  id: string;
  conversationId: string;
  activeCryptoProfile: CryptoProfile;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert a DmConversationDocument to PublicDmConversation.
 */
export function toPublicDmConversation(doc: DmConversationDocument): PublicDmConversation {
  return {
    id: doc._id.toHexString(),
    conversationId: doc.conversationId,
    activeCryptoProfile: doc.activeCryptoProfile,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
