/**
 * Message repository
 * Data access layer for encrypted message operations with MongoDB persistence.
 *
 * Messages are E2E encrypted -- the repository handles only ciphertext storage
 * and metadata-based queries. Content decryption happens exclusively client-side.
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  MessageDocument,
  CreateMessageInput,
} from '../models/message';

export interface IMessageRepository {
  findByConversation(
    conversationId: ObjectId,
    limit: number,
    cursor?: ObjectId
  ): Promise<MessageDocument[]>;
  findByIdInConversation(
    conversationId: ObjectId,
    messageId: ObjectId
  ): Promise<MessageDocument | null>;
  findByClientMessageId(
    conversationId: ObjectId,
    clientMessageId: string
  ): Promise<MessageDocument | null>;
  markDeletedForEveryone(messageId: ObjectId): Promise<boolean>;
  markDeletedForIdentity(messageId: ObjectId, identityId: ObjectId): Promise<boolean>;
  deleteByConversation(conversationId: ObjectId): Promise<number>;
  countByParticipant(conversationId: ObjectId, identityId: ObjectId): Promise<number>;
}

export class MessageRepository
  extends BaseRepository<MessageDocument>
  implements IMessageRepository
{
  constructor() {
    super(Collections.MESSAGES);
  }

  /**
   * Create a new message, applying default deletion tracking fields.
   */
  async createMessage(input: CreateMessageInput): Promise<MessageDocument> {
    const doc = {
      ...input,
      deletedForEveryone: false,
      deletedFor: [] as ObjectId[],
    };
    return await this.create(doc as Omit<MessageDocument, '_id' | 'createdAt' | 'updatedAt'>);
  }

  /**
   * Fetch messages for a conversation with cursor-based pagination.
   * Returns newest first; the client reverses for display.
   */
  async findByIdInConversation(
    conversationId: ObjectId,
    messageId: ObjectId
  ): Promise<MessageDocument | null> {
    return await this.findOne({ _id: messageId, conversationId });
  }

  async findByConversation(
    conversationId: ObjectId,
    limit = 50,
    cursor?: ObjectId
  ): Promise<MessageDocument[]> {
    const filter: Record<string, unknown> = { conversationId };

    if (cursor) {
      filter._id = { $lt: cursor };
    }

    return await this.collection
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray() as MessageDocument[];
  }

  /**
   * Find a message by its client-generated deduplication ID.
   */
  async findByClientMessageId(
    conversationId: ObjectId,
    clientMessageId: string
  ): Promise<MessageDocument | null> {
    return await this.findOne({ conversationId, clientMessageId });
  }

  /**
   * Mark a message as deleted for all participants.
   * The message document is retained as a tombstone.
   */
  async markDeletedForEveryone(messageId: ObjectId): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: messageId },
      {
        $set: {
          deletedForEveryone: true,
          ciphertext: '',
          nonce: '',
          wrappedKeys: [],
          signature: '',
          updatedAt: new Date(),
        },
      }
    );
    return result.modifiedCount === 1;
  }

  /**
   * Mark a message as deleted for a single identity.
   * Other participants still see the message.
   */
  async markDeletedForIdentity(
    messageId: ObjectId,
    identityId: ObjectId
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: messageId, deletedFor: { $ne: identityId } },
      {
        $addToSet: { deletedFor: identityId },
        $set: { updatedAt: new Date() },
      }
    );
    return result.modifiedCount === 1;
  }

  /**
   * Hard-delete all messages in a conversation (for group cleanup/termination).
   */
  async deleteByConversation(conversationId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({ conversationId });
    return result.deletedCount;
  }

  /**
   * Find the conversation ID for a message containing a given e2eMediaId.
   * Returns null if no message references this media.
   */
  async findConversationByE2EMediaId(
    e2eMediaId: string
  ): Promise<ObjectId | null> {
    const doc = await this.collection.findOne(
      { e2eMediaIds: e2eMediaId, deletedForEveryone: { $ne: true } },
      { projection: { conversationId: 1 } }
    );
    return doc ? (doc as MessageDocument).conversationId : null;
  }

  /**
   * Count messages sent by an identity in a conversation (for "most active" resolution).
   * Excludes system messages from the count.
   */
  async countByParticipant(
    conversationId: ObjectId,
    identityId: ObjectId
  ): Promise<number> {
    return await this.collection.countDocuments({
      conversationId,
      fromIdentityId: identityId,
      messageType: { $ne: 'system' },
    } as Parameters<typeof this.collection.countDocuments>[0]);
  }
}

let messageRepository: MessageRepository | null = null;

export function getMessageRepository(): MessageRepository {
  if (!messageRepository) {
    messageRepository = new MessageRepository();
  }
  return messageRepository;
}
