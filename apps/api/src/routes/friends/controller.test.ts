import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

// Mock config
mock.module('../../config', () => ({
  config: {
    env: 'test',
    cors: { origins: '*', credentials: false },
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
    security: {
      sessionSecret: 'test-secret',
      otpSecret: 'test-otp-secret',
    },
    cookie: {
      domain: '',
    },
  },
}));

// Test identity data
const mockIdentityId = new ObjectId();
const mockIdentity = {
  _id: mockIdentityId,
  ident: 'test-hash',
  hashVersion: 1,
  username: 'testuser',
  displayName: 'Test User',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastActiveAt: new Date(),
};

const mockTargetIdentityId = new ObjectId();
const mockTargetIdentity = {
  _id: mockTargetIdentityId,
  ident: 'target-hash',
  hashVersion: 1,
  username: 'targetuser',
  displayName: 'Target User',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastActiveAt: new Date(),
};

// Mock identity service
mock.module('../../services/identity.service', () => ({
  getIdentitySessionIdFromRequest: mock((request: Request) => {
    const cookie = request.headers.get('Cookie') ?? '';
    if (cookie.includes('adieuu_identity=')) {
      return 'test-identity-session';
    }
    return null;
  }),
  getIdentityFromSession: mock(() => Promise.resolve(mockIdentity)),
}));

// Mock friend request service
const mockSendFriendRequest = mock(() => Promise.resolve({
  success: true,
  requestId: new ObjectId().toHexString(),
  status: 'pending',
  message: 'Friend request sent.',
}));

const mockAcceptFriendRequest = mock(() => Promise.resolve({
  success: true,
  friend: {
    identityId: mockTargetIdentityId.toHexString(),
    username: 'targetuser',
    displayName: 'Target User',
    friendsSince: new Date().toISOString(),
  },
}));

const mockIgnoreFriendRequest = mock(() => Promise.resolve({ success: true }));
const mockCancelFriendRequest = mock(() => Promise.resolve({ success: true }));

const mockGetIncomingFriendRequests = mock(() => Promise.resolve({
  requests: [],
  cursor: null,
}));

const mockGetSentFriendRequests = mock(() => Promise.resolve({
  requests: [],
  cursor: null,
}));

mock.module('../../services/friend-request.service', () => ({
  sendFriendRequest: mockSendFriendRequest,
  acceptFriendRequest: mockAcceptFriendRequest,
  ignoreFriendRequest: mockIgnoreFriendRequest,
  cancelFriendRequest: mockCancelFriendRequest,
  getIncomingFriendRequests: mockGetIncomingFriendRequests,
  getSentFriendRequests: mockGetSentFriendRequests,
}));

// Mock friendship service
const mockGetFriends = mock(() => Promise.resolve({
  friends: [],
  cursor: null,
  total: 0,
}));

const mockCheckFriendshipStatus = mock(() => Promise.resolve({
  status: 'none',
  friendsSince: null,
  requestId: null,
}));

const mockRemoveFriend = mock(() => Promise.resolve({ success: true }));

mock.module('../../services/friendship.service', () => ({
  getFriends: mockGetFriends,
  checkFriendshipStatus: mockCheckFriendshipStatus,
  removeFriend: mockRemoveFriend,
}));

// Import after mocking
import { friendsRoutes } from './index';

describe('friends routes', () => {
  const makeRequest = async (
    path: string,
    options: { method?: string; body?: object; cookies?: string } = {}
  ) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.cookies) {
      headers['Cookie'] = options.cookies;
    }

    const request = new Request(`http://localhost${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const handler = friendsRoutes.handler();
    return handler(request);
  };

  beforeEach(() => {
    mockSendFriendRequest.mockClear();
    mockAcceptFriendRequest.mockClear();
    mockIgnoreFriendRequest.mockClear();
    mockCancelFriendRequest.mockClear();
    mockGetIncomingFriendRequests.mockClear();
    mockGetSentFriendRequests.mockClear();
    mockGetFriends.mockClear();
    mockCheckFriendshipStatus.mockClear();
    mockRemoveFriend.mockClear();
  });

  describe('POST /friends/request', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest('/friends/request', {
        method: 'POST',
        body: { toIdentityId: mockTargetIdentityId.toHexString() },
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid identity ID format', async () => {
      const response = await makeRequest('/friends/request', {
        method: 'POST',
        body: { toIdentityId: 'invalid-id' },
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(400);
    });

    test('returns 400 for missing toIdentityId', async () => {
      const response = await makeRequest('/friends/request', {
        method: 'POST',
        body: {},
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(400);
    });

    test('sends friend request with valid input', async () => {
      const response = await makeRequest('/friends/request', {
        method: 'POST',
        body: { toIdentityId: mockTargetIdentityId.toHexString() },
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(201);
      expect(mockSendFriendRequest).toHaveBeenCalled();
    });
  });

  describe('GET /friends/requests/incoming', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest('/friends/requests/incoming', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    test('returns incoming requests with identity session', async () => {
      const response = await makeRequest('/friends/requests/incoming', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetIncomingFriendRequests).toHaveBeenCalled();
    });

    test('respects limit parameter', async () => {
      const response = await makeRequest('/friends/requests/incoming?limit=10', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetIncomingFriendRequests).toHaveBeenCalledWith(
        mockIdentityId,
        10,
        undefined
      );
    });

    test('caps limit at 50', async () => {
      const response = await makeRequest('/friends/requests/incoming?limit=100', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetIncomingFriendRequests).toHaveBeenCalledWith(
        mockIdentityId,
        50,
        undefined
      );
    });
  });

  describe('GET /friends/requests/sent', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest('/friends/requests/sent', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    test('returns sent requests with identity session', async () => {
      const response = await makeRequest('/friends/requests/sent', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetSentFriendRequests).toHaveBeenCalled();
    });
  });

  describe('POST /friends/request/:requestId/accept', () => {
    const validRequestId = new ObjectId().toHexString();

    test('returns 401 without identity session', async () => {
      const response = await makeRequest(`/friends/request/${validRequestId}/accept`, {
        method: 'POST',
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid request ID', async () => {
      const response = await makeRequest('/friends/request/invalid-id/accept', {
        method: 'POST',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(400);
    });

    test('accepts friend request with valid ID', async () => {
      const response = await makeRequest(`/friends/request/${validRequestId}/accept`, {
        method: 'POST',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockAcceptFriendRequest).toHaveBeenCalledWith(validRequestId, mockIdentityId);
    });
  });

  describe('POST /friends/request/:requestId/ignore', () => {
    const validRequestId = new ObjectId().toHexString();

    test('returns 401 without identity session', async () => {
      const response = await makeRequest(`/friends/request/${validRequestId}/ignore`, {
        method: 'POST',
      });

      expect(response.status).toBe(401);
    });

    test('ignores friend request with valid ID', async () => {
      const response = await makeRequest(`/friends/request/${validRequestId}/ignore`, {
        method: 'POST',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockIgnoreFriendRequest).toHaveBeenCalledWith(validRequestId, mockIdentityId);
    });
  });

  describe('DELETE /friends/request/:requestId', () => {
    const validRequestId = new ObjectId().toHexString();

    test('returns 401 without identity session', async () => {
      const response = await makeRequest(`/friends/request/${validRequestId}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
    });

    test('cancels friend request with valid ID', async () => {
      const response = await makeRequest(`/friends/request/${validRequestId}`, {
        method: 'DELETE',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockCancelFriendRequest).toHaveBeenCalledWith(validRequestId, mockIdentityId);
    });
  });

  describe('GET /friends', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest('/friends', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    test('returns friends list with identity session', async () => {
      const response = await makeRequest('/friends', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetFriends).toHaveBeenCalled();
    });

    test('respects limit parameter with max of 100', async () => {
      const response = await makeRequest('/friends?limit=200', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetFriends).toHaveBeenCalledWith(
        mockIdentityId,
        100,
        undefined,
        undefined
      );
    });

    test('passes search parameter', async () => {
      const response = await makeRequest('/friends?search=test', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetFriends).toHaveBeenCalledWith(
        mockIdentityId,
        50,
        undefined,
        'test'
      );
    });
  });

  describe('GET /friends/status/:identityId', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest(`/friends/status/${mockTargetIdentityId.toHexString()}`, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid identity ID', async () => {
      const response = await makeRequest('/friends/status/invalid-id', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(400);
    });

    test('returns friendship status', async () => {
      const response = await makeRequest(`/friends/status/${mockTargetIdentityId.toHexString()}`, {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockCheckFriendshipStatus).toHaveBeenCalledWith(
        mockIdentityId,
        mockTargetIdentityId.toHexString()
      );
    });
  });

  describe('DELETE /friends/:identityId', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest(`/friends/${mockTargetIdentityId.toHexString()}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid identity ID', async () => {
      const response = await makeRequest('/friends/invalid-id', {
        method: 'DELETE',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(400);
    });

    test('removes friend with valid ID', async () => {
      const response = await makeRequest(`/friends/${mockTargetIdentityId.toHexString()}`, {
        method: 'DELETE',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockRemoveFriend).toHaveBeenCalledWith(
        mockIdentityId,
        mockTargetIdentityId.toHexString()
      );
    });
  });
});
