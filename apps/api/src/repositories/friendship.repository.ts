/**
 * Friendship repository
 * Data access layer for friendship operations with MongoDB persistence
 *
 * Friendships are denormalised: each mutual friendship creates two documents
 * (one per direction) for efficient querying from either side.
 *
 * PRIVACY NOTE: Friendships are identity-scoped and never
 * leak User identity.
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import { withTimestamps } from '../models/base';
import type { FriendshipDocument } from '../models/friendship';

/**
 * Friendship repository interface
 */
export interface IFriendshipRepository {
  areFriends(identityA: ObjectId, identityB: ObjectId): Promise<boolean>;
  create(identityA: ObjectId, identityB: ObjectId): Promise<void>;
  remove(identityA: ObjectId, identityB: ObjectId): Promise<boolean>;
  getFriends(identityId: ObjectId, limit?: number, cursor?: ObjectId): Promise<FriendshipDocument[]>;
  searchFriends(identityId: ObjectId, friendIdentityIds: ObjectId[]): Promise<FriendshipDocument[]>;
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
   * Check if two identities are friends
   */
  async areFriends(identityA: ObjectId, identityB: ObjectId): Promise<boolean> {
    const friendship = await this.findOne({
      identityId: identityA,
      friendIdentityId: identityB,
    });
    return friendship !== null;
  }

  /**
   * Create a mutual friendship (inserts two documents)
   */
  async create(identityA: ObjectId, identityB: ObjectId): Promise<void> {
    const now = new Date();

    await this.collection.insertMany([
      withTimestamps({ identityId: identityA, friendIdentityId: identityB }),
      withTimestamps({ identityId: identityB, friendIdentityId: identityA }),
    ] as Array<Omit<FriendshipDocument, '_id'>>);
  }

  /**
   * Remove a mutual friendship (deletes both documents)
   */
  async remove(identityA: ObjectId, identityB: ObjectId): Promise<boolean> {
    const result = await this.collection.deleteMany({
      $or: [
        { identityId: identityA, friendIdentityId: identityB },
        { identityId: identityB, friendIdentityId: identityA },
      ],
    });
    return result.deletedCount >= 1;
  }

  /**
   * Get friends for an identity with cursor-based pagination
   */
  async getFriends(
    identityId: ObjectId,
    limit = 50,
    cursor?: ObjectId
  ): Promise<FriendshipDocument[]> {
    const filter: Record<string, unknown> = { identityId };

    if (cursor) {
      filter._id = { $lt: cursor };
    }

    return await this.collection
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit)
      .toArray() as FriendshipDocument[];
  }

  /**
   * Find friendships by a set of friend identity IDs (for search results)
   */
  async searchFriends(
    identityId: ObjectId,
    friendIdentityIds: ObjectId[]
  ): Promise<FriendshipDocument[]> {
    if (friendIdentityIds.length === 0) return [];

    return await this.collection
      .find({
        identityId,
        friendIdentityId: { $in: friendIdentityIds },
      })
      .toArray() as FriendshipDocument[];
  }

  /**
   * Count friends for an identity
   */
  async countFriends(identityId: ObjectId): Promise<number> {
    return await this.count({ identityId });
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
