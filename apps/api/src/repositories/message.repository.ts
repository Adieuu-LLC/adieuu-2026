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
  findByClientMessageId(
    conversationId: ObjectId,
    clientMessageId: string
  ): Promise<MessageDocument | null>;
  markDeletedForEveryone(messageId: ObjectId): Promise<boolean>;
  markDeletedForIdentity(messageId: ObjectId, identityId: ObjectId): Promise<boolean>;
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
}

let messageRepository: MessageRepository | null = null;

export function getMessageRepository(): MessageRepository {
  if (!messageRepository) {
    messageRepository = new MessageRepository();
  }
  return messageRepository;
}
