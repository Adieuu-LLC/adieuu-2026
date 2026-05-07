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
const acceptFriendRequestMock = mock(async (): Promise<FriendRequestResult> => ({
  success: true,
  request: {
    id: new ObjectId().toHexString(),
    fromIdentityId: targetIdentityId.toHexString(),
    toIdentityId: myIdentityId.toHexString(),
    status: 'accepted',
    createdAt: new Date().toISOString(),
  },
}));
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
  async (): Promise<FriendshipStatusResult> => ({ status: 'none' }),
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

import { friendRoutes } from './index';

friendRoutes.use(testIdentityEnrichment(myIdentityId, { username: 'me' }));

function makeRequest(
  path: string,
  options: { method?: string; body?: object; cookies?: string } = {},
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

describe('sendFriendRequestResult', () => {
  beforeEach(() => {
    sendFriendRequestMock.mockClear();
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
  });

  test('returns validation_failed for malformed body', async () => {
    const r = await sendFriendRequestResult(myIdentityId, {});
    expect(r).toEqual({ ok: false, kind: 'validation_failed' });
    expect(sendFriendRequestMock).not.toHaveBeenCalled();
  });

  test('returns bad_request when identity id is not valid ObjectId hex after sanitize', async () => {
    const r = await sendFriendRequestResult(myIdentityId, {
      identityId: 'gggggggggggggggggggggggg',
    });
    expect(r).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'Invalid identity ID.',
    });
    expect(sendFriendRequestMock).not.toHaveBeenCalled();
  });

  test('calls sendFriendRequest with sanitized id on success', async () => {
    const hex = targetIdentityId.toHexString();
    const r = await sendFriendRequestResult(myIdentityId, { identityId: hex });
    expect(r.ok).toBe(true);
    expect(sendFriendRequestMock).toHaveBeenCalledWith(myIdentityId, hex);
  });

  test('returns ok without request when blocked (silent success)', async () => {
    sendFriendRequestMock.mockResolvedValueOnce({ success: true });
    const hex = targetIdentityId.toHexString();
    const r = await sendFriendRequestResult(myIdentityId, { identityId: hex });
    expect(r).toEqual({ ok: true, request: undefined });
  });

  test('maps known error codes and default', async () => {
    sendFriendRequestMock.mockResolvedValueOnce({ success: false, errorCode: 'CANNOT_FRIEND_SELF' });
    expect(await sendFriendRequestResult(myIdentityId, { identityId: targetIdentityId.toHexString() })).toMatchObject({
      ok: false,
      kind: 'bad_request',
      message: 'Cannot send friend request to yourself.',
    });

    sendFriendRequestMock.mockResolvedValueOnce({ success: false, errorCode: 'ALREADY_FRIENDS' });
    expect(await sendFriendRequestResult(myIdentityId, { identityId: targetIdentityId.toHexString() })).toMatchObject({
      ok: false,
      kind: 'bad_request',
    });

    sendFriendRequestMock.mockResolvedValueOnce({ success: false, errorCode: 'REQUEST_EXISTS' });
    expect(await sendFriendRequestResult(myIdentityId, { identityId: targetIdentityId.toHexString() })).toMatchObject({
      ok: false,
      kind: 'bad_request',
    });

    sendFriendRequestMock.mockResolvedValueOnce({ success: false, errorCode: 'IDENTITY_NOT_FOUND' });
    expect(await sendFriendRequestResult(myIdentityId, { identityId: targetIdentityId.toHexString() })).toEqual({
      ok: false,
      kind: 'not_found',
      message: 'Identity not found.',
    });

    sendFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'UNKNOWN' as FriendRequestResult['errorCode'],
      error: 'weird',
    });
    expect(await sendFriendRequestResult(myIdentityId, { identityId: targetIdentityId.toHexString() })).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'weird',
    });
  });
});

describe('acceptFriendRequestResult', () => {
  beforeEach(() => {
    acceptFriendRequestMock.mockClear();
    acceptFriendRequestMock.mockResolvedValue({
      success: true,
      request: {
        id: new ObjectId().toHexString(),
        fromIdentityId: targetIdentityId.toHexString(),
        toIdentityId: myIdentityId.toHexString(),
        status: 'accepted',
        createdAt: new Date().toISOString(),
      },
    });
  });

  test('returns bad_request for invalid request id', async () => {
    const r = await acceptFriendRequestResult(myIdentityId, 'bad-id');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('bad_request');
    expect(acceptFriendRequestMock).not.toHaveBeenCalled();
  });

  test('calls service with sanitized id', async () => {
    const reqId = new ObjectId().toHexString();
    await acceptFriendRequestResult(myIdentityId, reqId);
    expect(acceptFriendRequestMock).toHaveBeenCalledWith(reqId, myIdentityId);
  });

  test('maps REQUEST_NOT_FOUND, NOT_AUTHORIZED, and default', async () => {
    acceptFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'REQUEST_NOT_FOUND',
      error: 'Friend request not found',
    });
    expect(await acceptFriendRequestResult(myIdentityId, new ObjectId().toHexString())).toEqual({
      ok: false,
      kind: 'not_found',
      message: 'Friend request not found.',
    });

    acceptFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'NOT_AUTHORIZED',
    });
    expect(await acceptFriendRequestResult(myIdentityId, new ObjectId().toHexString())).toEqual({
      ok: false,
      kind: 'unauthorized',
    });

    acceptFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'OTHER' as FriendRequestResult['errorCode'],
      error: 'oops',
    });
    expect(await acceptFriendRequestResult(myIdentityId, new ObjectId().toHexString())).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'oops',
    });
  });

  test('returns bad_request when service succeeds without request payload', async () => {
    acceptFriendRequestMock.mockResolvedValueOnce({ success: true });
    const r = await acceptFriendRequestResult(myIdentityId, new ObjectId().toHexString());
    expect(r).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'Failed to accept friend request.',
    });
  });
});

describe('ignoreFriendRequestResult', () => {
  beforeEach(() => {
    ignoreFriendRequestMock.mockClear();
    ignoreFriendRequestMock.mockResolvedValue({ success: true });
  });

  test('returns bad_request for invalid id', async () => {
    const r = await ignoreFriendRequestResult(myIdentityId, '!!!');
    expect(r.ok).toBe(false);
    expect(ignoreFriendRequestMock).not.toHaveBeenCalled();
  });

  test('maps REQUEST_NOT_FOUND and NOT_AUTHORIZED', async () => {
    const id = new ObjectId().toHexString();
    ignoreFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'REQUEST_NOT_FOUND',
      error: 'Friend request not found',
    });
    expect(await ignoreFriendRequestResult(myIdentityId, id)).toEqual({
      ok: false,
      kind: 'not_found',
      message: 'Friend request not found.',
    });

    ignoreFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'NOT_AUTHORIZED',
    });
    expect(await ignoreFriendRequestResult(myIdentityId, id)).toEqual({
      ok: false,
      kind: 'unauthorized',
    });
  });

  test('maps unknown errorCode to bad_request', async () => {
    ignoreFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'OTHER' as FriendRequestResult['errorCode'],
      error: 'fail',
    });
    expect(await ignoreFriendRequestResult(myIdentityId, new ObjectId().toHexString())).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'fail',
    });
  });
});

describe('cancelFriendRequestResult', () => {
  beforeEach(() => {
    cancelFriendRequestMock.mockClear();
    cancelFriendRequestMock.mockResolvedValue({ success: true });
  });

  test('maps REQUEST_NOT_FOUND and default error', async () => {
    const id = new ObjectId().toHexString();
    cancelFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'REQUEST_NOT_FOUND',
    });
    expect(await cancelFriendRequestResult(myIdentityId, id)).toEqual({
      ok: false,
      kind: 'not_found',
      message: 'Friend request not found.',
    });

    cancelFriendRequestMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'X' as FriendRequestResult['errorCode'],
      error: 'msg',
    });
    expect(await cancelFriendRequestResult(myIdentityId, id)).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'msg',
    });
  });
});

describe('listIncomingRequestsResult', () => {
  beforeEach(() => {
    getIncomingRequestsMock.mockClear();
    getIncomingRequestsMock.mockResolvedValue({ requests: [], cursor: null, count: 0 });
  });

  test('clamps limit and parses cursor like blocks', async () => {
    await listIncomingRequestsResult(myIdentityId, new URLSearchParams('limit=999'));
    expect(getIncomingRequestsMock).toHaveBeenCalledWith(myIdentityId, 100, undefined);

    await listIncomingRequestsResult(myIdentityId, new URLSearchParams('limit=-1'));
    expect(getIncomingRequestsMock).toHaveBeenLastCalledWith(myIdentityId, 50, undefined);

    const cursor = new ObjectId().toHexString();
    await listIncomingRequestsResult(myIdentityId, new URLSearchParams(`cursor=${cursor}`));
    expect(getIncomingRequestsMock).toHaveBeenLastCalledWith(myIdentityId, 50, cursor);

    await listIncomingRequestsResult(myIdentityId, new URLSearchParams('cursor=bad'));
    expect(getIncomingRequestsMock).toHaveBeenLastCalledWith(myIdentityId, 50, undefined);
  });
});

describe('listOutgoingRequestsResult', () => {
  beforeEach(() => {
    getOutgoingRequestsMock.mockClear();
    getOutgoingRequestsMock.mockResolvedValue({ requests: [], cursor: null });
  });

  test('passes valid cursor (parity with incoming)', async () => {
    const cursor = new ObjectId().toHexString();
    await listOutgoingRequestsResult(myIdentityId, new URLSearchParams(`cursor=${cursor}`));
    expect(getOutgoingRequestsMock).toHaveBeenCalledWith(myIdentityId, 50, cursor);
  });

  test('normalises limit', async () => {
    await listOutgoingRequestsResult(myIdentityId, new URLSearchParams('limit=-5'));
    expect(getOutgoingRequestsMock).toHaveBeenCalledWith(myIdentityId, 50, undefined);
  });
});

describe('incomingRequestCountResult', () => {
  test('delegates to service', async () => {
    getIncomingRequestCountMock.mockResolvedValueOnce(7);
    await expect(incomingRequestCountResult(myIdentityId)).resolves.toBe(7);
    expect(getIncomingRequestCountMock).toHaveBeenCalledWith(myIdentityId);
  });
});

describe('listFriendsResult', () => {
  beforeEach(() => {
    getFriendsMock.mockClear();
    getFriendsMock.mockResolvedValue({ friends: [], cursor: null });
  });

  test('normalises limit and passes cursor', async () => {
    const cursor = new ObjectId().toHexString();
    await listFriendsResult(myIdentityId, new URLSearchParams(`limit=200&cursor=${cursor}`));
    expect(getFriendsMock).toHaveBeenCalledWith(myIdentityId, 100, cursor);
  });
});

describe('searchFriendsResult', () => {
  beforeEach(() => {
    searchFriendsMock.mockClear();
    searchFriendsMock.mockResolvedValue([]);
  });

  test('returns validation_failed for missing, short, or whitespace-only query', async () => {
    expect(await searchFriendsResult(myIdentityId, new URLSearchParams())).toEqual({
      ok: false,
      kind: 'validation_failed',
    });
    expect(await searchFriendsResult(myIdentityId, new URLSearchParams('q=a'))).toEqual({
      ok: false,
      kind: 'validation_failed',
    });
    expect(await searchFriendsResult(myIdentityId, new URLSearchParams('q=  '))).toEqual({
      ok: false,
      kind: 'validation_failed',
    });
    expect(searchFriendsMock).not.toHaveBeenCalled();
  });

  test('returns bad_request when sanitization removes entire query', async () => {
    const q = `${'\u200B'}${'\u200B'}`;
    expect(q.trim().length).toBeGreaterThanOrEqual(2);
    const r = await searchFriendsResult(myIdentityId, new URLSearchParams(`q=${encodeURIComponent(q)}`));
    expect(r).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'Invalid search query.',
    });
    expect(searchFriendsMock).not.toHaveBeenCalled();
  });

  test('caps limit at 50 and calls searchFriends with sanitized query', async () => {
    await searchFriendsResult(myIdentityId, new URLSearchParams('q=alice&limit=999'));
    expect(searchFriendsMock).toHaveBeenCalledWith(myIdentityId, 'alice', 50);
  });
});

describe('removeFriendResult', () => {
  beforeEach(() => {
    removeFriendMock.mockClear();
    removeFriendMock.mockResolvedValue({ success: true });
  });

  test('maps NOT_FRIENDS and generic failures', async () => {
    removeFriendMock.mockResolvedValueOnce({ success: false, errorCode: 'NOT_FRIENDS' });
    expect(await removeFriendResult(myIdentityId, targetIdentityId.toHexString())).toEqual({
      ok: false,
      kind: 'not_found',
      message: 'Not friends with this identity.',
    });

    removeFriendMock.mockResolvedValueOnce({
      success: false,
      errorCode: 'IDENTITY_NOT_FOUND',
      error: 'nope',
    });
    expect(await removeFriendResult(myIdentityId, targetIdentityId.toHexString())).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'nope',
    });
  });
});

describe('getFriendshipStatusResult', () => {
  beforeEach(() => {
    getFriendshipStatusMock.mockClear();
    getFriendshipStatusMock.mockResolvedValue({ status: 'none' });
  });

  test('returns bad_request for invalid identity id', async () => {
    const r = await getFriendshipStatusResult(myIdentityId, '!!!');
    expect(r).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'Invalid identity ID.',
    });
    expect(getFriendshipStatusMock).not.toHaveBeenCalled();
  });

  test('returns status payload with optional friendsSince', async () => {
    const since = '2026-01-01T00:00:00.000Z';
    getFriendshipStatusMock.mockResolvedValueOnce({ status: 'friends', friendsSince: since });
    expect(await getFriendshipStatusResult(myIdentityId, targetIdentityId.toHexString())).toEqual({
      ok: true,
      data: { status: 'friends', friendsSince: since },
    });
  });
});

describe('sanitize edge cases for ObjectId inputs', () => {
  beforeEach(() => {
    sendFriendRequestMock.mockClear();
    sendFriendRequestMock.mockResolvedValue({ success: true, request: undefined });
  });

  test('sendFriendRequestResult rejects id that collapses after stripping non-id characters', async () => {
    const almost = '507f1f77bcf86cd79943901!';
    expect(almost.length).toBe(24);
    const r = await sendFriendRequestResult(myIdentityId, { identityId: almost });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('bad_request');
    expect(sendFriendRequestMock).not.toHaveBeenCalled();
  });
});

describe('friends routes smoke', () => {
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
    acceptFriendRequestMock.mockResolvedValue({
      success: true,
      request: {
        id: new ObjectId().toHexString(),
        fromIdentityId: targetIdentityId.toHexString(),
        toIdentityId: myIdentityId.toHexString(),
        status: 'accepted',
        createdAt: new Date().toISOString(),
      },
    });
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

  test('POST /friends/requests returns 401 without session', async () => {
    const response = await friendRoutes.handler()(
      makeRequest('/friends/requests', {
        method: 'POST',
        body: { identityId: targetIdentityId.toHexString() },
      }),
    );
    expect(response.status).toBe(401);
  });

  test('GET /friends/requests/count returns 200 with session', async () => {
    getIncomingRequestCountMock.mockResolvedValueOnce(2);
    const response = await friendRoutes.handler()(
      makeRequest('/friends/requests/count', { cookies: AUTH_COOKIE }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { count: number } };
    expect(body.data.count).toBe(2);
    expect(getIncomingRequestCountMock).toHaveBeenCalled();
  });

  test('GET /friends returns 200 with session', async () => {
    const response = await friendRoutes.handler()(makeRequest('/friends', { cookies: AUTH_COOKIE }));
    expect(response.status).toBe(200);
    expect(getFriendsMock).toHaveBeenCalled();
  });

  test('GET /friends/search returns 400 without valid q', async () => {
    const response = await friendRoutes.handler()(
      makeRequest('/friends/search?q=a', { cookies: AUTH_COOKIE }),
    );
    expect(response.status).toBe(400);
  });
});

afterAll(() => {
  mock.restore();
});
