/**
 * Friend request model
 * Represents a pending, accepted, or ignored friend request between two identities.
 *
 * PRIVACY NOTE: Friend requests are identity-scoped.
 * Ignored requests are silent -- the sender receives no indication.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * Possible statuses for a friend request
 */
export type FriendRequestStatus = 'pending' | 'accepted' | 'ignored';

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
}

/**
 * Friend request creation input (without system-generated fields)
 */
export interface CreateFriendRequestInput {
  fromIdentityId: ObjectId;
  toIdentityId: ObjectId;
}

/**
 * Public friend request representation (safe to send to client)
 */
export interface PublicFriendRequest {
  id: string;
  fromIdentityId: string;
  toIdentityId: string;
  status: FriendRequestStatus;
  createdAt: string;
}

/**
 * Convert a FriendRequestDocument to PublicFriendRequest (safe for client)
 */
export function toPublicFriendRequest(doc: FriendRequestDocument): PublicFriendRequest {
  return {
    id: doc._id.toHexString(),
    fromIdentityId: doc.fromIdentityId.toHexString(),
    toIdentityId: doc.toIdentityId.toHexString(),
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  };
}
