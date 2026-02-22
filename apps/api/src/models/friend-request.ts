/**
 * Friend Request model
 * Represents a pending, accepted, ignored, or cancelled friend request between identities
 *
 * PRIVACY NOTES:
 * - Ignored requests appear as "pending" to the sender indefinitely
 * - No timing side-channels should reveal if a request was ignored vs pending
 * - Friend requests do not expire
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * Friend request status
 */
export type FriendRequestStatus = 'pending' | 'accepted' | 'ignored' | 'cancelled';

/**
 * Friend request document stored in MongoDB
 */
export interface FriendRequestDocument extends BaseDocument {
  /** Identity that sent the request */
  fromIdentityId: ObjectId;

  /** Identity that received the request */
  toIdentityId: ObjectId;

  /** Current status of the request */
  status: FriendRequestStatus;

  /** When the recipient responded (if applicable) */
  respondedAt?: Date;
}

/**
 * Friend request creation input
 */
export interface CreateFriendRequestInput {
  fromIdentityId: ObjectId;
  toIdentityId: ObjectId;
  status?: FriendRequestStatus;
}

/**
 * Public friend request representation for the sender
 * Note: status is always shown as "pending" even if ignored (privacy protection)
 */
export interface PublicSentFriendRequest {
  id: string;
  toIdentityId: string;
  /** Always "pending" to sender - cannot distinguish ignored from pending */
  status: 'pending';
  createdAt: string;
}

/**
 * Public friend request representation for the recipient
 */
export interface PublicReceivedFriendRequest {
  id: string;
  fromIdentityId: string;
  createdAt: string;
}

/**
 * Convert a FriendRequestDocument to PublicSentFriendRequest
 * Privacy: status is always "pending" to sender (ignored appears as pending)
 */
export function toPublicSentFriendRequest(doc: FriendRequestDocument): PublicSentFriendRequest {
  return {
    id: doc._id.toHexString(),
    toIdentityId: doc.toIdentityId.toHexString(),
    status: 'pending',
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Convert a FriendRequestDocument to PublicReceivedFriendRequest
 */
export function toPublicReceivedFriendRequest(doc: FriendRequestDocument): PublicReceivedFriendRequest {
  return {
    id: doc._id.toHexString(),
    fromIdentityId: doc.fromIdentityId.toHexString(),
    createdAt: doc.createdAt.toISOString(),
  };
}
