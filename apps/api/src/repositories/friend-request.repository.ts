/**
 * Friend Request repository
 * Data access layer for friend request operations with MongoDB persistence
 *
 * PRIVACY NOTES:
 * - Ignored requests appear as "pending" to sender
 * - Never expose ignored status to the sender
 */

import { ObjectId, type Filter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  FriendRequestDocument,
  CreateFriendRequestInput,
  FriendRequestStatus,
} from '../models/friend-request';
import { withUpdatedAt } from '../models/base';

/**
 * Friend request repository interface
 */
export interface IFriendRequestRepository {
  findById(id: string | ObjectId): Promise<FriendRequestDocument | null>;
  findByParties(fromId: ObjectId, toId: ObjectId): Promise<FriendRequestDocument | null>;
  findPendingBetween(identityA: ObjectId, identityB: ObjectId): Promise<FriendRequestDocument | null>;
  create(input: CreateFriendRequestInput): Promise<FriendRequestDocument>;
  updateStatus(id: ObjectId, status: FriendRequestStatus): Promise<FriendRequestDocument | null>;
  getIncomingRequests(identityId: ObjectId, status?: FriendRequestStatus, limit?: number, cursor?: ObjectId): Promise<FriendRequestDocument[]>;
  getSentRequests(identityId: ObjectId, limit?: number, cursor?: ObjectId): Promise<FriendRequestDocument[]>;
  cancelOrIgnoreBetween(identityA: ObjectId, identityB: ObjectId): Promise<void>;
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
   * Find a friend request by ID
   */
  async findById(id: string | ObjectId): Promise<FriendRequestDocument | null> {
    return await super.findById(id);
  }

  /**
   * Find a friend request between two specific identities in one direction
   */
  async findByParties(
    fromId: ObjectId,
    toId: ObjectId
  ): Promise<FriendRequestDocument | null> {
    return await this.findOne({
      fromIdentityId: fromId,
      toIdentityId: toId,
    });
  }

  /**
   * Find any pending request between two identities (either direction)
   * Used for mutual-add detection
   */
  async findPendingBetween(
    identityA: ObjectId,
    identityB: ObjectId
  ): Promise<FriendRequestDocument | null> {
    return await this.findOne({
      $or: [
        { fromIdentityId: identityA, toIdentityId: identityB, status: 'pending' },
        { fromIdentityId: identityB, toIdentityId: identityA, status: 'pending' },
      ],
    });
  }

  /**
   * Create a new friend request
   */
  async create(input: CreateFriendRequestInput): Promise<FriendRequestDocument> {
    const doc: Omit<FriendRequestDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      fromIdentityId: input.fromIdentityId,
      toIdentityId: input.toIdentityId,
      status: input.status ?? 'pending',
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
    const updateDoc = withUpdatedAt({
      status,
      respondedAt: status !== 'pending' ? new Date() : undefined,
    });

    const result = await this.collection.findOneAndUpdate(
      { _id: id },
      { $set: updateDoc },
      { returnDocument: 'after' }
    );

    return result as FriendRequestDocument | null;
  }

  /**
   * Get incoming friend requests for an identity
   * Note: Only returns pending requests by default (ignored requests are hidden from recipient too)
   */
  async getIncomingRequests(
    identityId: ObjectId,
    status: FriendRequestStatus = 'pending',
    limit = 20,
    cursor?: ObjectId
  ): Promise<FriendRequestDocument[]> {
    const filter: Filter<FriendRequestDocument> = {
      toIdentityId: identityId,
      status,
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
   * Get sent friend requests for an identity
   * Note: Returns pending and ignored requests (but ignored appears as pending to sender)
   */
  async getSentRequests(
    identityId: ObjectId,
    limit = 20,
    cursor?: ObjectId
  ): Promise<FriendRequestDocument[]> {
    const filter: Filter<FriendRequestDocument> = {
      fromIdentityId: identityId,
      status: { $in: ['pending', 'ignored'] },
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
   * Cancel or ignore all pending requests between two identities
   * Used when one identity blocks the other
   */
  async cancelOrIgnoreBetween(
    identityA: ObjectId,
    identityB: ObjectId
  ): Promise<void> {
    const now = new Date();

    // Cancel requests sent by A to B
    await this.collection.updateMany(
      {
        fromIdentityId: identityA,
        toIdentityId: identityB,
        status: 'pending',
      },
      {
        $set: {
          status: 'cancelled',
          updatedAt: now,
          respondedAt: now,
        },
      }
    );

    // Ignore requests sent by B to A
    await this.collection.updateMany(
      {
        fromIdentityId: identityB,
        toIdentityId: identityA,
        status: 'pending',
      },
      {
        $set: {
          status: 'ignored',
          updatedAt: now,
          respondedAt: now,
        },
      }
    );
  }

  /**
   * Check if a request already exists between two identities
   */
  async existsBetween(
    fromId: ObjectId,
    toId: ObjectId,
    excludeStatuses?: FriendRequestStatus[]
  ): Promise<boolean> {
    const filter: Filter<FriendRequestDocument> = {
      fromIdentityId: fromId,
      toIdentityId: toId,
    };

    if (excludeStatuses && excludeStatuses.length > 0) {
      filter.status = { $nin: excludeStatuses };
    }

    const count = await this.count(filter);
    return count > 0;
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
