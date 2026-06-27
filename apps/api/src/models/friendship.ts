/**
 * Friendship model
 * Represents an established friendship between two identities.
 *
 * Denormalised: each mutual friendship produces two documents
 * (one per direction) for efficient querying from either side.
 *
 * PRIVACY NOTE: Friendships are identity-scoped and never
 * leak User identity.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * Friendship document stored in MongoDB
 */
export interface FriendshipDocument extends BaseDocument {
  /** The identity whose friends list this record belongs to */
  identityId: ObjectId;

  /** The friend's identity ID */
  friendIdentityId: ObjectId;
}

/**
 * Friendship creation input (without system-generated fields)
 */
export interface CreateFriendshipInput {
  identityId: ObjectId;
  friendIdentityId: ObjectId;
}

/**
 * Public friendship representation (safe to send to client)
 */
export interface PublicFriend {
  /** The friend's identity ID */
  friendIdentityId: string;
  /** When the friendship was established */
  friendsSince: string;
}

/**
 * Convert a FriendshipDocument to PublicFriend (safe for client)
 */
export function toPublicFriend(doc: FriendshipDocument): PublicFriend {
  return {
    friendIdentityId: doc.friendIdentityId.toHexString(),
    friendsSince: doc.createdAt.toISOString(),
  };
}
