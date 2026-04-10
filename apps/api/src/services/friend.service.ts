/**
 * @fileoverview Friend Service
 *
 * Provides friend request and friendship management.
 * Handles sending, accepting, ignoring requests and managing the friends list.
 *
 * PRIVACY NOTES:
 * - All operations are identity-scoped (never linked to User)
 * - Ignored requests are silent -- the sender receives no indication
 * - Block checks prevent requests between blocked identities
 *
 * @module services/friend
 */

import { ObjectId } from 'mongodb';
import { getFriendRequestRepository } from '../repositories/friend-request.repository';
import { getFriendshipRepository } from '../repositories/friendship.repository';
import { getBlockRepository } from '../repositories/block.repository';
import { getIdentityRepository } from '../repositories/identity.repository';
import { createNotification } from './notification.service';
import { checkAndAward } from './achievement.service';
import { toPublicFriendRequest, type PublicFriendRequest } from '../models/friend-request';
import { toPublicIdentity, type PublicIdentity } from '../models/identity';
import { getRedis, isRedisConnected, RedisKeys } from '../db';
import { config } from '../config';
import elog from '../utils/adieuuLogger';

/**
 * Friendship status between two identities
 */
export type FriendshipStatus = 'none' | 'friends' | 'pending_incoming' | 'pending_outgoing';

/**
 * Result of a friend request operation
 */
export interface FriendRequestResult {
  success: boolean;
  request?: PublicFriendRequest;
  error?: string;
  errorCode?:
    | 'CANNOT_FRIEND_SELF'
    | 'BLOCKED'
    | 'ALREADY_FRIENDS'
    | 'REQUEST_EXISTS'
    | 'IDENTITY_NOT_FOUND'
    | 'REQUEST_NOT_FOUND'
    | 'NOT_AUTHORIZED';
}

/**
 * Result of a friendship operation
 */
export interface FriendshipResult {
  success: boolean;
  error?: string;
  errorCode?: 'NOT_FRIENDS' | 'IDENTITY_NOT_FOUND';
}

/**
 * Friend with denormalised identity info
 */
export interface FriendInfo {
  identity: PublicIdentity;
  friendsSince: string;
}

/**
 * Incoming friend request with sender info
 */
export interface IncomingFriendRequestInfo {
  request: PublicFriendRequest;
  fromIdentity: PublicIdentity;
}

// ---------------------------------------------------------------------------
// Redis event publishing
// ---------------------------------------------------------------------------

async function publishFriendEvent(
  recipientIdentityId: string,
  event: Record<string, unknown>
): Promise<void> {
  if (!isRedisConnected()) {
    elog.warn('Skipping friend event publish: Redis not connected', {
      recipientIdentityId,
      eventType: event.type,
    });
    return;
  }

  try {
    const redis = getRedis();
    const channel = `${config.redis.keyPrefix}${RedisKeys.identityChannel(recipientIdentityId)}`;
    const subscriberCount = await redis.publish(channel, JSON.stringify(event));
    elog.info('Published friend event', {
      channel,
      eventType: event.type,
      subscriberCount,
    });
  } catch (error) {
    elog.warn('Failed to publish friend event via Redis', { error, recipientIdentityId });
  }
}

// ---------------------------------------------------------------------------
// Friend request operations
// ---------------------------------------------------------------------------

/**
 * Send a friend request from one identity to another.
 */
export async function sendFriendRequest(
  fromIdentityId: string | ObjectId,
  toIdentityId: string | ObjectId
): Promise<FriendRequestResult> {
  const requestRepo = getFriendRequestRepository();
  const friendshipRepo = getFriendshipRepository();
  const blockRepo = getBlockRepository();
  const identityRepo = getIdentityRepository();

  const fromObjId = fromIdentityId instanceof ObjectId
    ? fromIdentityId
    : new ObjectId(fromIdentityId);
  const toObjId = toIdentityId instanceof ObjectId
    ? toIdentityId
    : new ObjectId(toIdentityId);

  const fromHex = fromObjId.toHexString();
  const toHex = toObjId.toHexString();

  if (fromHex === toHex) {
    return { success: false, error: 'Cannot send friend request to yourself', errorCode: 'CANNOT_FRIEND_SELF' };
  }

  // Verify target identity exists
  const toIdentity = await identityRepo.findByIdentityId(toObjId);
  if (!toIdentity) {
    return { success: false, error: 'Identity not found', errorCode: 'IDENTITY_NOT_FOUND' };
  }

  // Check for blocks in either direction
  const isBlocked = await blockRepo.isBlockedByEither(fromObjId, toObjId);
  if (isBlocked) {
    // Silently fail for privacy -- blocked user should not know they are blocked
    return { success: true };
  }

  // Check if already friends
  const alreadyFriends = await friendshipRepo.areFriends(fromObjId, toObjId);
  if (alreadyFriends) {
    return { success: false, error: 'Already friends', errorCode: 'ALREADY_FRIENDS' };
  }

  // Check for existing pending request in either direction
  const existingRequest = await requestRepo.findPendingBetween(fromObjId, toObjId);
  if (existingRequest) {
    return { success: false, error: 'A pending friend request already exists', errorCode: 'REQUEST_EXISTS' };
  }

  // Create the request
  const request = await requestRepo.create({
    fromIdentityId: fromObjId,
    toIdentityId: toObjId,
  });

  // Create notification for recipient
  const fromIdentity = await identityRepo.findByIdentityId(fromObjId);
  const fromPublic = fromIdentity ? toPublicIdentity(fromIdentity) : undefined;

  await createNotification(toObjId, 'friend_request_received', {
    requestId: request._id.toHexString(),
    fromIdentityId: fromHex,
    fromDisplayName: fromPublic?.displayName,
    fromUsername: fromPublic?.username,
  });

  // Publish real-time event via Redis
  if (fromPublic) {
    await publishFriendEvent(toHex, {
      type: 'friend_request_received',
      data: {
        requestId: request._id.toHexString(),
        fromIdentity: fromPublic,
      },
    });
  }

  elog.info('Friend request sent', { fromIdentityId: fromHex });

  return { success: true, request: toPublicFriendRequest(request) };
}

/**
 * Accept a friend request (only the recipient can accept).
 */
export async function acceptFriendRequest(
  requestId: string | ObjectId,
  identityId: string | ObjectId
): Promise<FriendRequestResult> {
  const requestRepo = getFriendRequestRepository();
  const friendshipRepo = getFriendshipRepository();
  const identityRepo = getIdentityRepository();

  const reqObjId = requestId instanceof ObjectId ? requestId : new ObjectId(requestId);
  const identityObjId = identityId instanceof ObjectId ? identityId : new ObjectId(identityId);

  const request = await requestRepo.findById(reqObjId);
  if (!request || request.status !== 'pending') {
    return { success: false, error: 'Friend request not found', errorCode: 'REQUEST_NOT_FOUND' };
  }

  // Only the recipient can accept
  if (request.toIdentityId.toHexString() !== identityObjId.toHexString()) {
    return { success: false, error: 'Not authorized', errorCode: 'NOT_AUTHORIZED' };
  }

  // Update request status
  await requestRepo.updateStatus(reqObjId, 'accepted');

  // Create mutual friendship
  await friendshipRepo.createMutual(request.fromIdentityId, request.toIdentityId);

  // Check achievement triggers for both parties (fire-and-forget)
  checkAndAward(request.fromIdentityId, 'friendship_created').catch(() => {});
  checkAndAward(request.toIdentityId, 'friendship_created').catch(() => {});

  // Notify the sender that their request was accepted
  const accepterIdentity = await identityRepo.findByIdentityId(identityObjId);
  const accepterPublic = accepterIdentity ? toPublicIdentity(accepterIdentity) : undefined;

  const senderHex = request.fromIdentityId.toHexString();

  await createNotification(request.fromIdentityId, 'friend_request_accepted', {
    requestId: reqObjId.toHexString(),
    byIdentityId: identityObjId.toHexString(),
    byDisplayName: accepterPublic?.displayName,
    byUsername: accepterPublic?.username,
  });

  if (accepterPublic) {
    await publishFriendEvent(senderHex, {
      type: 'friend_request_accepted',
      data: {
        requestId: reqObjId.toHexString(),
        byIdentity: accepterPublic,
      },
    });
  }

  elog.info('Friend request accepted', { requestId: reqObjId.toHexString() });

  return { success: true, request: toPublicFriendRequest({ ...request, status: 'accepted' }) };
}

/**
 * Ignore a friend request (only the recipient can ignore).
 * Silent -- the sender receives no notification.
 */
export async function ignoreFriendRequest(
  requestId: string | ObjectId,
  identityId: string | ObjectId
): Promise<FriendRequestResult> {
  const requestRepo = getFriendRequestRepository();

  const reqObjId = requestId instanceof ObjectId ? requestId : new ObjectId(requestId);
  const identityObjId = identityId instanceof ObjectId ? identityId : new ObjectId(identityId);

  const request = await requestRepo.findById(reqObjId);
  if (!request || request.status !== 'pending') {
    return { success: false, error: 'Friend request not found', errorCode: 'REQUEST_NOT_FOUND' };
  }

  if (request.toIdentityId.toHexString() !== identityObjId.toHexString()) {
    return { success: false, error: 'Not authorized', errorCode: 'NOT_AUTHORIZED' };
  }

  await requestRepo.updateStatus(reqObjId, 'ignored');

  elog.info('Friend request ignored', { requestId: reqObjId.toHexString() });

  return { success: true };
}

/**
 * Cancel an outgoing friend request (only the sender can cancel).
 */
export async function cancelFriendRequest(
  requestId: string | ObjectId,
  identityId: string | ObjectId
): Promise<FriendRequestResult> {
  const requestRepo = getFriendRequestRepository();

  const reqObjId = requestId instanceof ObjectId ? requestId : new ObjectId(requestId);
  const identityObjId = identityId instanceof ObjectId ? identityId : new ObjectId(identityId);

  const request = await requestRepo.findById(reqObjId);
  if (!request || request.status !== 'pending') {
    return { success: false, error: 'Friend request not found', errorCode: 'REQUEST_NOT_FOUND' };
  }

  if (request.fromIdentityId.toHexString() !== identityObjId.toHexString()) {
    return { success: false, error: 'Not authorized', errorCode: 'NOT_AUTHORIZED' };
  }

  await requestRepo.deleteById(reqObjId);

  elog.info('Friend request cancelled', { requestId: reqObjId.toHexString() });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Friendship operations
// ---------------------------------------------------------------------------

/**
 * Remove a friend (mutual removal).
 */
export async function removeFriend(
  identityId: string | ObjectId,
  friendIdentityId: string | ObjectId
): Promise<FriendshipResult> {
  const friendshipRepo = getFriendshipRepository();

  const identityObjId = identityId instanceof ObjectId ? identityId : new ObjectId(identityId);
  const friendObjId = friendIdentityId instanceof ObjectId ? friendIdentityId : new ObjectId(friendIdentityId);

  const removed = await friendshipRepo.remove(identityObjId, friendObjId);
  if (!removed) {
    return { success: false, error: 'Not friends', errorCode: 'NOT_FRIENDS' };
  }

  const friendHex = friendObjId.toHexString();

  // Notify the other party via real-time event
  await publishFriendEvent(friendHex, {
    type: 'friend_removed',
    data: { identityId: identityObjId.toHexString() },
  });

  elog.info('Friend removed', { identityId: identityObjId.toHexString() });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Query operations
// ---------------------------------------------------------------------------

/**
 * Get paginated friends list with denormalised identity info.
 */
export async function getFriends(
  identityId: string | ObjectId,
  limit = 50,
  cursor?: string
): Promise<{ friends: FriendInfo[]; cursor: string | null }> {
  const friendshipRepo = getFriendshipRepository();
  const identityRepo = getIdentityRepository();

  const identityObjId = identityId instanceof ObjectId ? identityId : new ObjectId(identityId);
  const cursorObjId = cursor ? new ObjectId(cursor) : undefined;

  const friendships = await friendshipRepo.getFriends(identityObjId, limit + 1, cursorObjId);

  const hasMore = friendships.length > limit;
  const resultFriendships = hasMore ? friendships.slice(0, limit) : friendships;

  const friendInfos: FriendInfo[] = [];
  for (const friendship of resultFriendships) {
    const identity = await identityRepo.findByIdentityId(friendship.friendIdentityId);
    if (identity) {
      friendInfos.push({
        identity: toPublicIdentity(identity),
        friendsSince: friendship.createdAt.toISOString(),
      });
    }
  }

  const nextCursor = hasMore && resultFriendships.length > 0
    ? resultFriendships[resultFriendships.length - 1]!._id.toHexString()
    : null;

  return { friends: friendInfos, cursor: nextCursor };
}

/**
 * Search through friends by username/displayName (server-side).
 */
export async function searchFriends(
  identityId: string | ObjectId,
  query: string,
  limit = 20
): Promise<FriendInfo[]> {
  const friendshipRepo = getFriendshipRepository();
  const identityRepo = getIdentityRepository();

  const identityObjId = identityId instanceof ObjectId ? identityId : new ObjectId(identityId);

  // Search identities matching the query
  const matchingIdentities = await identityRepo.search(query, limit * 2);
  if (matchingIdentities.length === 0) return [];

  const matchingIds = matchingIdentities.map((i) => i._id);

  // Filter to only those who are friends
  const friendships = await friendshipRepo.searchFriends(identityObjId, matchingIds);

  const friendIdSet = new Set(friendships.map((f) => f.friendIdentityId.toHexString()));

  const friendInfos: FriendInfo[] = [];
  for (const identity of matchingIdentities) {
    if (friendIdSet.has(identity._id.toHexString())) {
      const friendship = friendships.find(
        (f) => f.friendIdentityId.toHexString() === identity._id.toHexString()
      );
      friendInfos.push({
        identity: toPublicIdentity(identity),
        friendsSince: friendship?.createdAt.toISOString() ?? new Date().toISOString(),
      });
      if (friendInfos.length >= limit) break;
    }
  }

  return friendInfos;
}

/**
 * Get incoming pending friend requests with sender info.
 */
export async function getIncomingRequests(
  identityId: string | ObjectId,
  limit = 50,
  cursor?: string
): Promise<{ requests: IncomingFriendRequestInfo[]; cursor: string | null; count: number }> {
  const requestRepo = getFriendRequestRepository();
  const identityRepo = getIdentityRepository();

  const identityObjId = identityId instanceof ObjectId ? identityId : new ObjectId(identityId);
  const cursorObjId = cursor ? new ObjectId(cursor) : undefined;

  const [requests, count] = await Promise.all([
    requestRepo.findIncoming(identityObjId, limit + 1, cursorObjId),
    requestRepo.countIncoming(identityObjId),
  ]);

  const hasMore = requests.length > limit;
  const resultRequests = hasMore ? requests.slice(0, limit) : requests;

  const requestInfos: IncomingFriendRequestInfo[] = [];
  for (const request of resultRequests) {
    const fromIdentity = await identityRepo.findByIdentityId(request.fromIdentityId);
    if (fromIdentity) {
      requestInfos.push({
        request: toPublicFriendRequest(request),
        fromIdentity: toPublicIdentity(fromIdentity),
      });
    }
  }

  const nextCursor = hasMore && resultRequests.length > 0
    ? resultRequests[resultRequests.length - 1]!._id.toHexString()
    : null;

  return { requests: requestInfos, cursor: nextCursor, count };
}

/**
 * Get outgoing pending friend requests.
 */
export async function getOutgoingRequests(
  identityId: string | ObjectId,
  limit = 50,
  cursor?: string
): Promise<{ requests: PublicFriendRequest[]; cursor: string | null }> {
  const requestRepo = getFriendRequestRepository();

  const identityObjId = identityId instanceof ObjectId ? identityId : new ObjectId(identityId);
  const cursorObjId = cursor ? new ObjectId(cursor) : undefined;

  const requests = await requestRepo.findOutgoing(identityObjId, limit + 1, cursorObjId);

  const hasMore = requests.length > limit;
  const resultRequests = hasMore ? requests.slice(0, limit) : requests;

  const nextCursor = hasMore && resultRequests.length > 0
    ? resultRequests[resultRequests.length - 1]!._id.toHexString()
    : null;

  return {
    requests: resultRequests.map(toPublicFriendRequest),
    cursor: nextCursor,
  };
}

/**
 * Get count of pending incoming friend requests.
 */
export async function getIncomingRequestCount(
  identityId: string | ObjectId
): Promise<number> {
  const requestRepo = getFriendRequestRepository();
  const identityObjId = identityId instanceof ObjectId ? identityId : new ObjectId(identityId);
  return await requestRepo.countIncoming(identityObjId);
}

/**
 * Get friendship status between two identities.
 */
export async function getFriendshipStatus(
  identityId: string | ObjectId,
  otherIdentityId: string | ObjectId
): Promise<FriendshipStatus> {
  const friendshipRepo = getFriendshipRepository();
  const requestRepo = getFriendRequestRepository();

  const identityObjId = identityId instanceof ObjectId ? identityId : new ObjectId(identityId);
  const otherObjId = otherIdentityId instanceof ObjectId ? otherIdentityId : new ObjectId(otherIdentityId);

  // Check friendship first (most common query)
  const areFriends = await friendshipRepo.areFriends(identityObjId, otherObjId);
  if (areFriends) return 'friends';

  // Check pending requests
  const pendingRequest = await requestRepo.findPendingBetween(identityObjId, otherObjId);
  if (pendingRequest) {
    if (pendingRequest.fromIdentityId.toHexString() === identityObjId.toHexString()) {
      return 'pending_outgoing';
    }
    return 'pending_incoming';
  }

  return 'none';
}

// ---------------------------------------------------------------------------
// Cleanup (used by block service)
// ---------------------------------------------------------------------------

/**
 * Remove friendship and pending requests between two identities.
 * Called when one identity blocks the other.
 */
export async function cleanupFriendData(
  identityA: string | ObjectId,
  identityB: string | ObjectId
): Promise<void> {
  const friendshipRepo = getFriendshipRepository();
  const requestRepo = getFriendRequestRepository();

  const objIdA = identityA instanceof ObjectId ? identityA : new ObjectId(identityA);
  const objIdB = identityB instanceof ObjectId ? identityB : new ObjectId(identityB);

  await Promise.all([
    friendshipRepo.remove(objIdA, objIdB),
    requestRepo.deleteByPair(objIdA, objIdB),
  ]);
}
