/**
 * DM Reaction Repository
 *
 * Data access layer for encrypted DM reaction operations.
 * Reactions are E2E encrypted -- the server only handles ciphertext.
 *
 * @module repositories/dm-reaction
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  DmReactionDocument,
  CreateDmReactionInput,
} from '../models/dm-reaction';

/**
 * DM reaction repository interface.
 */
export interface IDmReactionRepository {
  findById(reactionId: ObjectId): Promise<DmReactionDocument | null>;
  findByClientReactionId(
    conversationId: string,
    clientReactionId: string
  ): Promise<DmReactionDocument | null>;
  createReaction(input: CreateDmReactionInput): Promise<DmReactionDocument>;
  getReactionsForMessages(
    conversationId: string,
    messageIds: ObjectId[],
  ): Promise<DmReactionDocument[]>;
  countReactionsOnMessage(messageId: ObjectId): Promise<number>;
  countReactionsOnMessageByRecipient(
    messageId: ObjectId,
    toIdentityId: ObjectId
  ): Promise<number>;
  deleteReaction(reactionId: ObjectId): Promise<boolean>;
}

/**
 * DM reaction repository implementation.
 */
export class DmReactionRepository
  extends BaseRepository<DmReactionDocument>
  implements IDmReactionRepository
{
  constructor() {
    super(Collections.DM_REACTIONS);
  }

  /**
   * Find a reaction by its ID.
   */
  async findById(reactionId: ObjectId): Promise<DmReactionDocument | null> {
    return await this.findOne({ _id: reactionId });
  }

  /**
   * Find a reaction by its client-provided reaction ID.
   * Used for deduplication.
   */
  async findByClientReactionId(
    conversationId: string,
    clientReactionId: string
  ): Promise<DmReactionDocument | null> {
    return await this.findOne({ conversationId, clientReactionId });
  }

  /**
   * Create a new encrypted reaction.
   */
  async createReaction(input: CreateDmReactionInput): Promise<DmReactionDocument> {
    return await this.create({
      messageId: input.messageId,
      conversationId: input.conversationId,
      toIdentityId: input.toIdentityId,
      ciphertext: input.ciphertext,
      nonce: input.nonce,
      wrappedKeys: input.wrappedKeys,
      signature: input.signature,
      cryptoProfile: input.cryptoProfile,
      clientReactionId: input.clientReactionId,
    });
  }

  /**
   * Get all reactions for a set of messages within a specific conversation.
   * The conversationId filter prevents cross-conversation data leakage.
   */
  async getReactionsForMessages(
    conversationId: string,
    messageIds: ObjectId[],
  ): Promise<DmReactionDocument[]> {
    if (messageIds.length === 0) return [];

    return await this.collection
      .find({ conversationId, messageId: { $in: messageIds } })
      .sort({ createdAt: 1 })
      .toArray() as DmReactionDocument[];
  }

  /**
   * Count total reactions on a message.
   */
  async countReactionsOnMessage(messageId: ObjectId): Promise<number> {
    return await this.collection.countDocuments({ messageId });
  }

  /**
   * Count reactions on a message addressed to a specific recipient.
   * In DMs, all reactions from identity A have toIdentityId = B,
   * so this effectively counts reactions from the other participant.
   */
  async countReactionsOnMessageByRecipient(
    messageId: ObjectId,
    toIdentityId: ObjectId
  ): Promise<number> {
    return await this.collection.countDocuments({ messageId, toIdentityId });
  }

  /**
   * Delete a reaction by ID.
   */
  async deleteReaction(reactionId: ObjectId): Promise<boolean> {
    return await this.deleteById(reactionId);
  }
}

let dmReactionRepository: DmReactionRepository | null = null;

/**
 * Get the DM reaction repository singleton instance.
 */
export function getDmReactionRepository(): DmReactionRepository {
  if (!dmReactionRepository) {
    dmReactionRepository = new DmReactionRepository();
  }
  return dmReactionRepository;
}
