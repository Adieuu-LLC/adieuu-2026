/**
 * Friendship repository
 * Data access layer for friendship operations with MongoDB persistence
 *
 * NOTE: Two records are created per friendship (A→B and B→A) to enable
 * efficient "get my friends" queries without complex aggregation.
 */

import { ObjectId, type Filter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  FriendshipDocument,
  CreateFriendshipInput,
  FriendshipSource,
} from '../models/friendship';

/**
 * Friendship repository interface
 */
export interface IFriendshipRepository {
  findFriendship(identityId: ObjectId, friendId: ObjectId): Promise<FriendshipDocument | null>;
  areFriends(identityA: ObjectId, identityB: ObjectId): Promise<boolean>;
  createFriendship(identityA: ObjectId, identityB: ObjectId, source: FriendshipSource, requestId?: ObjectId): Promise<void>;
  removeFriendship(identityA: ObjectId, identityB: ObjectId): Promise<boolean>;
  getFriends(identityId: ObjectId, limit?: number, cursor?: ObjectId, search?: string): Promise<FriendshipDocument[]>;
  countFriends(identityId: ObjectId): Promise<number>;
}

/**
 * Friendship repository implementation
 */
export class FriendshipRepository
  extends BaseRepository<FriendshipDocument>
  implements IFriendshipRepository {
  constructor() {
    super(Collections.FRIENDSHIPS);
  }

  /**
   * Find a specific friendship record
   */
  async findFriendship(
    identityId: ObjectId,
    friendId: ObjectId
  ): Promise<FriendshipDocument | null> {
    return await this.findOne({
      identityId,
      friendIdentityId: friendId,
    });
  }

  /**
   * Check if two identities are friends
   */
  async areFriends(
    identityA: ObjectId,
    identityB: ObjectId
  ): Promise<boolean> {
    const friendship = await this.findFriendship(identityA, identityB);
    return friendship !== null;
  }

  /**
   * Create a friendship between two identities
   * Creates two records (A→B and B→A) for efficient queries
   */
  async createFriendship(
    identityA: ObjectId,
    identityB: ObjectId,
    source: FriendshipSource,
    requestId?: ObjectId
  ): Promise<void> {
    const metadata = {
      source,
      requestId,
    };

    // Create A → B record
    const docA: Omit<FriendshipDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      identityId: identityA,
      friendIdentityId: identityB,
      metadata,
    };

    // Create B → A record
    const docB: Omit<FriendshipDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      identityId: identityB,
      friendIdentityId: identityA,
      metadata,
    };

    // Insert both records
    await Promise.all([
      super.create(docA),
      super.create(docB),
    ]);
  }

  /**
   * Remove a friendship between two identities
   * Removes both records (A→B and B→A)
   */
  async removeFriendship(
    identityA: ObjectId,
    identityB: ObjectId
  ): Promise<boolean> {
    const result = await this.collection.deleteMany({
      $or: [
        { identityId: identityA, friendIdentityId: identityB },
        { identityId: identityB, friendIdentityId: identityA },
      ],
    });

    return result.deletedCount > 0;
  }

  /**
   * Get friends list for an identity with pagination
   * Returns friendships sorted by most recent first
   */
  async getFriends(
    identityId: ObjectId,
    limit = 50,
    cursor?: ObjectId
  ): Promise<FriendshipDocument[]> {
    const filter: Filter<FriendshipDocument> = {
      identityId,
    };

    if (cursor) {
      filter._id = { $lt: cursor };
    }

    return await this.collection
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray() as FriendshipDocument[];
  }

  /**
   * Count total friends for an identity
   */
  async countFriends(identityId: ObjectId): Promise<number> {
    return await this.count({ identityId });
  }

  /**
   * Get all friend identity IDs for an identity
   * Used for efficient filtering
   */
  async getFriendIdentityIds(identityId: ObjectId): Promise<ObjectId[]> {
    const friendships = await this.collection
      .find({ identityId })
      .project({ friendIdentityId: 1 })
      .toArray();

    return friendships.map((f) => f.friendIdentityId as ObjectId);
  }
}

let friendshipRepository: FriendshipRepository | null = null;

/**
 * Get the friendship repository instance
 */
export function getFriendshipRepository(): FriendshipRepository {
  if (!friendshipRepository) {
    friendshipRepository = new FriendshipRepository();
  }
  return friendshipRepository;
}
