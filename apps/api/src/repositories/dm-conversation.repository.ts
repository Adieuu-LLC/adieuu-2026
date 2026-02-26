/**
 * DM Conversation Repository
 *
 * Data access layer for DM conversation operations.
 * Conversations use blinded IDs for privacy - participants are not stored.
 *
 * @module repositories/dm-conversation
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  DmConversationDocument,
  CreateDmConversationInput,
  ProfileHistoryEntry,
} from '../models/dm-conversation';
import type { CryptoProfile } from '../models/identity';

/**
 * DM conversation repository interface.
 */
export interface IDmConversationRepository {
  findByConversationId(conversationId: string): Promise<DmConversationDocument | null>;
  getOrCreate(input: CreateDmConversationInput): Promise<DmConversationDocument>;
  updateCryptoProfile(
    conversationId: string,
    newProfile: CryptoProfile,
    initiatedBy: ObjectId
  ): Promise<DmConversationDocument | null>;
}

/**
 * DM conversation repository implementation.
 */
export class DmConversationRepository
  extends BaseRepository<DmConversationDocument>
  implements IDmConversationRepository
{
  constructor() {
    super(Collections.DM_CONVERSATIONS);
  }

  /**
   * Find a conversation by its blinded conversation ID.
   */
  async findByConversationId(conversationId: string): Promise<DmConversationDocument | null> {
    return await this.findOne({ conversationId });
  }

  /**
   * Get an existing conversation or create a new one.
   * Idempotent - safe to call multiple times with same input.
   */
  async getOrCreate(input: CreateDmConversationInput): Promise<DmConversationDocument> {
    const existing = await this.findByConversationId(input.conversationId);
    if (existing) {
      return existing;
    }

    const initialHistory: ProfileHistoryEntry = {
      profile: input.activeCryptoProfile,
      changedAt: new Date(),
      initiatedBy: input.initiatedBy,
    };

    const doc = await this.create({
      conversationId: input.conversationId,
      activeCryptoProfile: input.activeCryptoProfile,
      profileHistory: [initialHistory],
    });

    return doc;
  }

  /**
   * Update the active crypto profile for a conversation.
   * Appends to profile history for audit trail.
   */
  async updateCryptoProfile(
    conversationId: string,
    newProfile: CryptoProfile,
    initiatedBy: ObjectId
  ): Promise<DmConversationDocument | null> {
    const historyEntry: ProfileHistoryEntry = {
      profile: newProfile,
      changedAt: new Date(),
      initiatedBy,
    };

    const result = await this.collection.findOneAndUpdate(
      { conversationId },
      {
        $set: {
          activeCryptoProfile: newProfile,
          updatedAt: new Date(),
        },
        $push: {
          profileHistory: historyEntry,
        },
      },
      { returnDocument: 'after' }
    );

    return result as DmConversationDocument | null;
  }
}

let dmConversationRepository: DmConversationRepository | null = null;

/**
 * Get the DM conversation repository singleton instance.
 */
export function getDmConversationRepository(): DmConversationRepository {
  if (!dmConversationRepository) {
    dmConversationRepository = new DmConversationRepository();
  }
  return dmConversationRepository;
}
