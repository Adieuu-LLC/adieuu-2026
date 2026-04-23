/**
 * Friends routes module.
 *
 * Provides endpoints for managing friends and friend requests.
 * All endpoints require an authenticated identity session.
 *
 * PRIVACY NOTES:
 * - Friend operations are identity-scoped (never linked to User)
 * - Ignored requests are silent -- sender receives no indication
 * - Block checks prevent requests between blocked identities
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
  removeFriend,
  getFriends,
  searchFriends,
  getIncomingRequests,
  getOutgoingRequests,
  getIncomingRequestCount,
  getFriendshipStatus,
} from '../../services/friend.service';
import { z } from '@adieuu/shared/schemas';
import { isValidObjectId } from '../../utils';

const router = new Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireIdentity(request: Request) {
  const sessionId = getIdentitySessionIdFromRequest(request);
  if (!sessionId) return null;
  return await getIdentityFromSession(sessionId);
}

// ---------------------------------------------------------------------------
// Friend request schemas
// ---------------------------------------------------------------------------

const SendRequestSchema = z.object({
  identityId: z.string().length(24),
});

// ---------------------------------------------------------------------------
// Friend request routes
// ---------------------------------------------------------------------------

/**
 * POST /friends/requests - Send a friend request
 *
 * @route POST /api/friends/requests
 * @requestBody { identityId: string }
 */
router.post('/friends/requests', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const parseResult = SendRequestSchema.safeParse(ctx.body);
  if (!parseResult.success) return ctx.errors.validationFailed();

  const { identityId } = parseResult.data;
  const sanitized = sanitizeString(identityId, 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await sendFriendRequest(identity._id, sanitized.value);

  if (!result.success) {
    switch (result.errorCode) {
      case 'CANNOT_FRIEND_SELF':
        return errors.badRequest('Cannot send friend request to yourself.');
      case 'ALREADY_FRIENDS':
        return errors.badRequest('Already friends with this identity.');
      case 'REQUEST_EXISTS':
        return errors.badRequest('A pending friend request already exists.');
      case 'IDENTITY_NOT_FOUND':
        return errors.notFound('Identity not found.');
      default:
        return errors.badRequest(result.error ?? 'Failed to send friend request.');
    }
  }

  return success(result.request, 'Friend request sent.');
});

/**
 * POST /friends/requests/:id/accept - Accept a friend request
 *
 * @route POST /api/friends/requests/:id/accept
 */
router.post('/friends/requests/:id/accept', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid request ID.');
  }

  const result = await acceptFriendRequest(sanitized.value, identity._id);

  if (!result.success) {
    switch (result.errorCode) {
      case 'REQUEST_NOT_FOUND':
        return errors.notFound('Friend request not found.');
      case 'NOT_AUTHORIZED':
        return ctx.errors.unauthorized();
      default:
        return errors.badRequest(result.error ?? 'Failed to accept friend request.');
    }
  }

  return success(result.request, 'Friend request accepted.');
});

/**
 * POST /friends/requests/:id/ignore - Ignore a friend request
 *
 * @route POST /api/friends/requests/:id/ignore
 */
router.post('/friends/requests/:id/ignore', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid request ID.');
  }

  const result = await ignoreFriendRequest(sanitized.value, identity._id);

  if (!result.success) {
    switch (result.errorCode) {
      case 'REQUEST_NOT_FOUND':
        return errors.notFound('Friend request not found.');
      case 'NOT_AUTHORIZED':
        return ctx.errors.unauthorized();
      default:
        return errors.badRequest(result.error ?? 'Failed to ignore friend request.');
    }
  }

  return success(undefined, 'Friend request ignored.');
});

/**
 * DELETE /friends/requests/:id - Cancel an outgoing friend request
 *
 * @route DELETE /api/friends/requests/:id
 */
router.delete('/friends/requests/:id', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { id } = ctx.params;
  const sanitized = sanitizeString(id ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid request ID.');
  }

  const result = await cancelFriendRequest(sanitized.value, identity._id);

  if (!result.success) {
    switch (result.errorCode) {
      case 'REQUEST_NOT_FOUND':
        return errors.notFound('Friend request not found.');
      case 'NOT_AUTHORIZED':
        return ctx.errors.unauthorized();
      default:
        return errors.badRequest(result.error ?? 'Failed to cancel friend request.');
    }
  }

  return success(undefined, 'Friend request cancelled.');
});

/**
 * GET /friends/requests/incoming - List incoming friend requests
 *
 * @route GET /api/friends/requests/incoming
 * @queryParam limit (number, optional): Max results (default 50, max 100)
 * @queryParam cursor (string, optional): Pagination cursor
 */
router.get('/friends/requests/incoming', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const limitParam = ctx.query.get('limit');
  const cursor = ctx.query.get('cursor');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  let validCursor: string | undefined;
  if (cursor) {
    const sanitizedCursor = sanitizeString(cursor, 'general');
    if (sanitizedCursor.value && isValidObjectId(sanitizedCursor.value)) {
      validCursor = sanitizedCursor.value;
    }
  }

  const result = await getIncomingRequests(identity._id, limit, validCursor);

  return success({
    requests: result.requests,
    count: result.count,
    cursor: result.cursor,
  });
});

/**
 * GET /friends/requests/outgoing - List outgoing friend requests
 *
 * @route GET /api/friends/requests/outgoing
 * @queryParam limit (number, optional): Max results (default 50, max 100)
 * @queryParam cursor (string, optional): Pagination cursor
 */
router.get('/friends/requests/outgoing', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const limitParam = ctx.query.get('limit');
  const cursor = ctx.query.get('cursor');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  let validCursor: string | undefined;
  if (cursor) {
    const sanitizedCursor = sanitizeString(cursor, 'general');
    if (sanitizedCursor.value && isValidObjectId(sanitizedCursor.value)) {
      validCursor = sanitizedCursor.value;
    }
  }

  const result = await getOutgoingRequests(identity._id, limit, validCursor);

  return success({
    requests: result.requests,
    cursor: result.cursor,
  });
});

/**
 * GET /friends/requests/count - Get pending incoming request count
 *
 * @route GET /api/friends/requests/count
 */
router.get('/friends/requests/count', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const count = await getIncomingRequestCount(identity._id);

  return success({ count });
});

// ---------------------------------------------------------------------------
// Friends list routes
// ---------------------------------------------------------------------------

/**
 * GET /friends - List friends (paginated)
 *
 * @route GET /api/friends
 * @queryParam limit (number, optional): Max results (default 50, max 100)
 * @queryParam cursor (string, optional): Pagination cursor
 */
router.get('/friends', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const limitParam = ctx.query.get('limit');
  const cursor = ctx.query.get('cursor');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  let validCursor: string | undefined;
  if (cursor) {
    const sanitizedCursor = sanitizeString(cursor, 'general');
    if (sanitizedCursor.value && isValidObjectId(sanitizedCursor.value)) {
      validCursor = sanitizedCursor.value;
    }
  }

  const result = await getFriends(identity._id, limit, validCursor);

  return success({
    friends: result.friends,
    cursor: result.cursor,
  });
});

/**
 * GET /friends/search - Search friends by username/displayName
 *
 * @route GET /api/friends/search
 * @queryParam q (string, required): Search query (min 2 chars)
 * @queryParam limit (number, optional): Max results (default 20, max 50)
 */
router.get('/friends/search', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const query = ctx.query.get('q');
  if (!query || query.trim().length < 2) {
    return errors.badRequest('Search query must be at least 2 characters.');
  }

  const sanitized = sanitizeString(query.trim(), 'general');
  if (!sanitized.value) {
    return errors.badRequest('Invalid search query.');
  }

  const limitParam = ctx.query.get('limit');
  let limit = limitParam ? parseInt(limitParam, 10) : 20;
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 50) limit = 50;

  const friends = await searchFriends(identity._id, sanitized.value, limit);

  return success({ friends });
});

/**
 * DELETE /friends/:identityId - Remove a friend
 *
 * @route DELETE /api/friends/:identityId
 */
router.delete('/friends/:identityId', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { identityId } = ctx.params;
  const sanitized = sanitizeString(identityId ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await removeFriend(identity._id, sanitized.value);

  if (!result.success) {
    if (result.errorCode === 'NOT_FRIENDS') {
      return errors.notFound('Not friends with this identity.');
    }
    return errors.badRequest(result.error ?? 'Failed to remove friend.');
  }

  return success(undefined, 'Friend removed.');
});

/**
 * GET /friends/status/:identityId - Get friendship status
 *
 * @route GET /api/friends/status/:identityId
 */
router.get('/friends/status/:identityId', async (ctx) => {
  const identity = await requireIdentity(ctx.request);
  if (!identity) return ctx.errors.unauthorized();

  const { identityId } = ctx.params;
  const sanitized = sanitizeString(identityId ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await getFriendshipStatus(identity._id, sanitized.value);

  return success({
    status: result.status,
    ...(result.friendsSince != null ? { friendsSince: result.friendsSince } : {}),
  });
});

export const friendRoutes = router;
