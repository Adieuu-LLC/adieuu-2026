/**
 * Friendship model
 * Represents an established friendship between two identities
 *
 * NOTE: Two records are created per friendship (A→B and B→A) to enable
 * efficient "get my friends" queries without complex aggregation.
 */

import type { ObjectId } from 'mongodb';
import type { BaseDocument } from './base';

/**
 * How the friendship was established
 */
export type FriendshipSource = 'request_accepted' | 'mutual_add';

/**
 * Friendship metadata
 */
export interface FriendshipMetadata {
  /** How the friendship was created */
  source: FriendshipSource;
  /** Original request ID (if from request) */
  requestId?: ObjectId;
}

/**
 * Friendship document stored in MongoDB
 */
export interface FriendshipDocument extends BaseDocument {
  /** The identity whose friends list this record belongs to */
  identityId: ObjectId;

  /** The friend's identity */
  friendIdentityId: ObjectId;

  /** Friendship metadata */
  metadata: FriendshipMetadata;
}

/**
 * Friendship creation input
 */
export interface CreateFriendshipInput {
  identityId: ObjectId;
  friendIdentityId: ObjectId;
  metadata: FriendshipMetadata;
}

/**
 * Public friendship representation (safe to send to client)
 */
export interface PublicFriendship {
  friendIdentityId: string;
  friendsSince: string;
}

/**
 * Convert a FriendshipDocument to PublicFriendship
 */
export function toPublicFriendship(doc: FriendshipDocument): PublicFriendship {
  return {
    friendIdentityId: doc.friendIdentityId.toHexString(),
    friendsSince: doc.createdAt.toISOString(),
  };
}
