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
import {
  getFriendRequestsCtrl,
  getSentFriendRequestsCtrl,
  sendFriendRequestCtrl,
  acceptFriendRequestCtrl,
  ignoreFriendRequestCtrl,
  cancelFriendRequestCtrl,
  getFriendsCtrl,
  checkFriendshipStatusCtrl,
  removeFriendCtrl,
} from './controller';

const router = new Router();

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
  return await sendFriendRequestCtrl(ctx);
});

/**
 * GET /friends/requests - Get incoming friends requests.
 *
 * Returns the current identity's incoming friends requests
 *
 * @route GET /api/friends/requests
 *
 * @queryParam limit (number, optional): Max results (default: 20, max: 50)
 * @queryParam cursor (string, optional): Pagination cursor
 *
 * @returns 200 OK with the current identity's incoming friends requests and pagination cursor
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/friends/requests/incoming', async (ctx) => {
  return await getFriendRequestsCtrl(ctx);
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
  return await getSentFriendRequestsCtrl(ctx);
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
  return await acceptFriendRequestCtrl(ctx);
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
  return await ignoreFriendRequestCtrl(ctx);
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
  return await cancelFriendRequestCtrl(ctx);
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
  return await getFriendsCtrl(ctx);
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
  return await checkFriendshipStatusCtrl(ctx);
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
  return await removeFriendCtrl(ctx);
});

export const friendsRoutes = router;
