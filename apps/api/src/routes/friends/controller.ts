/**
 * Friends controller — validation, sanitization, and friend service orchestration.
 *
 * Route modules map structured results to HTTP responses.
 *
 * @module routes/friends/controller
 */

import type { ObjectId } from 'mongodb';
import { z } from '@adieuu/shared/schemas';
import type { PublicFriendRequest } from '../../models/friend-request';
import { isValidObjectId, sanitizeString } from '../../utils';
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
  type FriendshipStatusResult,
  type FriendInfo,
  type IncomingFriendRequestInfo,
} from '../../services/friend.service';

/** Zod schema for POST /friends/requests body */
export const SendRequestSchema = z.object({
  identityId: z.string().length(24),
});

function sanitizeObjectIdHex(raw: string): string | null {
  const { value } = sanitizeString(raw, 'id');
  if (!value || !isValidObjectId(value)) return null;
  return value;
}

function clampPaginationLimit(limitParam: string | null, fallback: number, max: number): number {
  let limit = limitParam ? parseInt(limitParam, 10) : fallback;
  if (isNaN(limit) || limit < 1) limit = fallback;
  if (limit > max) limit = max;
  return limit;
}

function sanitizeOptionalCursor(cursorParam: string | null): string | undefined {
  if (!cursorParam) return undefined;
  const hex = sanitizeObjectIdHex(cursorParam);
  return hex ?? undefined;
}

function mapMutableFriendRequestFailure(result: {
  error?: string;
  errorCode?: string;
}): { kind: 'not_found'; message: string } | { kind: 'unauthorized' } | { kind: 'bad_request'; message: string } {
  switch (result.errorCode) {
    case 'REQUEST_NOT_FOUND':
      return { kind: 'not_found', message: 'Friend request not found.' };
    case 'NOT_AUTHORIZED':
      return { kind: 'unauthorized' };
    default:
      return {
        kind: 'bad_request',
        message: result.error ?? 'Operation failed.',
      };
  }
}

export type SendFriendRequestResult =
  | { ok: false; kind: 'validation_failed' }
  | { ok: false; kind: 'bad_request'; message: string }
  | { ok: false; kind: 'not_found'; message: string }
  | { ok: true; request?: PublicFriendRequest };

export async function sendFriendRequestResult(
  callerId: ObjectId,
  body: unknown,
): Promise<SendFriendRequestResult> {
  const parseResult = SendRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const hexId = sanitizeObjectIdHex(parseResult.data.identityId);
  if (!hexId) {
    return { ok: false, kind: 'bad_request', message: 'Invalid identity ID.' };
  }

  const result = await sendFriendRequest(callerId, hexId);

  if (!result.success) {
    switch (result.errorCode) {
      case 'CANNOT_FRIEND_SELF':
        return { ok: false, kind: 'bad_request', message: 'Cannot send friend request to yourself.' };
      case 'ALREADY_FRIENDS':
        return { ok: false, kind: 'bad_request', message: 'Already friends with this identity.' };
      case 'REQUEST_EXISTS':
        return { ok: false, kind: 'bad_request', message: 'A pending friend request already exists.' };
      case 'IDENTITY_NOT_FOUND':
        return { ok: false, kind: 'not_found', message: 'Identity not found.' };
      default:
        return {
          ok: false,
          kind: 'bad_request',
          message: result.error ?? 'Failed to send friend request.',
        };
    }
  }

  return { ok: true, request: result.request };
}

export type AcceptFriendRequestResult =
  | { ok: false; kind: 'bad_request'; message: string }
  | { ok: false; kind: 'not_found'; message: string }
  | { ok: false; kind: 'unauthorized' }
  | { ok: true; request: PublicFriendRequest };

export async function acceptFriendRequestResult(
  callerId: ObjectId,
  rawRequestId: string | undefined,
): Promise<AcceptFriendRequestResult> {
  const hexId = sanitizeObjectIdHex(rawRequestId ?? '');
  if (!hexId) {
    return { ok: false, kind: 'bad_request', message: 'Invalid request ID.' };
  }

  const result = await acceptFriendRequest(hexId, callerId);

  if (!result.success) {
    const mapped = mapMutableFriendRequestFailure(result);
    return { ok: false, ...mapped };
  }

  if (!result.request) {
    return { ok: false, kind: 'bad_request', message: 'Failed to accept friend request.' };
  }

  return { ok: true, request: result.request };
}

export type IgnoreFriendRequestResult =
  | { ok: false; kind: 'bad_request'; message: string }
  | { ok: false; kind: 'not_found'; message: string }
  | { ok: false; kind: 'unauthorized' }
  | { ok: true };

export async function ignoreFriendRequestResult(
  callerId: ObjectId,
  rawRequestId: string | undefined,
): Promise<IgnoreFriendRequestResult> {
  const hexId = sanitizeObjectIdHex(rawRequestId ?? '');
  if (!hexId) {
    return { ok: false, kind: 'bad_request', message: 'Invalid request ID.' };
  }

  const result = await ignoreFriendRequest(hexId, callerId);

  if (!result.success) {
    const mapped = mapMutableFriendRequestFailure(result);
    return { ok: false, ...mapped };
  }

  return { ok: true };
}

export type CancelFriendRequestResult =
  | { ok: false; kind: 'bad_request'; message: string }
  | { ok: false; kind: 'not_found'; message: string }
  | { ok: false; kind: 'unauthorized' }
  | { ok: true };

export async function cancelFriendRequestResult(
  callerId: ObjectId,
  rawRequestId: string | undefined,
): Promise<CancelFriendRequestResult> {
  const hexId = sanitizeObjectIdHex(rawRequestId ?? '');
  if (!hexId) {
    return { ok: false, kind: 'bad_request', message: 'Invalid request ID.' };
  }

  const result = await cancelFriendRequest(hexId, callerId);

  if (!result.success) {
    const mapped = mapMutableFriendRequestFailure(result);
    return { ok: false, ...mapped };
  }

  return { ok: true };
}

export type IncomingRequestsPayload = {
  requests: IncomingFriendRequestInfo[];
  count: number;
  cursor: string | null;
};

export async function listIncomingRequestsResult(
  callerId: ObjectId,
  query: URLSearchParams,
): Promise<IncomingRequestsPayload> {
  const limit = clampPaginationLimit(query.get('limit'), 50, 100);
  const validCursor = sanitizeOptionalCursor(query.get('cursor'));

  const result = await getIncomingRequests(callerId, limit, validCursor);

  return {
    requests: result.requests,
    count: result.count,
    cursor: result.cursor,
  };
}

export type OutgoingRequestsPayload = {
  requests: PublicFriendRequest[];
  cursor: string | null;
};

export async function listOutgoingRequestsResult(
  callerId: ObjectId,
  query: URLSearchParams,
): Promise<OutgoingRequestsPayload> {
  const limit = clampPaginationLimit(query.get('limit'), 50, 100);
  const validCursor = sanitizeOptionalCursor(query.get('cursor'));

  const result = await getOutgoingRequests(callerId, limit, validCursor);

  return {
    requests: result.requests,
    cursor: result.cursor,
  };
}

export async function incomingRequestCountResult(callerId: ObjectId): Promise<number> {
  return getIncomingRequestCount(callerId);
}

export type FriendsListPayload = {
  friends: FriendInfo[];
  cursor: string | null;
};

export async function listFriendsResult(callerId: ObjectId, query: URLSearchParams): Promise<FriendsListPayload> {
  const limit = clampPaginationLimit(query.get('limit'), 50, 100);
  const validCursor = sanitizeOptionalCursor(query.get('cursor'));

  const result = await getFriends(callerId, limit, validCursor);

  return {
    friends: result.friends,
    cursor: result.cursor,
  };
}

export type SearchFriendsResult =
  | { ok: false; kind: 'validation_failed' }
  | { ok: false; kind: 'bad_request'; message: string }
  | { ok: true; friends: FriendInfo[] };

export async function searchFriendsResult(callerId: ObjectId, query: URLSearchParams): Promise<SearchFriendsResult> {
  const rawQ = query.get('q');
  if (!rawQ || rawQ.trim().length < 2) {
    return { ok: false, kind: 'validation_failed' };
  }

  const sanitized = sanitizeString(rawQ.trim(), 'general');
  if (!sanitized.value) {
    return { ok: false, kind: 'bad_request', message: 'Invalid search query.' };
  }

  const limit = clampPaginationLimit(query.get('limit'), 20, 50);

  const friends = await searchFriends(callerId, sanitized.value, limit);

  return { ok: true, friends };
}

export type RemoveFriendResult =
  | { ok: false; kind: 'bad_request'; message: string }
  | { ok: false; kind: 'not_found'; message: string }
  | { ok: true };

export async function removeFriendResult(
  callerId: ObjectId,
  rawFriendIdentityId: string | undefined,
): Promise<RemoveFriendResult> {
  const hexId = sanitizeObjectIdHex(rawFriendIdentityId ?? '');
  if (!hexId) {
    return { ok: false, kind: 'bad_request', message: 'Invalid identity ID.' };
  }

  const result = await removeFriend(callerId, hexId);

  if (!result.success) {
    if (result.errorCode === 'NOT_FRIENDS') {
      return { ok: false, kind: 'not_found', message: 'Not friends with this identity.' };
    }
    return {
      ok: false,
      kind: 'bad_request',
      message: result.error ?? 'Failed to remove friend.',
    };
  }

  return { ok: true };
}

export type FriendshipStatusPayload = FriendshipStatusResult;

export async function getFriendshipStatusResult(
  callerId: ObjectId,
  rawOtherIdentityId: string | undefined,
): Promise<
  | { ok: false; kind: 'bad_request'; message: string }
  | { ok: true; data: FriendshipStatusPayload }
> {
  const hexId = sanitizeObjectIdHex(rawOtherIdentityId ?? '');
  if (!hexId) {
    return { ok: false, kind: 'bad_request', message: 'Invalid identity ID.' };
  }

  const result = await getFriendshipStatus(callerId, hexId);

  return {
    ok: true,
    data: {
      status: result.status,
      ...(result.friendsSince != null ? { friendsSince: result.friendsSince } : {}),
    },
  };
}
