import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { ROUTE_TEST_IDENTITY_ID, testIdentityEnrichment } from '../../test-fixtures/route-identity';

const mockIdentityId = ROUTE_TEST_IDENTITY_ID;

const mockGetNotifications = mock(async () => ({
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
  cursor: null,
}));

const mockMarkNotificationsAsRead = mock(async () => ({ success: true, markedCount: 1 }));
const mockMarkNotificationsAsUnread = mock(async () => ({ success: true, markedCount: 1 }));
const mockDeleteNotifications = mock(async () => ({ success: true, deletedCount: 1 }));
const mockGetNotificationCounts = mock(async () => ({
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

import {
  parseNotificationIds,
  getNotificationsResult,
  markNotificationsAsReadResult,
  deleteNotificationsResult,
} from './controller';

import { notificationRoutes } from './index';

notificationRoutes.use(testIdentityEnrichment(mockIdentityId));

const AUTH_COOKIE = 'adieuu_session=test-identity-session';

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

describe('parseNotificationIds', () => {
  test('accepts "all"', () => {
    expect(parseNotificationIds({ notificationIds: 'all' })).toEqual({
      ok: true,
      ids: 'all',
    });
  });

  test('returns validation_failed for malformed body', () => {
    expect(parseNotificationIds({})).toEqual({ ok: false, kind: 'validation_failed' });
  });

  test('accepts valid notification id array', () => {
    const id = new ObjectId().toHexString();
    expect(parseNotificationIds({ notificationIds: [id] })).toEqual({
      ok: true,
      ids: [id],
    });
  });

  test('filters out invalid notification IDs', () => {
    const validId = new ObjectId().toHexString();
    const result = parseNotificationIds({
      notificationIds: [validId, 'zzzzzzzzzzzzzzzzzzzzzzzz'],
    });
    expect(result).toEqual({ ok: true, ids: [validId] });
  });

  test('returns bad_request when all notification IDs are invalid', () => {
    expect(
      parseNotificationIds({
        notificationIds: ['zzzzzzzzzzzzzzzzzzzzzzzz', 'yyyyyyyyyyyyyyyyyyyyyyyy'],
      }),
    ).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'Invalid notification IDs.',
    });
  });
});

describe('getNotificationsResult', () => {
  beforeEach(() => {
    mockGetNotifications.mockClear();
    mockGetNotifications.mockImplementation(async () => ({
      notifications: [],
      unreadCount: 0,
      cursor: null,
    }));
  });

  test('clamps limit at 100', async () => {
    await getNotificationsResult(mockIdentityId, new URLSearchParams({ limit: '200' }));
    expect(mockGetNotifications).toHaveBeenCalledWith(
      mockIdentityId,
      expect.objectContaining({ limit: 100 }),
    );
  });

  test('defaults invalid limit to 50', async () => {
    await getNotificationsResult(mockIdentityId, new URLSearchParams({ limit: '0' }));
    expect(mockGetNotifications).toHaveBeenCalledWith(
      mockIdentityId,
      expect.objectContaining({ limit: 50 }),
    );
  });

  test('passes unreadOnly filter', async () => {
    await getNotificationsResult(mockIdentityId, new URLSearchParams({ unreadOnly: 'true' }));
    expect(mockGetNotifications).toHaveBeenCalledWith(
      mockIdentityId,
      expect.objectContaining({ unreadOnly: true }),
    );
  });

  test('parses types parameter', async () => {
    await getNotificationsResult(
      mockIdentityId,
      new URLSearchParams({ types: 'friend_request,message' }),
    );
    expect(mockGetNotifications).toHaveBeenCalledWith(
      mockIdentityId,
      expect.objectContaining({ types: ['friend_request', 'message'] }),
    );
  });

  test('validates since date parameter', async () => {
    const sinceDate = '2024-01-15T12:00:00Z';
    await getNotificationsResult(
      mockIdentityId,
      new URLSearchParams({ since: sinceDate }),
    );
    expect(mockGetNotifications).toHaveBeenCalledWith(
      mockIdentityId,
      expect.objectContaining({ since: sinceDate }),
    );
  });
});

describe('markNotificationsAsReadResult', () => {
  beforeEach(() => {
    mockMarkNotificationsAsRead.mockClear();
    mockMarkNotificationsAsRead.mockImplementation(async () => ({ success: true, markedCount: 1 }));
  });

  test('returns validation_failed for invalid body', async () => {
    const result = await markNotificationsAsReadResult(mockIdentityId, {});
    expect(result).toEqual({ ok: false, kind: 'validation_failed' });
    expect(mockMarkNotificationsAsRead).not.toHaveBeenCalled();
  });

  test('marks all notifications as read', async () => {
    const result = await markNotificationsAsReadResult(mockIdentityId, { notificationIds: 'all' });
    expect(result.ok).toBe(true);
    expect(mockMarkNotificationsAsRead).toHaveBeenCalledWith(mockIdentityId, 'all');
  });

  test('marks specific notifications as read', async () => {
    const notificationIds = [new ObjectId().toHexString(), new ObjectId().toHexString()];
    const result = await markNotificationsAsReadResult(mockIdentityId, { notificationIds });
    expect(result.ok).toBe(true);
    expect(mockMarkNotificationsAsRead).toHaveBeenCalledWith(mockIdentityId, notificationIds);
  });
});

describe('deleteNotificationsResult', () => {
  beforeEach(() => {
    mockDeleteNotifications.mockClear();
    mockDeleteNotifications.mockImplementation(async () => ({ success: true, deletedCount: 1 }));
  });

  test('deletes all notifications', async () => {
    const result = await deleteNotificationsResult(mockIdentityId, { notificationIds: 'all' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.deletedCount).toBe(1);
    expect(mockDeleteNotifications).toHaveBeenCalledWith(mockIdentityId, 'all');
  });
});

describe('notification route smoke tests', () => {
  beforeEach(() => {
    mockGetNotifications.mockClear();
    mockMarkNotificationsAsRead.mockClear();
    mockMarkNotificationsAsUnread.mockClear();
    mockDeleteNotifications.mockClear();
    mockGetNotificationCounts.mockClear();

    mockGetNotifications.mockImplementation(async () => ({
      notifications: [],
      unreadCount: 0,
      cursor: null,
    }));
    mockMarkNotificationsAsRead.mockImplementation(async () => ({ success: true, markedCount: 1 }));
    mockMarkNotificationsAsUnread.mockImplementation(async () => ({ success: true, markedCount: 1 }));
    mockDeleteNotifications.mockImplementation(async () => ({ success: true, deletedCount: 1 }));
    mockGetNotificationCounts.mockImplementation(async () => ({
      unread: 5,
      byType: { friend_request: 2, message: 3 },
    }));
  });

  test('GET /notifications returns 401 without session', async () => {
    const response = await notificationRoutes.handler()(makeRequest('/notifications'));
    expect(response.status).toBe(401);
  });

  test('GET /notifications returns 200 with session', async () => {
    const response = await notificationRoutes.handler()(
      makeRequest('/notifications', { cookies: AUTH_COOKIE }),
    );
    expect(response.status).toBe(200);
    expect(mockGetNotifications).toHaveBeenCalled();
  });

  test('POST /notifications/read returns 401 without session', async () => {
    const response = await notificationRoutes.handler()(
      makeRequest('/notifications/read', {
        method: 'POST',
        body: { notificationIds: 'all' },
      }),
    );
    expect(response.status).toBe(401);
  });

  test('POST /notifications/read returns 200 with session', async () => {
    const response = await notificationRoutes.handler()(
      makeRequest('/notifications/read', {
        method: 'POST',
        body: { notificationIds: 'all' },
        cookies: AUTH_COOKIE,
      }),
    );
    expect(response.status).toBe(200);
    expect(mockMarkNotificationsAsRead).toHaveBeenCalledWith(mockIdentityId, 'all');
  });

  test('DELETE /notifications returns 200 with session', async () => {
    const response = await notificationRoutes.handler()(
      makeRequest('/notifications', {
        method: 'DELETE',
        body: { notificationIds: 'all' },
        cookies: AUTH_COOKIE,
      }),
    );
    expect(response.status).toBe(200);
    expect(mockDeleteNotifications).toHaveBeenCalledWith(mockIdentityId, 'all');
  });

  test('GET /notifications/count returns 200 with session', async () => {
    const response = await notificationRoutes.handler()(
      makeRequest('/notifications/count', { cookies: AUTH_COOKIE }),
    );
    expect(response.status).toBe(200);
    expect(mockGetNotificationCounts).toHaveBeenCalledWith(mockIdentityId);

    const body = (await response.json()) as { data: { unread: number; byType: Record<string, number> } };
    expect(body.data.unread).toBe(5);
    expect(body.data.byType).toBeDefined();
  });
});

afterAll(() => {
  mock.restore();
});
