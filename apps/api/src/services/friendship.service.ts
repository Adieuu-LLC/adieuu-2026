/**
 * @fileoverview Friendship Service
 *
 * Provides friendship management functionality.
 * Handles listing friends, checking friendship status, and removing friends.
 *
 * @module services/friendship
 */

import { ObjectId } from 'mongodb';
import { getFriendshipRepository } from '../repositories/friendship.repository';
import { getFriendRequestRepository } from '../repositories/friend-request.repository';
import { getIdentityRepository } from '../repositories/identity.repository';
import { toPublicIdentity, type PublicIdentity } from '../models/identity';
import elog from '../utils/adieuuLogger';

/**
 * Friend with identity info
 */
export interface FriendWithInfo {
  identity: PublicIdentity;
  friendsSince: string;
}

/**
 * Friendship status between two identities
 */
export type FriendshipStatusType = 'friends' | 'request_sent' | 'request_received' | 'none';

/**
 * Friendship status result
 */
export interface FriendshipStatusResult {
  status: FriendshipStatusType;
  friendsSince?: string;
  requestId?: string;
}

/**
 * Get friends list with pagination
 */
export async function getFriends(
  identityId: string | ObjectId,
  limit = 50,
  cursor?: string,
  search?: string
): Promise<{ friends: FriendWithInfo[]; cursor: string | null; total: number }> {
  const friendshipRepo = getFriendshipRepository();
  const identityRepo = getIdentityRepository();

  const identityObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);

  const cursorObjId = cursor ? new ObjectId(cursor) : undefined;

  // Get friendships
  const friendships = await friendshipRepo.getFriends(identityObjId, limit + 1, cursorObjId);

  const hasMore = friendships.length > limit;
  const resultFriendships = hasMore ? friendships.slice(0, limit) : friendships;

  // Fetch identity info for each friend
  const friendsWithInfo: FriendWithInfo[] = [];

  for (const friendship of resultFriendships) {
    const friendIdentity = await identityRepo.findByIdentityId(friendship.friendIdentityId);
    if (friendIdentity) {
      // If search is provided, filter by username/displayName
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          friendIdentity.username.toLowerCase().includes(searchLower) ||
          friendIdentity.displayName.toLowerCase().includes(searchLower);

        if (!matchesSearch) {
          continue;
        }
      }

      friendsWithInfo.push({
        identity: toPublicIdentity(friendIdentity),
        friendsSince: friendship.createdAt.toISOString(),
      });
    }
  }

  // Get total count
  const total = await friendshipRepo.countFriends(identityObjId);

  const nextCursor = hasMore && resultFriendships.length > 0
    ? resultFriendships[resultFriendships.length - 1]!._id.toHexString()
    : null;

  return {
    friends: friendsWithInfo,
    cursor: nextCursor,
    total,
  };
}

/**
 * Check friendship status between two identities
 */
export async function checkFriendshipStatus(
  identityId: string | ObjectId,
  otherIdentityId: string | ObjectId
): Promise<FriendshipStatusResult> {
  const friendshipRepo = getFriendshipRepository();
  const friendRequestRepo = getFriendRequestRepository();

  const identityObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);
  const otherObjId = otherIdentityId instanceof ObjectId
    ? otherIdentityId
    : new ObjectId(otherIdentityId);

  // Check if they're friends
  const friendship = await friendshipRepo.findFriendship(identityObjId, otherObjId);
  if (friendship) {
    return {
      status: 'friends',
      friendsSince: friendship.createdAt.toISOString(),
    };
  }

  // Check if there's a pending request from us
  const sentRequest = await friendRequestRepo.findByParties(identityObjId, otherObjId);
  if (sentRequest && (sentRequest.status === 'pending' || sentRequest.status === 'ignored')) {
    return {
      status: 'request_sent',
      requestId: sentRequest._id.toHexString(),
    };
  }

  // Check if there's a pending request to us
  const receivedRequest = await friendRequestRepo.findByParties(otherObjId, identityObjId);
  if (receivedRequest && receivedRequest.status === 'pending') {
    return {
      status: 'request_received',
      requestId: receivedRequest._id.toHexString(),
    };
  }

  return { status: 'none' };
}

/**
 * Remove a friend
 * Removes the friendship for both parties, no notification sent
 */
export async function removeFriend(
  identityId: string | ObjectId,
  friendIdentityId: string | ObjectId
): Promise<{ success: boolean; error?: string }> {
  const friendshipRepo = getFriendshipRepository();

  const identityObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);
  const friendObjId = friendIdentityId instanceof ObjectId
    ? friendIdentityId
    : new ObjectId(friendIdentityId);

  // Check if they're actually friends
  const areFriends = await friendshipRepo.areFriends(identityObjId, friendObjId);
  if (!areFriends) {
    return {
      success: false,
      error: 'Not friends with this identity',
    };
  }

  // Remove the friendship (both directions)
  await friendshipRepo.removeFriendship(identityObjId, friendObjId);

  elog.info('Friendship removed', {
    identityId: identityObjId.toHexString(),
  });

  return { success: true };
}

/**
 * Get all friend identity IDs for an identity
 * Used for efficient filtering
 */
export async function getFriendIdentityIds(
  identityId: string | ObjectId
): Promise<ObjectId[]> {
  const friendshipRepo = getFriendshipRepository();

  const identityObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);

  return await friendshipRepo.getFriendIdentityIds(identityObjId);
}

/**
 * Check if two identities are friends
 */
export async function areFriends(
  identityA: string | ObjectId,
  identityB: string | ObjectId
): Promise<boolean> {
  const friendshipRepo = getFriendshipRepository();

  const identityAObjId = identityA instanceof ObjectId
    ? identityA
    : new ObjectId(identityA);
  const identityBObjId = identityB instanceof ObjectId
    ? identityB
    : new ObjectId(identityB);

  return await friendshipRepo.areFriends(identityAObjId, identityBObjId);
}
