/**
 * Conversation repository
 * Data access layer for conversation operations with MongoDB persistence.
 *
 * Supports both DM (1-1) and group (up to 25 members) conversations.
 * Multiple DM documents may exist for the same participant pair when clients
 * start a new thread with a separate topic; dedupe returns the preferred
 * existing row (see findByParticipants sort).
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
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
  /** Any DM or group where both identities are participants (for key visibility). */
  findAnyWithBothParticipants(
    identityA: ObjectId,
    identityB: ObjectId
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
  updateMemberSettings(
    conversationId: ObjectId,
    encryptedMemberSettings: string,
    memberSettingsNonce: string
  ): Promise<ConversationDocument | null>;
  updateGifsDisabled(
    conversationId: ObjectId,
    gifsDisabled: boolean
  ): Promise<ConversationDocument | null>;
  updateCustomEmojisDisabled(
    conversationId: ObjectId,
    customEmojisDisabled: boolean
  ): Promise<ConversationDocument | null>;
  updateDisallowPersistentMessageSearchCache(
    conversationId: ObjectId,
    disallowPersistentMessageSearchCache: boolean
  ): Promise<ConversationDocument | null>;
  updateAllowSkipModeration(
    conversationId: ObjectId,
    allowSkipModeration: boolean
  ): Promise<ConversationDocument | null>;
  addPinnedMessage(
    conversationId: ObjectId,
    messageId: ObjectId
  ): Promise<ConversationDocument | null>;
  removePinnedMessage(
    conversationId: ObjectId,
    messageId: ObjectId
  ): Promise<ConversationDocument | null>;
  pullPinnedMessage(
    conversationId: ObjectId,
    messageId: ObjectId
  ): Promise<void>;
}

export class ConversationRepository
  extends BaseRepository<ConversationDocument>
  implements IConversationRepository
{
  constructor() {
    super(Collections.CONVERSATIONS);
  }

  /**
   * Find a DM between exactly two participants for deduplication when
   * starting a DM without forceNew. When several exist, returns the most
   * recently active (by last message, then creation time).
   */
  async findByParticipants(
    type: 'dm',
    participantA: ObjectId,
    participantB: ObjectId
  ): Promise<ConversationDocument | null> {
    const doc = await this.collection.findOne(
      {
        type,
        participants: { $all: [participantA, participantB], $size: 2 },
      },
      {
        sort: { lastMessageAt: -1, createdAt: -1, _id: -1 },
      }
    );
    return doc as ConversationDocument | null;
  }

  /**
   * Returns any conversation (DM or group) that includes both identities.
   */
  async findAnyWithBothParticipants(
    identityA: ObjectId,
    identityB: ObjectId
  ): Promise<ConversationDocument | null> {
    const doc = await this.collection.findOne({
      participants: { $all: [identityA, identityB] },
    });
    return doc as ConversationDocument | null;
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
    const now = new Date();
    const joinKey = `participantJoinedAtByIdentityId.${identityId.toHexString()}`;
    const $set: Record<string, unknown> = { updatedAt: now, [joinKey]: now };
    const result = await this.collection.updateOne(
      { _id: conversationId, participants: { $ne: identityId } },
      {
        $addToSet: { participants: identityId },
        $set,
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

  /**
   * Update the encrypted member settings (nicknames/colours).
   */
  async updateMemberSettings(
    conversationId: ObjectId,
    encryptedMemberSettings: string,
    memberSettingsNonce: string
  ): Promise<ConversationDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: conversationId },
      {
        $set: {
          encryptedMemberSettings,
          memberSettingsNonce,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );
    return result as ConversationDocument | null;
  }

  async updateGifsDisabled(
    conversationId: ObjectId,
    gifsDisabled: boolean
  ): Promise<ConversationDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: conversationId },
      {
        $set: {
          gifsDisabled,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );
    return result as ConversationDocument | null;
  }

  async updateCustomEmojisDisabled(
    conversationId: ObjectId,
    customEmojisDisabled: boolean
  ): Promise<ConversationDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: conversationId },
      {
        $set: {
          customEmojisDisabled,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );
    return result as ConversationDocument | null;
  }

  async updateDisallowPersistentMessageSearchCache(
    conversationId: ObjectId,
    disallowPersistentMessageSearchCache: boolean
  ): Promise<ConversationDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: conversationId },
      {
        $set: {
          disallowPersistentMessageSearchCache,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );
    return result as ConversationDocument | null;
  }

  async updateAllowSkipModeration(
    conversationId: ObjectId,
    allowSkipModeration: boolean
  ): Promise<ConversationDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: conversationId },
      {
        $set: {
          allowSkipModeration,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );
    return result as ConversationDocument | null;
  }

  /**
   * Append a pinned message id if not already present (order preserved for new pins).
   */
  async addPinnedMessage(
    conversationId: ObjectId,
    messageId: ObjectId
  ): Promise<ConversationDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: conversationId },
      {
        $addToSet: { pinnedMessageIds: messageId },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' }
    );
    return result as ConversationDocument | null;
  }

  /**
   * Remove a message id from the pin list.
   */
  async removePinnedMessage(
    conversationId: ObjectId,
    messageId: ObjectId
  ): Promise<ConversationDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: conversationId },
      {
        $pull: { pinnedMessageIds: messageId },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' }
    );
    return result as ConversationDocument | null;
  }

  /**
   * Unpin when the message is deleted for everyone (idempotent).
   */
  async pullPinnedMessage(conversationId: ObjectId, messageId: ObjectId): Promise<void> {
    await this.collection.updateOne(
      { _id: conversationId },
      {
        $pull: { pinnedMessageIds: messageId },
        $set: { updatedAt: new Date() },
      }
    );
  }
}

let conversationRepository: ConversationRepository | null = null;

export function getConversationRepository(): ConversationRepository {
  if (!conversationRepository) {
    conversationRepository = new ConversationRepository();
  }
  return conversationRepository;
}
