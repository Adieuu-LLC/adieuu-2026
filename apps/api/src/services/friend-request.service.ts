/**
 * @fileoverview Friend Request Service
 *
 * Provides friend request functionality with privacy protections.
 * Includes mutual-add detection, block checking, and burst protection.
 *
 * PRIVACY NOTES:
 * - Ignored requests appear as "pending" to sender indefinitely
 * - Timing side-channels are mitigated via artificial delays
 * - Block status is never revealed to blocked party
 *
 * @module services/friend-request
 */

import { ObjectId } from 'mongodb';
import { getFriendRequestRepository } from '../repositories/friend-request.repository';
import { getFriendshipRepository } from '../repositories/friendship.repository';
import { getBlockRepository } from '../repositories/block.repository';
import { getIdentityRepository } from '../repositories/identity.repository';
import type {
  FriendRequestDocument,
  PublicSentFriendRequest,
  PublicReceivedFriendRequest,
} from '../models/friend-request';
import { toPublicSentFriendRequest, toPublicReceivedFriendRequest } from '../models/friend-request';
import { toPublicIdentity, type PublicIdentity } from '../models/identity';
import { getRedis, isRedisConnected } from '../db';
import {
  createFriendRequestNotification,
  createFriendshipEstablishedNotification,
} from './notification.service';
import elog from '../utils/adieuuLogger';
import { constantTimeCompare } from '../utils/crypto';

/**
 * Minimum operation time in ms to prevent timing attacks
 */
const MIN_OPERATION_TIME_MS = 50;

/**
 * Burst protection configuration
 * Temporarily disables adding friends if too many requests are sent quickly
 */
const BURST_PROTECTION = {
  maxRequests: 5,
  windowSeconds: 15,
  lockoutSeconds: 60,
} as const;

/**
 * Send friend request result
 */
export interface SendFriendRequestResult {
  success: boolean;
  requestId?: string;
  status?: 'pending' | 'accepted';
  message?: string;
  error?: string;
  errorCode?:
    | 'CANNOT_ADD_SELF'
    | 'ALREADY_FRIENDS'
    | 'REQUEST_ALREADY_PENDING'
    | 'IDENTITY_NOT_FOUND'
    | 'BURST_PROTECTED';
}

/**
 * Friend request response result
 */
export interface FriendRequestResponseResult {
  success: boolean;
  friend?: PublicIdentity;
  error?: string;
  errorCode?: 'REQUEST_NOT_FOUND' | 'ALREADY_RESPONDED';
}

/**
 * Friend request with identity info
 */
export interface FriendRequestWithIdentity {
  request: PublicReceivedFriendRequest | PublicSentFriendRequest;
  identity: PublicIdentity;
}

/**
 * Ensures an async operation takes at least minMs milliseconds
 */
async function withMinimumTime<T>(
  operation: () => Promise<T>,
  minMs: number = MIN_OPERATION_TIME_MS
): Promise<T> {
  const startTime = performance.now();
  const result = await operation();
  const elapsed = performance.now() - startTime;

  if (elapsed < minMs) {
    await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
  }

  return result;
}

/**
 * Check if identity is currently burst-protected
 * Uses Redis for tracking request frequency
 */
async function checkBurstProtection(identityId: ObjectId): Promise<boolean> {
  if (!isRedisConnected()) {
    return false;
  }

  const redis = getRedis();
  const lockoutKey = `friend_request:lockout:${identityId.toHexString()}`;

  const lockout = await redis.get(lockoutKey);
  return lockout !== null;
}

/**
 * Record a friend request for burst protection tracking
 * Returns true if the identity should be locked out
 */
async function recordRequestForBurstProtection(identityId: ObjectId): Promise<boolean> {
  if (!isRedisConnected()) {
    return false;
  }

  const redis = getRedis();
  const identityHex = identityId.toHexString();
  const countKey = `friend_request:count:${identityHex}`;
  const lockoutKey = `friend_request:lockout:${identityHex}`;

  const now = Date.now();
  const windowStart = now - (BURST_PROTECTION.windowSeconds * 1000);

  // Use pipeline for atomic operations
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(countKey, '-inf', windowStart);
  pipeline.zadd(countKey, now, `${now}-${Math.random()}`);
  pipeline.zcard(countKey);
  pipeline.expire(countKey, BURST_PROTECTION.windowSeconds);

  const results = await pipeline.exec();
  const count = results?.[2]?.[1] as number ?? 0;

  if (count > BURST_PROTECTION.maxRequests) {
    // Trigger lockout
    await redis.set(lockoutKey, '1', 'EX', BURST_PROTECTION.lockoutSeconds);
    elog.warn('Friend request burst protection triggered', { identityId: identityHex });
    return true;
  }

  return false;
}

/**
 * Send a friend request
 *
 * Handles:
 * - Self-request prevention
 * - Block checking (silently ignores if blocked)
 * - Already friends check
 * - Duplicate request prevention
 * - Mutual-add detection (auto-accepts if both sent requests)
 * - Burst protection
 */
export async function sendFriendRequest(
  fromIdentityId: string | ObjectId,
  toIdentityId: string | ObjectId
): Promise<SendFriendRequestResult> {
  return withMinimumTime(async () => {
    const friendRequestRepo = getFriendRequestRepository();
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

    // Use constant-time comparison for self-request check
    if (constantTimeCompare(fromHex, toHex)) {
      return {
        success: false,
        error: 'Cannot send friend request to yourself',
        errorCode: 'CANNOT_ADD_SELF',
      };
    }

    // Check burst protection
    const isBurstProtected = await checkBurstProtection(fromObjId);
    if (isBurstProtected) {
      return {
        success: false,
        error: 'Too many friend requests. Please try again later.',
        errorCode: 'BURST_PROTECTED',
      };
    }

    // Verify target identity exists
    const targetIdentity = await identityRepo.findByIdentityId(toObjId);
    if (!targetIdentity) {
      return {
        success: false,
        error: 'Identity not found',
        errorCode: 'IDENTITY_NOT_FOUND',
      };
    }

    // Check if either party has blocked the other
    const isBlocked = await blockRepo.isBlockedByEither(fromObjId, toObjId);
    if (isBlocked) {
      // IMPORTANT: Return success to not reveal block status
      // The request is silently ignored
      elog.debug('Friend request silently ignored due to block');

      // Still record for burst protection
      await recordRequestForBurstProtection(fromObjId);

      // Return fake success - appears as pending to sender
      return {
        success: true,
        requestId: new ObjectId().toHexString(),
        status: 'pending',
        message: 'Friend request sent',
      };
    }

    // Check if already friends
    const alreadyFriends = await friendshipRepo.areFriends(fromObjId, toObjId);
    if (alreadyFriends) {
      return {
        success: false,
        error: 'Already friends with this identity',
        errorCode: 'ALREADY_FRIENDS',
      };
    }

    // Check for existing pending request FROM us TO them
    const existingRequest = await friendRequestRepo.findByParties(fromObjId, toObjId);
    if (existingRequest && (existingRequest.status === 'pending' || existingRequest.status === 'ignored')) {
      return {
        success: false,
        error: 'Friend request already pending',
        errorCode: 'REQUEST_ALREADY_PENDING',
      };
    }

    // Record for burst protection before creating request
    const shouldLockout = await recordRequestForBurstProtection(fromObjId);
    if (shouldLockout) {
      return {
        success: false,
        error: 'Too many friend requests. Please try again later.',
        errorCode: 'BURST_PROTECTED',
      };
    }

    // Check for existing pending request FROM them TO us (mutual add scenario)
    const reverseRequest = await friendRequestRepo.findByParties(toObjId, fromObjId);
    if (reverseRequest && reverseRequest.status === 'pending') {
      // Mutual add! Accept both and create friendship
      await friendRequestRepo.updateStatus(reverseRequest._id, 'accepted');

      // Create friendship
      await friendshipRepo.createFriendship(
        fromObjId,
        toObjId,
        'mutual_add',
        reverseRequest._id
      );

      elog.info('Mutual friend add - friendship established', {
        identityA: fromHex,
      });

      // Create notifications for both parties
      await Promise.all([
        createFriendshipEstablishedNotification(fromObjId, toObjId),
        createFriendshipEstablishedNotification(toObjId, fromObjId),
      ]);

      return {
        success: true,
        requestId: reverseRequest._id.toHexString(),
        status: 'accepted',
        message: 'You are now friends',
      };
    }

    // Create new pending request
    const newRequest = await friendRequestRepo.create({
      fromIdentityId: fromObjId,
      toIdentityId: toObjId,
      status: 'pending',
    });

    elog.info('Friend request created', {
      requestId: newRequest._id.toHexString(),
    });

    // Create notification for recipient
    await createFriendRequestNotification(
      toObjId,
      newRequest._id.toHexString(),
      fromObjId
    );

    return {
      success: true,
      requestId: newRequest._id.toHexString(),
      status: 'pending',
      message: 'Friend request sent',
    };
  });
}

/**
 * Accept a friend request
 */
export async function acceptFriendRequest(
  requestId: string | ObjectId,
  recipientIdentityId: string | ObjectId
): Promise<FriendRequestResponseResult> {
  return withMinimumTime(async () => {
    const friendRequestRepo = getFriendRequestRepository();
    const friendshipRepo = getFriendshipRepository();
    const identityRepo = getIdentityRepository();

    const requestObjId = requestId instanceof ObjectId
      ? requestId
      : new ObjectId(requestId);
    const recipientObjId = recipientIdentityId instanceof ObjectId
      ? recipientIdentityId
      : new ObjectId(recipientIdentityId);

    // Find the request
    const request = await friendRequestRepo.findById(requestObjId);
    if (!request) {
      return {
        success: false,
        error: 'Request not found or not addressed to you',
        errorCode: 'REQUEST_NOT_FOUND',
      };
    }

    // Verify the request is addressed to this identity
    if (!request.toIdentityId.equals(recipientObjId)) {
      return {
        success: false,
        error: 'Request not found or not addressed to you',
        errorCode: 'REQUEST_NOT_FOUND',
      };
    }

    // Check if already responded
    if (request.status !== 'pending') {
      return {
        success: false,
        error: 'Request already responded to',
        errorCode: 'ALREADY_RESPONDED',
      };
    }

    // Update request status
    await friendRequestRepo.updateStatus(requestObjId, 'accepted');

    // Create friendship
    await friendshipRepo.createFriendship(
      request.fromIdentityId,
      request.toIdentityId,
      'request_accepted',
      requestObjId
    );

    // Get the sender's identity for response
    const senderIdentity = await identityRepo.findByIdentityId(request.fromIdentityId);

    elog.info('Friend request accepted', {
      requestId: requestObjId.toHexString(),
    });

    // Create notifications for both parties
    await Promise.all([
      createFriendshipEstablishedNotification(request.fromIdentityId, request.toIdentityId),
      createFriendshipEstablishedNotification(request.toIdentityId, request.fromIdentityId),
    ]);

    return {
      success: true,
      friend: senderIdentity ? toPublicIdentity(senderIdentity) : undefined,
    };
  });
}

/**
 * Ignore a friend request
 * The sender will still see the request as "pending"
 */
export async function ignoreFriendRequest(
  requestId: string | ObjectId,
  recipientIdentityId: string | ObjectId
): Promise<FriendRequestResponseResult> {
  return withMinimumTime(async () => {
    const friendRequestRepo = getFriendRequestRepository();

    const requestObjId = requestId instanceof ObjectId
      ? requestId
      : new ObjectId(requestId);
    const recipientObjId = recipientIdentityId instanceof ObjectId
      ? recipientIdentityId
      : new ObjectId(recipientIdentityId);

    // Find the request
    const request = await friendRequestRepo.findById(requestObjId);
    if (!request) {
      return {
        success: false,
        error: 'Request not found or not addressed to you',
        errorCode: 'REQUEST_NOT_FOUND',
      };
    }

    // Verify the request is addressed to this identity
    if (!request.toIdentityId.equals(recipientObjId)) {
      return {
        success: false,
        error: 'Request not found or not addressed to you',
        errorCode: 'REQUEST_NOT_FOUND',
      };
    }

    // Check if already responded (but not if pending or already ignored)
    if (request.status === 'accepted' || request.status === 'cancelled') {
      return {
        success: false,
        error: 'Request already responded to',
        errorCode: 'ALREADY_RESPONDED',
      };
    }

    // Update request status to ignored (sender will still see "pending")
    await friendRequestRepo.updateStatus(requestObjId, 'ignored');

    elog.info('Friend request ignored', {
      requestId: requestObjId.toHexString(),
    });

    return { success: true };
  });
}

/**
 * Cancel a sent friend request
 */
export async function cancelFriendRequest(
  requestId: string | ObjectId,
  senderIdentityId: string | ObjectId
): Promise<FriendRequestResponseResult> {
  return withMinimumTime(async () => {
    const friendRequestRepo = getFriendRequestRepository();

    const requestObjId = requestId instanceof ObjectId
      ? requestId
      : new ObjectId(requestId);
    const senderObjId = senderIdentityId instanceof ObjectId
      ? senderIdentityId
      : new ObjectId(senderIdentityId);

    // Find the request
    const request = await friendRequestRepo.findById(requestObjId);
    if (!request) {
      return {
        success: false,
        error: 'Request not found or not sent by you',
        errorCode: 'REQUEST_NOT_FOUND',
      };
    }

    // Verify the request was sent by this identity
    if (!request.fromIdentityId.equals(senderObjId)) {
      return {
        success: false,
        error: 'Request not found or not sent by you',
        errorCode: 'REQUEST_NOT_FOUND',
      };
    }

    // Check if already responded (accepted requests can't be cancelled)
    if (request.status === 'accepted') {
      return {
        success: false,
        error: 'Request already responded to',
        errorCode: 'ALREADY_RESPONDED',
      };
    }

    // Update request status to cancelled
    await friendRequestRepo.updateStatus(requestObjId, 'cancelled');

    elog.info('Friend request cancelled', {
      requestId: requestObjId.toHexString(),
    });

    return { success: true };
  });
}

/**
 * Get incoming friend requests with sender identity info
 */
export async function getIncomingFriendRequests(
  identityId: string | ObjectId,
  limit = 20,
  cursor?: string
): Promise<{ requests: FriendRequestWithIdentity[]; cursor: string | null }> {
  const friendRequestRepo = getFriendRequestRepository();
  const identityRepo = getIdentityRepository();

  const identityObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);

  const cursorObjId = cursor ? new ObjectId(cursor) : undefined;

  const requests = await friendRequestRepo.getIncomingRequests(
    identityObjId,
    'pending',
    limit + 1,
    cursorObjId
  );

  const hasMore = requests.length > limit;
  const resultRequests = hasMore ? requests.slice(0, limit) : requests;

  // Fetch sender identity info for each request
  const requestsWithIdentity: FriendRequestWithIdentity[] = [];

  for (const request of resultRequests) {
    const senderIdentity = await identityRepo.findByIdentityId(request.fromIdentityId);
    if (senderIdentity) {
      requestsWithIdentity.push({
        request: toPublicReceivedFriendRequest(request),
        identity: toPublicIdentity(senderIdentity),
      });
    }
  }

  const nextCursor = hasMore && resultRequests.length > 0
    ? resultRequests[resultRequests.length - 1]!._id.toHexString()
    : null;

  return {
    requests: requestsWithIdentity,
    cursor: nextCursor,
  };
}

/**
 * Get sent friend requests with recipient identity info
 */
export async function getSentFriendRequests(
  identityId: string | ObjectId,
  limit = 20,
  cursor?: string
): Promise<{ requests: FriendRequestWithIdentity[]; cursor: string | null }> {
  const friendRequestRepo = getFriendRequestRepository();
  const identityRepo = getIdentityRepository();

  const identityObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);

  const cursorObjId = cursor ? new ObjectId(cursor) : undefined;

  const requests = await friendRequestRepo.getSentRequests(
    identityObjId,
    limit + 1,
    cursorObjId
  );

  const hasMore = requests.length > limit;
  const resultRequests = hasMore ? requests.slice(0, limit) : requests;

  // Fetch recipient identity info for each request
  const requestsWithIdentity: FriendRequestWithIdentity[] = [];

  for (const request of resultRequests) {
    const recipientIdentity = await identityRepo.findByIdentityId(request.toIdentityId);
    if (recipientIdentity) {
      requestsWithIdentity.push({
        request: toPublicSentFriendRequest(request),
        identity: toPublicIdentity(recipientIdentity),
      });
    }
  }

  const nextCursor = hasMore && resultRequests.length > 0
    ? resultRequests[resultRequests.length - 1]!._id.toHexString()
    : null;

  return {
    requests: requestsWithIdentity,
    cursor: nextCursor,
  };
}
