/**
 * Message repository
 * Data access layer for encrypted message operations with MongoDB persistence.
 *
 * Messages are E2E encrypted -- the repository handles only ciphertext storage
 * and metadata-based queries. Content decryption happens exclusively client-side.
 */

import { type Filter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  MessageDocument,
  CreateMessageInput,
  EncryptedMessageRevision,
} from '../models/message';
import { MAX_MESSAGE_REVISIONS } from '../constants/messages';

export interface IMessageRepository {
  findByConversation(
    conversationId: ObjectId,
    limit: number,
    cursor?: ObjectId,
    direction?: 'asc' | 'desc',
    minCreatedAt?: Date,
  ): Promise<MessageDocument[]>;
  findByIdInConversation(
    conversationId: ObjectId,
    messageId: ObjectId
  ): Promise<MessageDocument | null>;
  /** Batch lookup; order is not preserved — caller reorders by pin list. */
  findByIdsInConversation(
    conversationId: ObjectId,
    messageIds: ObjectId[]
  ): Promise<Map<string, MessageDocument>>;
  findByClientMessageId(
    conversationId: ObjectId,
    clientMessageId: string
  ): Promise<MessageDocument | null>;
  markDeletedForEveryone(messageId: ObjectId): Promise<boolean>;
  markDeletedForIdentity(messageId: ObjectId, identityId: ObjectId): Promise<boolean>;
  deleteByConversation(conversationId: ObjectId): Promise<number>;
  /**
   * All message documents for the conversation, with no filter on type or deletion flags
   * (avoids splitting totals into an enumerable side channel).
   */
  countByConversation(conversationId: ObjectId): Promise<number>;
  countByParticipant(conversationId: ObjectId, identityId: ObjectId): Promise<number>;
  hasMessageNewerThan(
    conversationId: ObjectId,
    thanId: ObjectId,
    minCreatedAt?: Date
  ): Promise<boolean>;
  hasMessageOlderThan(
    conversationId: ObjectId,
    thanId: ObjectId,
    minCreatedAt?: Date
  ): Promise<boolean>;
  /**
   * Idempotent: if `lastClientEditId` already equals `clientEditId`, returns the current doc
   * without writing. Otherwise appends a snapshot of the current ciphertext to history and
   * replaces the top-level fields with the new payload.
   */
  applyMessageEdit(
    conversationId: ObjectId,
    messageId: ObjectId,
    senderIdentityId: ObjectId,
    clientEditId: string,
    newPayload: {
      ciphertext: string;
      nonce: string;
      wrappedKeys: MessageDocument['wrappedKeys'];
      signature: string;
      cryptoProfile: MessageDocument['cryptoProfile'];
    }
  ): Promise<{
    doc: MessageDocument | null;
    errorCode: 'NOT_FOUND' | 'NOT_SENDER' | 'MAX_EDITS_REACHED' | 'SYSTEM_MESSAGE' | 'TOMBSTONE' | null;
    idempotentReplay?: boolean;
  }>;
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
   * Look up a single message by id, scoped to the conversation.
   */
  async findByIdInConversation(
    conversationId: ObjectId,
    messageId: ObjectId
  ): Promise<MessageDocument | null> {
    return await this.findOne({ _id: messageId, conversationId });
  }

  async findByIdsInConversation(
    conversationId: ObjectId,
    messageIds: ObjectId[]
  ): Promise<Map<string, MessageDocument>> {
    const map = new Map<string, MessageDocument>();
    if (messageIds.length === 0) return map;
    const docs = (await this.collection
      .find({
        conversationId,
        _id: { $in: messageIds },
      })
      .toArray()) as MessageDocument[];
    for (const d of docs) {
      map.set(d._id.toHexString(), d);
    }
    return map;
  }

  /**
   * Fetch messages for a conversation with cursor-based pagination.
   * Returns newest first; the client reverses for display.
   *
   * When `cursor` is set: `asc` keeps messages strictly older than the cursor (`_id` less than cursor),
   * which matches a next-page token taken as the oldest id on the previous page. The default (`desc`)
   * keeps messages strictly newer than the cursor (`_id` greater than cursor).
   */
  async findByConversation(
    conversationId: ObjectId,
    limit = 50,
    cursor?: ObjectId,
    direction?: 'asc' | 'desc',
    minCreatedAt?: Date,
  ): Promise<MessageDocument[]> {
    const filter: Filter<MessageDocument> = { conversationId };
    if (minCreatedAt) {
      filter.createdAt = { $gte: minCreatedAt };
    }
    if (cursor) {
      filter._id = direction === 'asc' ? { $lt: cursor } : { $gt: cursor };
    }

    return await this.collection
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray() as MessageDocument[];
  }

  /**
   * Whether the conversation has any message strictly newer than `thanId` (by ObjectId order).
   */
  async hasMessageNewerThan(
    conversationId: ObjectId,
    thanId: ObjectId,
    minCreatedAt?: Date
  ): Promise<boolean> {
    const filter: Filter<MessageDocument> = { conversationId, _id: { $gt: thanId } };
    if (minCreatedAt) {
      filter.createdAt = { $gte: minCreatedAt };
    }
    const doc = await this.collection.findOne(filter, { projection: { _id: 1 } });
    return doc !== null;
  }

  /**
   * Whether the conversation has any message strictly older than `thanId`.
   */
  async hasMessageOlderThan(
    conversationId: ObjectId,
    thanId: ObjectId,
    minCreatedAt?: Date
  ): Promise<boolean> {
    const filter: Filter<MessageDocument> = { conversationId, _id: { $lt: thanId } };
    if (minCreatedAt) {
      filter.createdAt = { $gte: minCreatedAt };
    }
    const doc = await this.collection.findOne(filter, { projection: { _id: 1 } });
    return doc !== null;
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
          encryptedRevisionHistory: [] as EncryptedMessageRevision[],
          updatedAt: new Date(),
        },
        $unset: {
          lastClientEditId: '',
          lastEditedAt: '',
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
   * Fetch messages immediately before (older than) a given message in the
   * same conversation. Returns newest-first order.
   */
  async findBefore(
    conversationId: ObjectId,
    messageId: ObjectId,
    limit: number,
    minCreatedAt?: Date
  ): Promise<MessageDocument[]> {
    const filter: Filter<MessageDocument> = { conversationId, _id: { $lt: messageId } };
    if (minCreatedAt) {
      filter.createdAt = { $gte: minCreatedAt };
    }
    return await this.collection
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit)
      .toArray() as MessageDocument[];
  }

  /**
   * Fetch messages immediately after (newer than) a given message in the
   * same conversation. Returns oldest-first order.
   */
  async findAfter(
    conversationId: ObjectId,
    messageId: ObjectId,
    limit: number,
    minCreatedAt?: Date
  ): Promise<MessageDocument[]> {
    const filter: Filter<MessageDocument> = { conversationId, _id: { $gt: messageId } };
    if (minCreatedAt) {
      filter.createdAt = { $gte: minCreatedAt };
    }
    return await this.collection
      .find(filter)
      .sort({ _id: 1 })
      .limit(limit)
      .toArray() as MessageDocument[];
  }

  async countByConversation(conversationId: ObjectId): Promise<number> {
    return await this.collection.countDocuments({ conversationId } as Parameters<
      typeof this.collection.countDocuments
    >[0]);
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

  async applyMessageEdit(
    conversationId: ObjectId,
    messageId: ObjectId,
    senderIdentityId: ObjectId,
    clientEditId: string,
    newPayload: {
      ciphertext: string;
      nonce: string;
      wrappedKeys: MessageDocument['wrappedKeys'];
      signature: string;
      cryptoProfile: MessageDocument['cryptoProfile'];
    }
  ): Promise<{
    doc: MessageDocument | null;
    errorCode: 'NOT_FOUND' | 'NOT_SENDER' | 'MAX_EDITS_REACHED' | 'SYSTEM_MESSAGE' | 'TOMBSTONE' | null;
    idempotentReplay?: boolean;
  }> {
    const found = (await this.findOne({
      _id: messageId,
      conversationId,
    })) as MessageDocument | null;
    if (!found) {
      return { doc: null, errorCode: 'NOT_FOUND' };
    }
    if (!found.fromIdentityId.equals(senderIdentityId)) {
      return { doc: null, errorCode: 'NOT_SENDER' };
    }
    if (found.deletedForEveryone) {
      return { doc: null, errorCode: 'TOMBSTONE' };
    }
    if (found.messageType === 'system') {
      return { doc: null, errorCode: 'SYSTEM_MESSAGE' };
    }
    if (found.lastClientEditId === clientEditId) {
      return { doc: found, errorCode: null, idempotentReplay: true };
    }

    const historyLen = found.encryptedRevisionHistory?.length ?? 0;
    if (historyLen >= MAX_MESSAGE_REVISIONS) {
      return { doc: null, errorCode: 'MAX_EDITS_REACHED' };
    }

    const now = new Date();
    const priorSnapshot: EncryptedMessageRevision = {
      ciphertext: found.ciphertext,
      nonce: found.nonce,
      wrappedKeys: found.wrappedKeys,
      signature: found.signature,
      cryptoProfile: found.cryptoProfile,
      replacedAt: now,
    };
    const newHistory = [...(found.encryptedRevisionHistory ?? []), priorSnapshot];

    const filter: Filter<MessageDocument> = {
      _id: messageId,
      conversationId,
      fromIdentityId: senderIdentityId,
      deletedForEveryone: { $ne: true },
      messageType: { $ne: 'system' },
      $expr: {
        $eq: [{ $size: { $ifNull: ['$encryptedRevisionHistory', []] } }, historyLen],
      },
    };
    if (found.lastClientEditId === undefined) {
      (filter as Record<string, unknown>)['$or'] = [
        { lastClientEditId: { $exists: false } },
        { lastClientEditId: null },
      ];
    } else {
      (filter as Record<string, unknown>)['lastClientEditId'] = found.lastClientEditId;
    }

    const res = await this.collection.updateOne(filter, {
      $set: {
        ciphertext: newPayload.ciphertext,
        nonce: newPayload.nonce,
        wrappedKeys: newPayload.wrappedKeys,
        signature: newPayload.signature,
        cryptoProfile: newPayload.cryptoProfile,
        encryptedRevisionHistory: newHistory,
        lastClientEditId: clientEditId,
        lastEditedAt: now,
        updatedAt: now,
      },
    });

    if (res.matchedCount === 0) {
      const reRead = (await this.findOne({
        _id: messageId,
        conversationId,
      })) as MessageDocument | null;
      if (reRead?.lastClientEditId === clientEditId) {
        return { doc: reRead, errorCode: null, idempotentReplay: true };
      }
      if (reRead) {
        const l = reRead.encryptedRevisionHistory?.length ?? 0;
        if (l >= MAX_MESSAGE_REVISIONS) {
          return { doc: null, errorCode: 'MAX_EDITS_REACHED' };
        }
      }
      return { doc: null, errorCode: 'NOT_FOUND' };
    }

    const after = (await this.findByIdInConversation(
      conversationId,
      messageId
    )) as MessageDocument | null;
    return { doc: after, errorCode: null };
  }
}

let messageRepository: MessageRepository | null = null;

export function getMessageRepository(): MessageRepository {
  if (!messageRepository) {
    messageRepository = new MessageRepository();
  }
  return messageRepository;
}
