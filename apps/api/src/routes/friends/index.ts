/**
 * Friends routes module.
 *
 * Provides endpoints for friend requests and friendships management.
 * All endpoints require an authenticated identity session.
 *
 * PRIVACY NOTES:
 * - Ignored requests appear as "pending" to sender
 * - No notification sent when friend is removed
 * - Block status is never revealed
 *
 * @module routes/friends
 */

import { Router } from '../../router';
import { success, errors } from '../../utils/response';
import { sanitizeString } from '../../utils/sanitize';
import {
  getIdentityFromSession,
  getIdentitySessionIdFromRequest,
} from '../../services/identity.service';
import {
  sendFriendRequest,
  acceptFriendRequest,
  ignoreFriendRequest,
  cancelFriendRequest,
  getIncomingFriendRequests,
  getSentFriendRequests,
} from '../../services/friend-request.service';
import {
  getFriends,
  checkFriendshipStatus,
  removeFriend,
} from '../../services/friendship.service';
import { z } from '@adieuu/shared/schemas';
import { ObjectId } from 'mongodb';

const router = new Router();

/**
 * Validates that a string is a valid MongoDB ObjectId
 */
function isValidObjectId(id: string): boolean {
  if (!id || id.length !== 24) return false;
  try {
    new ObjectId(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Zod schema for send friend request
 */
const SendFriendRequestSchema = z.object({
  toIdentityId: z.string().length(24),
});

/**
 * POST /friends/request - Send a friend request
 *
 * Sends a friend request to another identity. If the recipient has
 * already sent a request to the sender, both become friends immediately
 * (mutual add).
 *
 * @route POST /api/friends/request
 *
 * @requestBody
 * - `toIdentityId` (string, required): The identity ID to send request to
 *
 * @returns 201 Created with request info
 * @returns 400 Bad Request if validation fails or cannot add self
 * @returns 401 Unauthorized if not authenticated
 * @returns 429 Too Many Requests if burst protected
 */
router.post('/friends/request', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  // Validate request body
  const parseResult = SendFriendRequestSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { toIdentityId } = parseResult.data;

  // Sanitize and validate identity ID
  const sanitized = sanitizeString(toIdentityId, 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await sendFriendRequest(identity._id, sanitized.value);

  if (!result.success) {
    switch (result.errorCode) {
      case 'CANNOT_ADD_SELF':
        return errors.badRequest('Cannot send friend request to yourself.');
      case 'ALREADY_FRIENDS':
        return errors.badRequest('Already friends with this identity.');
      case 'REQUEST_ALREADY_PENDING':
        return errors.badRequest('Friend request already pending.');
      case 'IDENTITY_NOT_FOUND':
        return errors.notFound('Identity not found.');
      case 'BURST_PROTECTED':
        return errors.rateLimited('Too many friend requests. Please try again later.');
      default:
        return errors.badRequest(result.error ?? 'Failed to send friend request.');
    }
  }

  return success(
    {
      requestId: result.requestId,
      status: result.status,
      message: result.message,
    },
    result.message,
    201
  );
});

/**
 * GET /friends/requests/incoming - Get incoming friend requests
 *
 * Returns pending friend requests addressed to the current identity.
 *
 * @route GET /api/friends/requests/incoming
 *
 * @queryParam limit (number, optional): Max results (default: 20, max: 50)
 * @queryParam cursor (string, optional): Pagination cursor
 *
 * @returns 200 OK with array of requests and pagination cursor
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/friends/requests/incoming', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  // Parse pagination params
  const limitParam = ctx.query.get('limit');
  const cursor = ctx.query.get('cursor');

  let limit = limitParam ? parseInt(limitParam, 10) : 20;
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 50) limit = 50;

  // Validate cursor if provided
  let validCursor: string | undefined;
  if (cursor) {
    const sanitizedCursor = sanitizeString(cursor, 'general');
    if (sanitizedCursor.value && isValidObjectId(sanitizedCursor.value)) {
      validCursor = sanitizedCursor.value;
    }
  }

  const result = await getIncomingFriendRequests(identity._id, limit, validCursor);

  return success({
    requests: result.requests.map((r) => ({
      id: r.request.id,
      fromIdentity: r.identity,
      createdAt: r.request.createdAt,
    })),
    cursor: result.cursor,
  });
});

/**
 * GET /friends/requests/sent - Get sent friend requests
 *
 * Returns friend requests sent by the current identity.
 * Note: Ignored requests still appear as "pending" (privacy protection).
 *
 * @route GET /api/friends/requests/sent
 *
 * @queryParam limit (number, optional): Max results (default: 20, max: 50)
 * @queryParam cursor (string, optional): Pagination cursor
 *
 * @returns 200 OK with array of requests and pagination cursor
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/friends/requests/sent', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  // Parse pagination params
  const limitParam = ctx.query.get('limit');
  const cursor = ctx.query.get('cursor');

  let limit = limitParam ? parseInt(limitParam, 10) : 20;
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 50) limit = 50;

  // Validate cursor if provided
  let validCursor: string | undefined;
  if (cursor) {
    const sanitizedCursor = sanitizeString(cursor, 'general');
    if (sanitizedCursor.value && isValidObjectId(sanitizedCursor.value)) {
      validCursor = sanitizedCursor.value;
    }
  }

  const result = await getSentFriendRequests(identity._id, limit, validCursor);

  return success({
    requests: result.requests.map((r) => ({
      id: r.request.id,
      toIdentity: r.identity,
      status: 'pending',
      createdAt: r.request.createdAt,
    })),
    cursor: result.cursor,
  });
});

/**
 * POST /friends/request/:requestId/accept - Accept a friend request
 *
 * Accepts an incoming friend request, creating a friendship.
 *
 * @route POST /api/friends/request/:requestId/accept
 *
 * @param requestId (string, required): The request ID to accept
 *
 * @returns 200 OK with friend info
 * @returns 400 Bad Request if already responded
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if request doesn't exist or not addressed to you
 */
router.post('/friends/request/:requestId/accept', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { requestId } = ctx.params;

  // Sanitize and validate request ID
  const sanitized = sanitizeString(requestId ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid request ID.');
  }

  const result = await acceptFriendRequest(sanitized.value, identity._id);

  if (!result.success) {
    switch (result.errorCode) {
      case 'REQUEST_NOT_FOUND':
        return errors.notFound('Request not found or not addressed to you.');
      case 'ALREADY_RESPONDED':
        return errors.badRequest('Request already responded to.');
      default:
        return errors.badRequest(result.error ?? 'Failed to accept request.');
    }
  }

  return success(
    { friend: result.friend },
    'You are now friends.'
  );
});

/**
 * POST /friends/request/:requestId/ignore - Ignore a friend request
 *
 * Ignores an incoming friend request. The sender will still see
 * the request as "pending" (privacy protection).
 *
 * @route POST /api/friends/request/:requestId/ignore
 *
 * @param requestId (string, required): The request ID to ignore
 *
 * @returns 200 OK
 * @returns 400 Bad Request if already responded
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if request doesn't exist or not addressed to you
 */
router.post('/friends/request/:requestId/ignore', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { requestId } = ctx.params;

  // Sanitize and validate request ID
  const sanitized = sanitizeString(requestId ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid request ID.');
  }

  const result = await ignoreFriendRequest(sanitized.value, identity._id);

  if (!result.success) {
    switch (result.errorCode) {
      case 'REQUEST_NOT_FOUND':
        return errors.notFound('Request not found or not addressed to you.');
      case 'ALREADY_RESPONDED':
        return errors.badRequest('Request already responded to.');
      default:
        return errors.badRequest(result.error ?? 'Failed to ignore request.');
    }
  }

  return success(undefined);
});

/**
 * DELETE /friends/request/:requestId - Cancel a sent friend request
 *
 * Cancels a friend request that you sent. Cannot cancel if already accepted.
 *
 * @route DELETE /api/friends/request/:requestId
 *
 * @param requestId (string, required): The request ID to cancel
 *
 * @returns 200 OK
 * @returns 400 Bad Request if already responded
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if request doesn't exist or not sent by you
 */
router.delete('/friends/request/:requestId', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { requestId } = ctx.params;

  // Sanitize and validate request ID
  const sanitized = sanitizeString(requestId ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid request ID.');
  }

  const result = await cancelFriendRequest(sanitized.value, identity._id);

  if (!result.success) {
    switch (result.errorCode) {
      case 'REQUEST_NOT_FOUND':
        return errors.notFound('Request not found or not sent by you.');
      case 'ALREADY_RESPONDED':
        return errors.badRequest('Request already responded to.');
      default:
        return errors.badRequest(result.error ?? 'Failed to cancel request.');
    }
  }

  return success(undefined);
});

/**
 * GET /friends - Get friends list
 *
 * Returns the list of friends for the current identity.
 * Supports pagination and optional search filtering.
 *
 * @route GET /api/friends
 *
 * @queryParam limit (number, optional): Max results (default: 50, max: 100)
 * @queryParam cursor (string, optional): Pagination cursor
 * @queryParam search (string, optional): Filter by username/displayName
 *
 * @returns 200 OK with array of friends and pagination info
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/friends', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  // Parse query params
  const limitParam = ctx.query.get('limit');
  const cursor = ctx.query.get('cursor');
  const search = ctx.query.get('search');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  // Validate cursor if provided
  let validCursor: string | undefined;
  if (cursor) {
    const sanitizedCursor = sanitizeString(cursor, 'general');
    if (sanitizedCursor.value && isValidObjectId(sanitizedCursor.value)) {
      validCursor = sanitizedCursor.value;
    }
  }

  // Sanitize search if provided
  let validSearch: string | undefined;
  if (search) {
    const sanitizedSearch = sanitizeString(search, 'general');
    if (sanitizedSearch.value && sanitizedSearch.value.length >= 1) {
      validSearch = sanitizedSearch.value;
    }
  }

  const result = await getFriends(identity._id, limit, validCursor, validSearch);

  return success({
    friends: result.friends,
    cursor: result.cursor,
    total: result.total,
  });
});

/**
 * GET /friends/status/:identityId - Check friendship status
 *
 * Returns the relationship status between the current identity and
 * another identity (friends, request_sent, request_received, or none).
 *
 * @route GET /api/friends/status/:identityId
 *
 * @param identityId (string, required): The identity ID to check
 *
 * @returns 200 OK with status info
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/friends/status/:identityId', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { identityId } = ctx.params;

  // Sanitize and validate identity ID
  const sanitized = sanitizeString(identityId ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await checkFriendshipStatus(identity._id, sanitized.value);

  return success({
    status: result.status,
    friendsSince: result.friendsSince,
    requestId: result.requestId,
  });
});

/**
 * DELETE /friends/:identityId - Remove a friend
 *
 * Removes a friend. The friendship is removed for both parties.
 * No notification is sent to the other party (privacy protection).
 *
 * @route DELETE /api/friends/:identityId
 *
 * @param identityId (string, required): The friend's identity ID to remove
 *
 * @returns 200 OK
 * @returns 400 Bad Request if not friends
 * @returns 401 Unauthorized if not authenticated
 */
router.delete('/friends/:identityId', async (ctx) => {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { identityId } = ctx.params;

  // Sanitize and validate identity ID
  const sanitized = sanitizeString(identityId ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await removeFriend(identity._id, sanitized.value);

  if (!result.success) {
    return errors.badRequest(result.error ?? 'Failed to remove friend.');
  }

  return success(undefined);
});

export const friendRoutes = router;
