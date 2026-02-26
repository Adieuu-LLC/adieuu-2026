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
  ReadStateEntry,
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
  updateReadState(
    conversationId: string,
    identityId: ObjectId,
    encryptedLastReadId: string
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
      readState: [],
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

  /**
   * Update read state for a participant in a conversation.
   * Uses upsert logic: creates entry if not exists, updates if exists.
   * The encrypted read position hides which message was read from the server.
   */
  async updateReadState(
    conversationId: string,
    identityId: ObjectId,
    encryptedLastReadId: string
  ): Promise<DmConversationDocument | null> {
    const now = new Date();

    const existingEntry = await this.collection.findOne({
      conversationId,
      'readState.identityId': identityId,
    });

    if (existingEntry) {
      const result = await this.collection.findOneAndUpdate(
        {
          conversationId,
          'readState.identityId': identityId,
        },
        {
          $set: {
            'readState.$.encryptedLastReadId': encryptedLastReadId,
            'readState.$.updatedAt': now,
          },
        },
        { returnDocument: 'after' }
      );
      return result as DmConversationDocument | null;
    }

    const newEntry: ReadStateEntry = {
      identityId,
      encryptedLastReadId,
      updatedAt: now,
    };

    const result = await this.collection.findOneAndUpdate(
      { conversationId },
      {
        $push: { readState: newEntry },
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
