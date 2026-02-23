/**
 * Friends controller module.
 *
 * Contains the business logic for friend request and friendship endpoints,
 * including sending/accepting/ignoring requests and managing friendships.
 *
 * @module routes/friends/controller
 */
import { success, errors } from '../../utils/response';
import { PublicIdentity } from "../../models/identity";
import { RouteContext } from "../../router";
import { getIdentityFromSession, getIdentitySessionIdFromRequest } from "../../services";
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
import { isValidObjectId, sanitizeString } from "../../utils";
import { z } from '@adieuu/shared/schemas';

export interface GetFriendRequestsRes {
  requests: {
    id: string;
    fromIdentity: PublicIdentity;
    createdAt: string;
  }[];
  cursor: string | null;
  success: boolean;
}

/**
 * Zod schema for send friend request
 */
const SendFriendRequestSchema = z.object({
  toIdentityId: z.string().length(24),
});

/**
 * Returns the current identity's incoming friends requests
 *
 * @returns A promise resolving to the current identity's incoming friends requests
 *
 */
export async function getFriendRequestsCtrl(ctx: RouteContext): Promise<Response> {

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
}

export async function sendFriendRequestCtrl(ctx: RouteContext): Promise<Response> {
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
        return errors.rateLimited('Too many friend requests too quickly. Please try again later.');
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
}

export async function getSentFriendRequestsCtrl(ctx: RouteContext): Promise<Response> {
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
}

export async function acceptFriendRequestCtrl(ctx: RouteContext): Promise<Response> {
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
}

export async function ignoreFriendRequestCtrl(ctx: RouteContext): Promise<Response> {
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
}

export async function cancelFriendRequestCtrl(ctx: RouteContext): Promise<Response> {
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
}

export async function getFriendsCtrl(ctx: RouteContext): Promise<Response> {
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
}

export async function checkFriendshipStatusCtrl(ctx: RouteContext): Promise<Response> {
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
}

export async function removeFriendCtrl(ctx: RouteContext): Promise<Response> {
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
}
