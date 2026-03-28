/**
 * Friend request repository
 * Data access layer for friend request operations with MongoDB persistence
 *
 * PRIVACY NOTE: Ignored requests are invisible to the sender.
 * Never expose ignore status to the requesting identity.
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  FriendRequestDocument,
  FriendRequestStatus,
  CreateFriendRequestInput,
} from '../models/friend-request';

/**
 * Friend request repository interface
 */
export interface IFriendRequestRepository {
  findById(id: string | ObjectId): Promise<FriendRequestDocument | null>;
  findPending(fromIdentityId: ObjectId, toIdentityId: ObjectId): Promise<FriendRequestDocument | null>;
  findIncoming(identityId: ObjectId, limit?: number, cursor?: ObjectId): Promise<FriendRequestDocument[]>;
  findOutgoing(identityId: ObjectId, limit?: number, cursor?: ObjectId): Promise<FriendRequestDocument[]>;
  create(input: CreateFriendRequestInput): Promise<FriendRequestDocument>;
  updateStatus(id: ObjectId, status: FriendRequestStatus): Promise<FriendRequestDocument | null>;
  countIncoming(identityId: ObjectId): Promise<number>;
  deleteById(id: string | ObjectId): Promise<boolean>;
  deleteByPair(identityA: ObjectId, identityB: ObjectId): Promise<number>;
}

/**
 * Friend request repository implementation
 */
export class FriendRequestRepository
  extends BaseRepository<FriendRequestDocument>
  implements IFriendRequestRepository {
  constructor() {
    super(Collections.FRIEND_REQUESTS);
  }

  /**
   * Find a pending request between two identities (in either direction)
   */
  async findPending(
    fromIdentityId: ObjectId,
    toIdentityId: ObjectId
  ): Promise<FriendRequestDocument | null> {
    return await this.findOne({
      fromIdentityId,
      toIdentityId,
      status: 'pending',
    });
  }

  /**
   * Find pending incoming requests for an identity
   */
  async findIncoming(
    identityId: ObjectId,
    limit = 50,
    cursor?: ObjectId
  ): Promise<FriendRequestDocument[]> {
    const filter: Record<string, unknown> = {
      toIdentityId: identityId,
      status: 'pending',
    };

    if (cursor) {
      filter._id = { $lt: cursor };
    }

    return await this.collection
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit)
      .toArray() as FriendRequestDocument[];
  }

  /**
   * Find pending outgoing requests for an identity
   */
  async findOutgoing(
    identityId: ObjectId,
    limit = 50,
    cursor?: ObjectId
  ): Promise<FriendRequestDocument[]> {
    const filter: Record<string, unknown> = {
      fromIdentityId: identityId,
      status: 'pending',
    };

    if (cursor) {
      filter._id = { $lt: cursor };
    }

    return await this.collection
      .find(filter)
      .sort({ _id: -1 })
      .limit(limit)
      .toArray() as FriendRequestDocument[];
  }

  /**
   * Create a new friend request
   */
  async create(input: CreateFriendRequestInput): Promise<FriendRequestDocument> {
    const doc: Omit<FriendRequestDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      fromIdentityId: input.fromIdentityId,
      toIdentityId: input.toIdentityId,
      status: 'pending',
    };

    return await super.create(doc);
  }

  /**
   * Update the status of a friend request
   */
  async updateStatus(
    id: ObjectId,
    status: FriendRequestStatus
  ): Promise<FriendRequestDocument | null> {
    return await this.updateById(id, { status } as Partial<Omit<FriendRequestDocument, '_id' | 'createdAt'>>);
  }

  /**
   * Count pending incoming requests for an identity
   */
  async countIncoming(identityId: ObjectId): Promise<number> {
    return await this.count({
      toIdentityId: identityId,
      status: 'pending',
    });
  }

  /**
   * Delete all friend requests between two identities (both directions)
   */
  async deleteByPair(identityA: ObjectId, identityB: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({
      $or: [
        { fromIdentityId: identityA, toIdentityId: identityB },
        { fromIdentityId: identityB, toIdentityId: identityA },
      ],
    });
    return result.deletedCount;
  }

  /**
   * Find any pending request between two identities in either direction
   */
  async findPendingBetween(
    identityA: ObjectId,
    identityB: ObjectId
  ): Promise<FriendRequestDocument | null> {
    return await this.findOne({
      $or: [
        { fromIdentityId: identityA, toIdentityId: identityB },
        { fromIdentityId: identityB, toIdentityId: identityA },
      ],
      status: 'pending',
    });
  }
}

let friendRequestRepository: FriendRequestRepository | null = null;

/**
 * Get the friend request repository instance
 */
export function getFriendRequestRepository(): FriendRequestRepository {
  if (!friendRequestRepository) {
    friendRequestRepository = new FriendRequestRepository();
  }
  return friendRequestRepository;
}
