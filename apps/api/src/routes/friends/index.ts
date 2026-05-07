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
import {
  sendFriendRequestResult,
  acceptFriendRequestResult,
  ignoreFriendRequestResult,
  cancelFriendRequestResult,
  listIncomingRequestsResult,
  listOutgoingRequestsResult,
  incomingRequestCountResult,
  listFriendsResult,
  searchFriendsResult,
  removeFriendResult,
  getFriendshipStatusResult,
} from './controller';

const router = new Router();

/**
 * POST /friends/requests - Send a friend request
 *
 * @route POST /api/friends/requests
 * @requestBody { identityId: string }
 */
router.post('/friends/requests', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await sendFriendRequestResult(identity._id, ctx.body);
  if (!result.ok) {
    if (result.kind === 'validation_failed') return ctx.errors.validationFailed();
    if (result.kind === 'not_found') return errors.notFound(result.message);
    return errors.badRequest(result.message);
  }

  return success(result.request, 'Friend request sent.');
});

/**
 * POST /friends/requests/:id/accept - Accept a friend request
 *
 * @route POST /api/friends/requests/:id/accept
 */
router.post('/friends/requests/:id/accept', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await acceptFriendRequestResult(identity._id, ctx.params.id);
  if (!result.ok) {
    if (result.kind === 'not_found') return errors.notFound(result.message);
    if (result.kind === 'unauthorized') return ctx.errors.unauthorized();
    return errors.badRequest(result.message);
  }

  return success(result.request, 'Friend request accepted.');
});

/**
 * POST /friends/requests/:id/ignore - Ignore a friend request
 *
 * @route POST /api/friends/requests/:id/ignore
 */
router.post('/friends/requests/:id/ignore', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await ignoreFriendRequestResult(identity._id, ctx.params.id);
  if (!result.ok) {
    if (result.kind === 'not_found') return errors.notFound(result.message);
    if (result.kind === 'unauthorized') return ctx.errors.unauthorized();
    return errors.badRequest(result.message);
  }

  return success(undefined, 'Friend request ignored.');
});

/**
 * DELETE /friends/requests/:id - Cancel an outgoing friend request
 *
 * @route DELETE /api/friends/requests/:id
 */
router.delete('/friends/requests/:id', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await cancelFriendRequestResult(identity._id, ctx.params.id);
  if (!result.ok) {
    if (result.kind === 'not_found') return errors.notFound(result.message);
    if (result.kind === 'unauthorized') return ctx.errors.unauthorized();
    return errors.badRequest(result.message);
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
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await listIncomingRequestsResult(identity._id, ctx.query);

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
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await listOutgoingRequestsResult(identity._id, ctx.query);

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
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const count = await incomingRequestCountResult(identity._id);

  return success({ count });
});

/**
 * GET /friends - List friends (paginated)
 *
 * @route GET /api/friends
 * @queryParam limit (number, optional): Max results (default 50, max 100)
 * @queryParam cursor (string, optional): Pagination cursor
 */
router.get('/friends', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await listFriendsResult(identity._id, ctx.query);

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
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await searchFriendsResult(identity._id, ctx.query);
  if (!result.ok) {
    if (result.kind === 'validation_failed') return ctx.errors.validationFailed();
    return errors.badRequest(result.message);
  }

  return success({ friends: result.friends });
});

/**
 * DELETE /friends/:identityId - Remove a friend
 *
 * @route DELETE /api/friends/:identityId
 */
router.delete('/friends/:identityId', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await removeFriendResult(identity._id, ctx.params.identityId);
  if (!result.ok) {
    if (result.kind === 'not_found') return errors.notFound(result.message);
    return errors.badRequest(result.message);
  }

  return success(undefined, 'Friend removed.');
});

/**
 * GET /friends/status/:identityId - Get friendship status
 *
 * @route GET /api/friends/status/:identityId
 */
router.get('/friends/status/:identityId', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await getFriendshipStatusResult(identity._id, ctx.params.identityId);
  if (!result.ok) {
    return errors.badRequest(result.message);
  }

  return success(result.data);
});

export const friendRoutes = router;
