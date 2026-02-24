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
    },
    cookie: {
      domain: '',
    },
  },
}));

// Mock crypto utilities
mock.module('../../utils/crypto', () => ({
  generateSecureToken: mock(() => 'test-token'),
  hashIdentifier: mock((id: string) => `hashed:${id}`),
  hmacSign: mock((data: string) => `sig:${data}`),
  hmacVerify: mock(() => true),
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

// Mock notification service
const mockGetNotifications = mock(() => Promise.resolve({
  notifications: [
    {
      id: new ObjectId().toHexString(),
      type: 'friend_request',
      title: 'New friend request',
      body: 'User wants to be your friend',
      read: false,
      createdAt: new Date().toISOString(),
    },
  ],
  unreadCount: 1,
}));

const mockMarkNotificationsAsRead = mock(() => Promise.resolve({ markedCount: 1 }));
const mockMarkNotificationsAsUnread = mock(() => Promise.resolve({ markedCount: 1 }));
const mockDeleteNotifications = mock(() => Promise.resolve({ deletedCount: 1 }));
const mockGetNotificationCounts = mock(() => Promise.resolve({
  unread: 5,
  byType: { friend_request: 2, message: 3 },
}));

mock.module('../../services/notification.service', () => ({
  getNotifications: mockGetNotifications,
  markNotificationsAsRead: mockMarkNotificationsAsRead,
  markNotificationsAsUnread: mockMarkNotificationsAsUnread,
  deleteNotifications: mockDeleteNotifications,
  getNotificationCounts: mockGetNotificationCounts,
}));

// Import after mocking
import { notificationRoutes } from './index';

describe('notifications routes', () => {
  beforeEach(() => {
    mockGetNotifications.mockClear();
    mockMarkNotificationsAsRead.mockClear();
    mockMarkNotificationsAsUnread.mockClear();
    mockDeleteNotifications.mockClear();
    mockGetNotificationCounts.mockClear();
  });

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

    const handler = notificationRoutes.handler();
    return handler(request);
  };

  beforeEach(() => {
    mockGetNotifications.mockClear();
    mockMarkNotificationsAsRead.mockClear();
    mockMarkNotificationsAsUnread.mockClear();
    mockDeleteNotifications.mockClear();
    mockGetNotificationCounts.mockClear();
  });

  describe('GET /notifications', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest('/notifications', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    test('returns notifications with identity session', async () => {
      const response = await makeRequest('/notifications', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetNotifications).toHaveBeenCalled();

      const body = await response.json() as { success: boolean; data: { notifications: unknown[]; unreadCount: number } };
      expect(body.success).toBe(true);
      expect(body.data.notifications).toBeDefined();
      expect(body.data.unreadCount).toBeDefined();
    });

    test('respects limit parameter', async () => {
      const response = await makeRequest('/notifications?limit=25', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetNotifications).toHaveBeenCalledWith(
        mockIdentityId,
        expect.objectContaining({ limit: 25 })
      );
    });

    test('caps limit at 100', async () => {
      const response = await makeRequest('/notifications?limit=200', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetNotifications).toHaveBeenCalledWith(
        mockIdentityId,
        expect.objectContaining({ limit: 100 })
      );
    });

    test('passes unreadOnly filter', async () => {
      const response = await makeRequest('/notifications?unreadOnly=true', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetNotifications).toHaveBeenCalledWith(
        mockIdentityId,
        expect.objectContaining({ unreadOnly: true })
      );
    });

    test('parses types parameter', async () => {
      const response = await makeRequest('/notifications?types=friend_request,message', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetNotifications).toHaveBeenCalledWith(
        mockIdentityId,
        expect.objectContaining({ types: ['friend_request', 'message'] })
      );
    });

    test('validates since date parameter', async () => {
      const sinceDate = '2024-01-15T12:00:00Z';
      const response = await makeRequest(`/notifications?since=${encodeURIComponent(sinceDate)}`, {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetNotifications).toHaveBeenCalledWith(
        mockIdentityId,
        expect.objectContaining({ since: sinceDate })
      );
    });
  });

  describe('POST /notifications/read', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest('/notifications/read', {
        method: 'POST',
        body: { notificationIds: 'all' },
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid body', async () => {
      const response = await makeRequest('/notifications/read', {
        method: 'POST',
        body: {},
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(400);
    });

    test('marks all notifications as read', async () => {
      const response = await makeRequest('/notifications/read', {
        method: 'POST',
        body: { notificationIds: 'all' },
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockMarkNotificationsAsRead).toHaveBeenCalledWith(mockIdentityId, 'all');
    });

    test('marks specific notifications as read', async () => {
      const notificationIds = [
        new ObjectId().toHexString(),
        new ObjectId().toHexString(),
      ];

      const response = await makeRequest('/notifications/read', {
        method: 'POST',
        body: { notificationIds },
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockMarkNotificationsAsRead).toHaveBeenCalledWith(mockIdentityId, notificationIds);
    });

    test('filters out invalid notification IDs', async () => {
      const validId = new ObjectId().toHexString();
      // Use a 24-char string that's not a valid ObjectId hex format
      const invalidId = 'zzzzzzzzzzzzzzzzzzzzzzzz';
      const notificationIds = [validId, invalidId];

      const response = await makeRequest('/notifications/read', {
        method: 'POST',
        body: { notificationIds },
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockMarkNotificationsAsRead).toHaveBeenCalledWith(mockIdentityId, [validId]);
    });

    test('returns 400 when all notification IDs are invalid', async () => {
      // Use 24-char strings that are not valid ObjectId hex format
      const response = await makeRequest('/notifications/read', {
        method: 'POST',
        body: { notificationIds: ['zzzzzzzzzzzzzzzzzzzzzzzz', 'yyyyyyyyyyyyyyyyyyyyyyyy'] },
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /notifications/unread', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest('/notifications/unread', {
        method: 'POST',
        body: { notificationIds: 'all' },
      });

      expect(response.status).toBe(401);
    });

    test('marks notifications as unread', async () => {
      const response = await makeRequest('/notifications/unread', {
        method: 'POST',
        body: { notificationIds: 'all' },
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockMarkNotificationsAsUnread).toHaveBeenCalledWith(mockIdentityId, 'all');
    });
  });

  describe('DELETE /notifications', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest('/notifications', {
        method: 'DELETE',
        body: { notificationIds: 'all' },
      });

      expect(response.status).toBe(401);
    });

    test('deletes all notifications', async () => {
      const response = await makeRequest('/notifications', {
        method: 'DELETE',
        body: { notificationIds: 'all' },
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockDeleteNotifications).toHaveBeenCalledWith(mockIdentityId, 'all');

      const body = await response.json() as { data: { deletedCount: number } };
      expect(body.data.deletedCount).toBe(1);
    });

    test('deletes specific notifications', async () => {
      const notificationIds = [new ObjectId().toHexString()];

      const response = await makeRequest('/notifications', {
        method: 'DELETE',
        body: { notificationIds },
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockDeleteNotifications).toHaveBeenCalledWith(mockIdentityId, notificationIds);
    });
  });

  describe('GET /notifications/count', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest('/notifications/count', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    test('returns notification counts', async () => {
      const response = await makeRequest('/notifications/count', {
        method: 'GET',
        cookies: 'adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetNotificationCounts).toHaveBeenCalledWith(mockIdentityId);

      const body = await response.json() as { data: { unread: number; byType: Record<string, number> } };
      expect(body.data.unread).toBe(5);
      expect(body.data.byType).toBeDefined();
    });
  });
});
