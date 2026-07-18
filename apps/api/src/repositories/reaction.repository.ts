/**
 * Reaction repository
 * Data access layer for encrypted reaction operations with MongoDB persistence.
 *
 * Reactions are E2E encrypted -- the repository handles only ciphertext storage
 * and metadata-based queries. Content decryption happens exclusively client-side.
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { ReactionDocument, CreateReactionInput } from '../models/reaction';

export class ReactionRepository extends BaseRepository<ReactionDocument> {
  constructor() {
    super(Collections.REACTIONS);
  }

  /**
   * Create a new reaction.
   */
  async createReaction(input: CreateReactionInput): Promise<ReactionDocument> {
    return await this.create(
      input as Omit<ReactionDocument, '_id' | 'createdAt' | 'updatedAt'>
    );
  }

  /**
   * Batch-fetch reactions for a set of message IDs within a conversation.
   * Returns reactions sorted by creation time (oldest first).
   */
  async findByMessageIds(
    conversationId: ObjectId,
    messageIds: ObjectId[]
  ): Promise<ReactionDocument[]> {
    return await this.collection
      .find({
        conversationId,
        messageId: { $in: messageIds },
      })
      .sort({ createdAt: 1 })
      .toArray() as ReactionDocument[];
  }

  /**
   * Return the subset of the given message ids (within a conversation) that
   * have at least one reaction. Count-only via a `distinct` on the indexed
   * `messageId` field — never decrypts reaction content.
   */
  async messageIdsWithReactions(
    conversationId: ObjectId,
    messageIds: ObjectId[],
  ): Promise<Set<string>> {
    if (messageIds.length === 0) return new Set();
    const ids = (await this.collection.distinct('messageId', {
      conversationId,
      messageId: { $in: messageIds },
    })) as ObjectId[];
    return new Set(ids.map((id) => id.toHexString()));
  }

  /**
   * Count reactions by a specific identity on a specific message.
   * Used to enforce the per-user-per-message limit.
   */
  async countByIdentityAndMessage(
    fromIdentityId: ObjectId,
    messageId: ObjectId
  ): Promise<number> {
    return await this.collection.countDocuments({
      fromIdentityId,
      messageId,
    } as Parameters<typeof this.collection.countDocuments>[0]);
  }

  /**
   * Count total reactions on a specific message.
   * Used to enforce the hard per-message cap.
   */
  async countByMessage(messageId: ObjectId): Promise<number> {
    return await this.collection.countDocuments({
      messageId,
    } as Parameters<typeof this.collection.countDocuments>[0]);
  }

  /**
   * Delete all reactions for a conversation (for group cleanup/termination).
   */
  async deleteByConversation(conversationId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({ conversationId });
    return result.deletedCount;
  }

  /**
   * Delete all reactions for a specific message.
   */
  async deleteByMessage(messageId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({ messageId });
    return result.deletedCount;
  }
}

let reactionRepository: ReactionRepository | null = null;

export function getReactionRepository(): ReactionRepository {
  if (!reactionRepository) {
    reactionRepository = new ReactionRepository();
  }
  return reactionRepository;
}
