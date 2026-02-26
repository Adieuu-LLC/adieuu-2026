/**
 * DM Message Repository
 *
 * Data access layer for encrypted DM message operations.
 * Messages are E2E encrypted - the server only handles ciphertext.
 *
 * @module repositories/dm-message
 */

import { ObjectId, type Filter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  DmMessageDocument,
  CreateDmMessageInput,
} from '../models/dm-message';

/**
 * Pagination options for message queries.
 */
export interface MessagePaginationOptions {
  limit?: number;
  cursor?: ObjectId;
  direction?: 'older' | 'newer';
}

/**
 * Result of a paginated message query.
 */
export interface PaginatedMessagesResult {
  messages: DmMessageDocument[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * DM message repository interface.
 */
export interface IDmMessageRepository {
  findByClientMessageId(
    conversationId: string,
    clientMessageId: string
  ): Promise<DmMessageDocument | null>;
  createMessage(input: CreateDmMessageInput): Promise<DmMessageDocument>;
  getMessagesByConversation(
    conversationId: string,
    requestingIdentityId: ObjectId,
    options?: MessagePaginationOptions
  ): Promise<PaginatedMessagesResult>;
  getMessagesForIdentity(
    identityId: ObjectId,
    options?: MessagePaginationOptions
  ): Promise<PaginatedMessagesResult>;
  deleteForEveryone(messageId: ObjectId, senderIdentityId: ObjectId): Promise<boolean>;
  deleteForSelf(messageId: ObjectId, identityId: ObjectId): Promise<boolean>;
}

/**
 * DM message repository implementation.
 */
export class DmMessageRepository
  extends BaseRepository<DmMessageDocument>
  implements IDmMessageRepository
{
  constructor() {
    super(Collections.DM_MESSAGES);
  }

  /**
   * Find a message by its client-provided message ID.
   * Used for deduplication.
   */
  async findByClientMessageId(
    conversationId: string,
    clientMessageId: string
  ): Promise<DmMessageDocument | null> {
    return await this.findOne({ conversationId, clientMessageId });
  }

  /**
   * Create a new encrypted message.
   */
  async createMessage(input: CreateDmMessageInput): Promise<DmMessageDocument> {
    const doc = await this.create({
      conversationId: input.conversationId,
      toIdentityId: input.toIdentityId,
      ciphertext: input.ciphertext,
      nonce: input.nonce,
      wrappedKeys: input.wrappedKeys,
      signature: input.signature,
      cryptoProfile: input.cryptoProfile,
      clientMessageId: input.clientMessageId,
      expiresAt: input.expiresAt,
      replyToId: input.replyToId,
      threadRootId: input.threadRootId,
      deletedForEveryone: false,
      deletedFor: [],
    });

    return doc;
  }

  /**
   * Get messages for a conversation with pagination.
   * Respects deletion status for the requesting identity.
   */
  async getMessagesByConversation(
    conversationId: string,
    requestingIdentityId: ObjectId,
    options: MessagePaginationOptions = {}
  ): Promise<PaginatedMessagesResult> {
    const { limit = 50, cursor, direction = 'older' } = options;

    const filter: Filter<DmMessageDocument> = {
      conversationId,
      deletedForEveryone: false,
      deletedFor: { $ne: requestingIdentityId },
    };

    if (cursor) {
      filter._id = direction === 'older' ? { $lt: cursor } : { $gt: cursor };
    }

    const sortDirection = direction === 'older' ? -1 : 1;

    const messages = await this.collection
      .find(filter)
      .sort({ _id: sortDirection })
      .limit(limit + 1)
      .toArray() as DmMessageDocument[];

    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop();
    }

    const lastMessage = messages[messages.length - 1];
    const nextCursor = lastMessage ? lastMessage._id.toHexString() : null;

    return {
      messages,
      cursor: nextCursor,
      hasMore,
    };
  }

  /**
   * Get all messages where the identity is the recipient.
   * Used for discovering conversations.
   */
  async getMessagesForIdentity(
    identityId: ObjectId,
    options: MessagePaginationOptions = {}
  ): Promise<PaginatedMessagesResult> {
    const { limit = 50, cursor, direction = 'older' } = options;

    const filter: Filter<DmMessageDocument> = {
      toIdentityId: identityId,
      deletedForEveryone: false,
      deletedFor: { $ne: identityId },
    };

    if (cursor) {
      filter._id = direction === 'older' ? { $lt: cursor } : { $gt: cursor };
    }

    const sortDirection = direction === 'older' ? -1 : 1;

    const messages = await this.collection
      .find(filter)
      .sort({ _id: sortDirection })
      .limit(limit + 1)
      .toArray() as DmMessageDocument[];

    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop();
    }

    const lastMessage = messages[messages.length - 1];
    const nextCursor = lastMessage ? lastMessage._id.toHexString() : null;

    return {
      messages,
      cursor: nextCursor,
      hasMore,
    };
  }

  /**
   * Delete a message for everyone (sender only).
   * Sets deletedForEveryone flag - message content is not returned.
   */
  async deleteForEveryone(
    messageId: ObjectId,
    _senderIdentityId: ObjectId
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: messageId },
      {
        $set: {
          deletedForEveryone: true,
          updatedAt: new Date(),
        },
      }
    );

    return result.modifiedCount === 1;
  }

  /**
   * Delete a message for self only.
   * Adds identity to deletedFor array - others can still see the message.
   */
  async deleteForSelf(messageId: ObjectId, identityId: ObjectId): Promise<boolean> {
    const result = await this.collection.updateOne(
      {
        _id: messageId,
        deletedFor: { $ne: identityId },
      },
      {
        $addToSet: { deletedFor: identityId },
        $set: { updatedAt: new Date() },
      }
    );

    return result.modifiedCount === 1;
  }

  /**
   * Get distinct conversation IDs for an identity.
   * Used for listing conversations.
   */
  async getConversationIdsForIdentity(identityId: ObjectId): Promise<string[]> {
    const conversationIds = await this.collection.distinct('conversationId', {
      toIdentityId: identityId,
      deletedForEveryone: false,
      deletedFor: { $ne: identityId },
    });

    return conversationIds as string[];
  }
}

let dmMessageRepository: DmMessageRepository | null = null;

/**
 * Get the DM message repository singleton instance.
 */
export function getDmMessageRepository(): DmMessageRepository {
  if (!dmMessageRepository) {
    dmMessageRepository = new DmMessageRepository();
  }
  return dmMessageRepository;
}
