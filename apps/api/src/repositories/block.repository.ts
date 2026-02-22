/**
 * Block repository
 * Data access layer for block operations with MongoDB persistence
 *
 * PRIVACY NOTE: Blocks are one-directional and invisible to the blocked party.
 * Never expose block existence to the blocked identity.
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { BlockDocument, CreateBlockInput } from '../models/block';

/**
 * Block repository interface
 */
export interface IBlockRepository {
  findBlock(blockerIdentityId: ObjectId, blockedIdentityId: ObjectId): Promise<BlockDocument | null>;
  isBlocked(blockerIdentityId: ObjectId, blockedIdentityId: ObjectId): Promise<boolean>;
  isBlockedByEither(identityA: ObjectId, identityB: ObjectId): Promise<boolean>;
  create(input: CreateBlockInput): Promise<BlockDocument>;
  remove(blockerIdentityId: ObjectId, blockedIdentityId: ObjectId): Promise<boolean>;
  getBlockedByIdentity(identityId: ObjectId, limit?: number, cursor?: ObjectId): Promise<BlockDocument[]>;
  getBlockedIdentityIds(identityId: ObjectId): Promise<ObjectId[]>;
  countBlockedByIdentity(identityId: ObjectId): Promise<number>;
}

/**
 * Block repository implementation
 */
export class BlockRepository
  extends BaseRepository<BlockDocument>
  implements IBlockRepository {
  constructor() {
    super(Collections.BLOCKS);
  }

  /**
   * Find a specific block record
   */
  async findBlock(
    blockerIdentityId: ObjectId,
    blockedIdentityId: ObjectId
  ): Promise<BlockDocument | null> {
    return await this.findOne({
      blockerIdentityId,
      blockedIdentityId,
    });
  }

  /**
   * Check if blockerIdentityId has blocked blockedIdentityId
   */
  async isBlocked(
    blockerIdentityId: ObjectId,
    blockedIdentityId: ObjectId
  ): Promise<boolean> {
    const block = await this.findBlock(blockerIdentityId, blockedIdentityId);
    return block !== null;
  }

  /**
   * Check if either identity has blocked the other
   * Useful for friend request checks
   */
  async isBlockedByEither(identityA: ObjectId, identityB: ObjectId): Promise<boolean> {
    const block = await this.findOne({
      $or: [
        { blockerIdentityId: identityA, blockedIdentityId: identityB },
        { blockerIdentityId: identityB, blockedIdentityId: identityA },
      ],
    });
    return block !== null;
  }

  /**
   * Create a new block
   */
  async create(input: CreateBlockInput): Promise<BlockDocument> {
    const doc: Omit<BlockDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      blockerIdentityId: input.blockerIdentityId,
      blockedIdentityId: input.blockedIdentityId,
    };

    return await super.create(doc);
  }

  /**
   * Remove a block
   */
  async remove(
    blockerIdentityId: ObjectId,
    blockedIdentityId: ObjectId
  ): Promise<boolean> {
    const result = await this.collection.deleteOne({
      blockerIdentityId,
      blockedIdentityId,
    });
    return result.deletedCount === 1;
  }

  /**
   * Get all blocks created by an identity (for blocked list)
   * Uses cursor-based pagination
   */
  async getBlockedByIdentity(
    identityId: ObjectId,
    limit = 50,
    cursor?: ObjectId
  ): Promise<BlockDocument[]> {
    const filter: Record<string, unknown> = { blockerIdentityId: identityId };

    if (cursor) {
      filter._id = { $lt: cursor };
    }

    return await this.collection
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit)
      .toArray() as BlockDocument[];
  }

  /**
   * Get all blocked identity IDs for an identity
   * Used for filtering search results
   */
  async getBlockedIdentityIds(identityId: ObjectId): Promise<ObjectId[]> {
    const blocks = await this.collection
      .find({ blockerIdentityId: identityId })
      .project({ blockedIdentityId: 1 })
      .toArray();

    return blocks.map((b) => b.blockedIdentityId as ObjectId);
  }

  /**
   * Count how many identities are blocked by this identity
   */
  async countBlockedByIdentity(identityId: ObjectId): Promise<number> {
    return await this.count({ blockerIdentityId: identityId });
  }
}

let blockRepository: BlockRepository | null = null;

/**
 * Get the block repository instance
 */
export function getBlockRepository(): BlockRepository {
  if (!blockRepository) {
    blockRepository = new BlockRepository();
  }
  return blockRepository;
}
