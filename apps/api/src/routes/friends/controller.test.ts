import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { ROUTE_TEST_IDENTITY_ID, testIdentityEnrichment } from '../../test-fixtures/route-identity';
import type {
  FriendRequestResult,
  FriendshipResult,
  FriendInfo,
  IncomingFriendRequestInfo,
  FriendshipStatusResult,
} from '../../services/friend.service';
import type { PublicFriendRequest } from '../../models/friend-request';

const myIdentityId = ROUTE_TEST_IDENTITY_ID;
const targetIdentityId = new ObjectId();

const sendFriendRequestMock = mock(async (): Promise<FriendRequestResult> => ({
  success: true,
  request: {
    id: new ObjectId().toHexString(),
    fromIdentityId: myIdentityId.toHexString(),
    toIdentityId: targetIdentityId.toHexString(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  },
}));
const acceptFriendRequestMock = mock(async (): Promise<FriendRequestResult> => ({ success: true }));
const ignoreFriendRequestMock = mock(async (): Promise<FriendRequestResult> => ({ success: true }));
const cancelFriendRequestMock = mock(async (): Promise<FriendRequestResult> => ({ success: true }));
const removeFriendMock = mock(async (): Promise<FriendshipResult> => ({ success: true }));
const getFriendsMock = mock(async () => ({
  friends: [] as FriendInfo[],
  cursor: null as string | null,
}));
const searchFriendsMock = mock(async (_id: unknown, _q: string, _limit?: number) => [] as FriendInfo[]);
const getIncomingRequestsMock = mock(async () => ({
  requests: [] as IncomingFriendRequestInfo[],
  cursor: null as string | null,
  count: 0,
}));
const getOutgoingRequestsMock = mock(async () => ({
  requests: [] as PublicFriendRequest[],
  cursor: null as string | null,
}));
const getIncomingRequestCountMock = mock(async () => 0);
const getFriendshipStatusMock = mock(
  async (): Promise<FriendshipStatusResult> => ({ status: 'none' })
);

mock.module('../../services/friend.service', () => ({
  sendFriendRequest: sendFriendRequestMock,
  acceptFriendRequest: acceptFriendRequestMock,
  ignoreFriendRequest: ignoreFriendRequestMock,
  cancelFriendRequest: cancelFriendRequestMock,
  removeFriend: removeFriendMock,
  getFriends: getFriendsMock,
  searchFriends: searchFriendsMock,
  getIncomingRequests: getIncomingRequestsMock,
  getOutgoingRequests: getOutgoingRequestsMock,
  getIncomingRequestCount: getIncomingRequestCountMock,
  getFriendshipStatus: getFriendshipStatusMock,
}));

import { friendRoutes } from './index';

friendRoutes.use(testIdentityEnrichment(myIdentityId, { username: 'me' }));

function makeRequest(
  path: string,
  options: { method?: string; body?: object; cookies?: string } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.cookies) {
    headers['Cookie'] = options.cookies;
  }
  return new Request(`http://localhost${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

const AUTH_COOKIE = 'adieuu_session=session';

describe('friends routes', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    sendFriendRequestMock.mockClear();
    acceptFriendRequestMock.mockClear();
    ignoreFriendRequestMock.mockClear();
    cancelFriendRequestMock.mockClear();
    removeFriendMock.mockClear();
    getFriendsMock.mockClear();
    searchFriendsMock.mockClear();
    getIncomingRequestsMock.mockClear();
    getOutgoingRequestsMock.mockClear();
    getIncomingRequestCountMock.mockClear();
    getFriendshipStatusMock.mockClear();

    sendFriendRequestMock.mockResolvedValue({
      success: true,
      request: {
        id: new ObjectId().toHexString(),
        fromIdentityId: myIdentityId.toHexString(),
        toIdentityId: targetIdentityId.toHexString(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    });
    acceptFriendRequestMock.mockResolvedValue({ success: true });
    ignoreFriendRequestMock.mockResolvedValue({ success: true });
    cancelFriendRequestMock.mockResolvedValue({ success: true });
    removeFriendMock.mockResolvedValue({ success: true });
    getFriendsMock.mockResolvedValue({ friends: [], cursor: null });
    searchFriendsMock.mockResolvedValue([]);
    getIncomingRequestsMock.mockResolvedValue({ requests: [], cursor: null, count: 0 });
    getOutgoingRequestsMock.mockResolvedValue({ requests: [], cursor: null });
    getIncomingRequestCountMock.mockResolvedValue(0);
    getFriendshipStatusMock.mockResolvedValue({ status: 'none' });
  });

  // ---------------------------------------------------------------------------
  // POST /friends/requests - Send friend request
  // ---------------------------------------------------------------------------

  test('POST /friends/requests requires identity session', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/requests', {
      method: 'POST',
      body: { identityId: targetIdentityId.toHexString() },
    }));
    expect(response.status).toBe(401);
  });

  test('POST /friends/requests rejects invalid identityId', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/requests', {
      method: 'POST',
      body: { identityId: 'invalid' },
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(400);
  });

  test('POST /friends/requests succeeds with valid input', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/requests', {
      method: 'POST',
      body: { identityId: targetIdentityId.toHexString() },
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(200);
    expect(sendFriendRequestMock).toHaveBeenCalledTimes(1);
  });

  test('POST /friends/requests maps CANNOT_FRIEND_SELF to 400', async () => {
    sendFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'CANNOT_FRIEND_SELF',
      error: 'Cannot send friend request to yourself',
    });
    const response = await friendRoutes.handler()(makeRequest('/friends/requests', {
      method: 'POST',
      body: { identityId: targetIdentityId.toHexString() },
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(400);
  });

  test('POST /friends/requests maps ALREADY_FRIENDS to 400', async () => {
    sendFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'ALREADY_FRIENDS',
      error: 'Already friends',
    });
    const response = await friendRoutes.handler()(makeRequest('/friends/requests', {
      method: 'POST',
      body: { identityId: targetIdentityId.toHexString() },
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(400);
  });

  test('POST /friends/requests maps IDENTITY_NOT_FOUND to 404', async () => {
    sendFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'IDENTITY_NOT_FOUND',
      error: 'Identity not found',
    });
    const response = await friendRoutes.handler()(makeRequest('/friends/requests', {
      method: 'POST',
      body: { identityId: targetIdentityId.toHexString() },
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(404);
  });

  test('POST /friends/requests maps REQUEST_EXISTS to 400', async () => {
    sendFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'REQUEST_EXISTS',
      error: 'A pending friend request already exists',
    });
    const response = await friendRoutes.handler()(makeRequest('/friends/requests', {
      method: 'POST',
      body: { identityId: targetIdentityId.toHexString() },
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // POST /friends/requests/:id/accept
  // ---------------------------------------------------------------------------

  test('POST /friends/requests/:id/accept requires identity session', async () => {
    const id = new ObjectId().toHexString();
    const response = await friendRoutes.handler()(makeRequest(`/friends/requests/${id}/accept`, {
      method: 'POST',
    }));
    expect(response.status).toBe(401);
  });

  test('POST /friends/requests/:id/accept rejects invalid request ID', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/requests/invalid/accept', {
      method: 'POST',
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(400);
  });

  test('POST /friends/requests/:id/accept maps REQUEST_NOT_FOUND to 404', async () => {
    const id = new ObjectId().toHexString();
    acceptFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'REQUEST_NOT_FOUND',
      error: 'Friend request not found',
    });
    const response = await friendRoutes.handler()(makeRequest(`/friends/requests/${id}/accept`, {
      method: 'POST',
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(404);
  });

  test('POST /friends/requests/:id/accept maps NOT_AUTHORIZED to 401', async () => {
    const id = new ObjectId().toHexString();
    acceptFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'NOT_AUTHORIZED',
      error: 'Not authorized',
    });
    const response = await friendRoutes.handler()(makeRequest(`/friends/requests/${id}/accept`, {
      method: 'POST',
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // POST /friends/requests/:id/ignore
  // ---------------------------------------------------------------------------

  test('POST /friends/requests/:id/ignore requires identity session', async () => {
    const id = new ObjectId().toHexString();
    const response = await friendRoutes.handler()(makeRequest(`/friends/requests/${id}/ignore`, {
      method: 'POST',
    }));
    expect(response.status).toBe(401);
  });

  test('POST /friends/requests/:id/ignore rejects invalid request ID', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/requests/bad/ignore', {
      method: 'POST',
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(400);
  });

  test('POST /friends/requests/:id/ignore succeeds for valid request', async () => {
    const id = new ObjectId().toHexString();
    const response = await friendRoutes.handler()(makeRequest(`/friends/requests/${id}/ignore`, {
      method: 'POST',
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(200);
    expect(ignoreFriendRequestMock).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // DELETE /friends/requests/:id - Cancel friend request
  // ---------------------------------------------------------------------------

  test('DELETE /friends/requests/:id requires identity session', async () => {
    const id = new ObjectId().toHexString();
    const response = await friendRoutes.handler()(makeRequest(`/friends/requests/${id}`, {
      method: 'DELETE',
    }));
    expect(response.status).toBe(401);
  });

  test('DELETE /friends/requests/:id rejects invalid ID', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/requests/nope', {
      method: 'DELETE',
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(400);
  });

  test('DELETE /friends/requests/:id maps REQUEST_NOT_FOUND to 404', async () => {
    const id = new ObjectId().toHexString();
    cancelFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'REQUEST_NOT_FOUND',
      error: 'Friend request not found',
    });
    const response = await friendRoutes.handler()(makeRequest(`/friends/requests/${id}`, {
      method: 'DELETE',
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(404);
  });

  test('DELETE /friends/requests/:id succeeds for valid request', async () => {
    const id = new ObjectId().toHexString();
    const response = await friendRoutes.handler()(makeRequest(`/friends/requests/${id}`, {
      method: 'DELETE',
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(200);
    expect(cancelFriendRequestMock).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // GET /friends/requests/incoming
  // ---------------------------------------------------------------------------

  test('GET /friends/requests/incoming requires identity session', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/requests/incoming'));
    expect(response.status).toBe(401);
  });

  test('GET /friends/requests/incoming normalises limit and ignores invalid cursor', async () => {
    await friendRoutes.handler()(makeRequest('/friends/requests/incoming?limit=999&cursor=bad', {
      cookies: AUTH_COOKIE,
    }));
    expect(getIncomingRequestsMock).toHaveBeenCalledWith(myIdentityId, 100, undefined);
  });

  test('GET /friends/requests/incoming passes valid cursor', async () => {
    const cursor = new ObjectId().toHexString();
    await friendRoutes.handler()(makeRequest(`/friends/requests/incoming?cursor=${cursor}`, {
      cookies: AUTH_COOKIE,
    }));
    expect(getIncomingRequestsMock).toHaveBeenCalledWith(myIdentityId, 50, cursor);
  });

  // ---------------------------------------------------------------------------
  // GET /friends/requests/outgoing
  // ---------------------------------------------------------------------------

  test('GET /friends/requests/outgoing requires identity session', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/requests/outgoing'));
    expect(response.status).toBe(401);
  });

  test('GET /friends/requests/outgoing normalises limit', async () => {
    await friendRoutes.handler()(makeRequest('/friends/requests/outgoing?limit=-5', {
      cookies: AUTH_COOKIE,
    }));
    expect(getOutgoingRequestsMock).toHaveBeenCalledWith(myIdentityId, 50, undefined);
  });

  // ---------------------------------------------------------------------------
  // GET /friends/requests/count
  // ---------------------------------------------------------------------------

  test('GET /friends/requests/count requires identity session', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/requests/count'));
    expect(response.status).toBe(401);
  });

  test('GET /friends/requests/count returns count', async () => {
    getIncomingRequestCountMock.mockResolvedValueOnce(3);
    const response = await friendRoutes.handler()(makeRequest('/friends/requests/count', {
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { count: number } };
    expect(body.data.count).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // GET /friends
  // ---------------------------------------------------------------------------

  test('GET /friends requires identity session', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends'));
    expect(response.status).toBe(401);
  });

  test('GET /friends normalises limit and passes cursor', async () => {
    const cursor = new ObjectId().toHexString();
    await friendRoutes.handler()(makeRequest(`/friends?limit=200&cursor=${cursor}`, {
      cookies: AUTH_COOKIE,
    }));
    expect(getFriendsMock).toHaveBeenCalledWith(myIdentityId, 100, cursor);
  });

  // ---------------------------------------------------------------------------
  // GET /friends/search
  // ---------------------------------------------------------------------------

  test('GET /friends/search requires identity session', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/search?q=test'));
    expect(response.status).toBe(401);
  });

  test('GET /friends/search rejects queries shorter than 2 characters', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/search?q=a', {
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(400);
  });

  test('GET /friends/search rejects missing query', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/search', {
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(400);
  });

  test('GET /friends/search succeeds with valid query', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/search?q=alice&limit=10', {
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(200);
    expect(searchFriendsMock).toHaveBeenCalledTimes(1);
  });

  test('GET /friends/search caps limit at 50', async () => {
    await friendRoutes.handler()(makeRequest('/friends/search?q=alice&limit=999', {
      cookies: AUTH_COOKIE,
    }));
    const callArgs = searchFriendsMock.mock.calls[0]!;
    expect(callArgs[2]).toBe(50);
  });

  // ---------------------------------------------------------------------------
  // DELETE /friends/:identityId - Remove friend
  // ---------------------------------------------------------------------------

  test('DELETE /friends/:identityId requires identity session', async () => {
    const response = await friendRoutes.handler()(makeRequest(`/friends/${targetIdentityId.toHexString()}`, {
      method: 'DELETE',
    }));
    expect(response.status).toBe(401);
  });

  test('DELETE /friends/:identityId rejects invalid identityId', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/invalid', {
      method: 'DELETE',
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(400);
  });

  test('DELETE /friends/:identityId maps NOT_FRIENDS to 404', async () => {
    removeFriendMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'NOT_FRIENDS',
      error: 'Not friends',
    });
    const response = await friendRoutes.handler()(makeRequest(`/friends/${targetIdentityId.toHexString()}`, {
      method: 'DELETE',
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(404);
  });

  test('DELETE /friends/:identityId succeeds', async () => {
    const response = await friendRoutes.handler()(makeRequest(`/friends/${targetIdentityId.toHexString()}`, {
      method: 'DELETE',
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(200);
    expect(removeFriendMock).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // GET /friends/status/:identityId
  // ---------------------------------------------------------------------------

  test('GET /friends/status/:identityId requires identity session', async () => {
    const response = await friendRoutes.handler()(makeRequest(`/friends/status/${targetIdentityId.toHexString()}`));
    expect(response.status).toBe(401);
  });

  test('GET /friends/status/:identityId rejects invalid identityId', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends/status/bad-id', {
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(400);
  });

  test('GET /friends/status/:identityId returns status and friendsSince when friends', async () => {
    const since = '2026-01-01T00:00:00.000Z';
    getFriendshipStatusMock.mockResolvedValueOnce({ status: 'friends', friendsSince: since });
    const response = await friendRoutes.handler()(makeRequest(`/friends/status/${targetIdentityId.toHexString()}`, {
      cookies: AUTH_COOKIE,
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { status: string; friendsSince?: string } };
    expect(body.data.status).toBe('friends');
    expect(body.data.friendsSince).toBe(since);
  });
});
