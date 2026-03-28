/**
 * Conversation repository
 * Data access layer for conversation operations with MongoDB persistence.
 *
 * Supports both DM (1-1) and group (up to 25 members) conversations.
 * DMs are deduplicated by participant pair.
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import { withTimestamps } from '../models/base';
import type {
  ConversationDocument,
  CreateConversationInput,
} from '../models/conversation';

export interface IConversationRepository {
  findByParticipants(
    type: 'dm',
    participantA: ObjectId,
    participantB: ObjectId
  ): Promise<ConversationDocument | null>;
  findForIdentity(
    identityId: ObjectId,
    limit: number,
    cursor?: ObjectId
  ): Promise<ConversationDocument[]>;
  addParticipant(conversationId: ObjectId, identityId: ObjectId): Promise<boolean>;
  removeParticipant(conversationId: ObjectId, identityId: ObjectId): Promise<boolean>;
  addAdmin(conversationId: ObjectId, identityId: ObjectId): Promise<boolean>;
  removeAdmin(conversationId: ObjectId, identityId: ObjectId): Promise<boolean>;
  updateLastMessage(
    conversationId: ObjectId,
    messageId: ObjectId,
    messageAt: Date
  ): Promise<void>;
  updateEncryptedName(
    conversationId: ObjectId,
    encryptedName: string,
    nameNonce: string
  ): Promise<ConversationDocument | null>;
}

export class ConversationRepository
  extends BaseRepository<ConversationDocument>
  implements IConversationRepository
{
  constructor() {
    super(Collections.CONVERSATIONS);
  }

  /**
   * Find an existing DM between exactly two participants.
   * Used for deduplication when starting a new DM.
   */
  async findByParticipants(
    type: 'dm',
    participantA: ObjectId,
    participantB: ObjectId
  ): Promise<ConversationDocument | null> {
    return await this.findOne({
      type,
      participants: { $all: [participantA, participantB], $size: 2 },
    });
  }

  /**
   * List conversations for an identity, sorted by most recent message first.
   * Cursor-based pagination using _id for stable ordering.
   */
  async findForIdentity(
    identityId: ObjectId,
    limit = 50,
    cursor?: ObjectId
  ): Promise<ConversationDocument[]> {
    const filter: Record<string, unknown> = {
      participants: identityId,
    };

    if (cursor) {
      filter._id = { $lt: cursor };
    }

    return await this.collection
      .find(filter)
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(limit)
      .toArray() as ConversationDocument[];
  }

  /**
   * Create a new conversation with timestamps.
   */
  async createConversation(
    input: CreateConversationInput
  ): Promise<ConversationDocument> {
    return await this.create(input as Omit<ConversationDocument, '_id' | 'createdAt' | 'updatedAt'>);
  }

  /**
   * Add a participant to a conversation.
   * Returns false if the identity is already a participant.
   */
  async addParticipant(
    conversationId: ObjectId,
    identityId: ObjectId
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: conversationId, participants: { $ne: identityId } },
      {
        $addToSet: { participants: identityId },
        $set: { updatedAt: new Date() },
      }
    );
    return result.modifiedCount === 1;
  }

  /**
   * Remove a participant from a conversation.
   */
  async removeParticipant(
    conversationId: ObjectId,
    identityId: ObjectId
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: conversationId },
      {
        $pull: { participants: identityId },
        $set: { updatedAt: new Date() },
      }
    );
    return result.modifiedCount === 1;
  }

  /**
   * Add an admin to a group conversation.
   */
  async addAdmin(
    conversationId: ObjectId,
    identityId: ObjectId
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: conversationId },
      {
        $addToSet: { admins: identityId },
        $set: { updatedAt: new Date() },
      }
    );
    return result.modifiedCount === 1;
  }

  /**
   * Remove an admin from a group conversation.
   */
  async removeAdmin(
    conversationId: ObjectId,
    identityId: ObjectId
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: conversationId },
      {
        $pull: { admins: identityId },
        $set: { updatedAt: new Date() },
      }
    );
    return result.modifiedCount === 1;
  }

  /**
   * Update the last message metadata for conversation list sorting.
   */
  async updateLastMessage(
    conversationId: ObjectId,
    messageId: ObjectId,
    messageAt: Date
  ): Promise<void> {
    await this.collection.updateOne(
      { _id: conversationId },
      {
        $set: {
          lastMessageId: messageId,
          lastMessageAt: messageAt,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Update the encrypted group name.
   */
  async updateEncryptedName(
    conversationId: ObjectId,
    encryptedName: string,
    nameNonce: string
  ): Promise<ConversationDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: conversationId },
      {
        $set: {
          encryptedName,
          nameNonce,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );
    return result as ConversationDocument | null;
  }
}

let conversationRepository: ConversationRepository | null = null;

export function getConversationRepository(): ConversationRepository {
  if (!conversationRepository) {
    conversationRepository = new ConversationRepository();
  }
  return conversationRepository;
}
