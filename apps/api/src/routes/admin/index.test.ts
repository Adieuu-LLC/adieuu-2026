/**
 * Admin platform-settings routes — handler integration with mocked session and services.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import { PLATFORM_SETTING_KEYS } from '../../constants/platform-settings-keys';

const mockGetSessionFromRequest = mock(() => Promise.resolve(null as unknown));
const mockIsPlatformAdmin = mock(() => Promise.resolve(false));
const mockUpsertPlatformSetting = mock(() => Promise.resolve());
const mockFindAll = mock(() => Promise.resolve([] as unknown[]));
const mockFindByKey = mock((_key: string) => Promise.resolve(null as unknown));

mock.module('../../config', () => ({
  config: {
    cors: { origins: 'http://localhost:5173', credentials: true },
  },
}));

mock.module('../../services/session.service', () => ({
  getSessionFromRequest: mockGetSessionFromRequest,
  getSession: mock(() => Promise.resolve(null)),
  destroySession: mock(() => Promise.resolve()),
  destroyAllSessions: mock(() => Promise.resolve(0)),
  getSessionIdFromRequest: mock(() => null),
  buildLogoutCookie: mock(() => ''),
}));

mock.module('../../services/platform-settings.service', () => ({
  isPlatformAdmin: mockIsPlatformAdmin,
  upsertPlatformSetting: mockUpsertPlatformSetting,
  isAuthIdentifierAllowed: mock(() => Promise.resolve(true)),
  coercePlatformSettingValue: mock(() => ({})),
}));

mock.module('../../repositories/platform-settings.repository', () => ({
  getPlatformSettingsRepository: () => ({
    findByKey: mockFindByKey,
    findAll: mockFindAll,
    upsertByKey: mock(() => Promise.resolve({})),
  }),
}));

import { Router } from '../../router';
import { adminRoutes } from './index';

const sessionUser = {
  userId: new ObjectId().toHexString(),
  identifier: 'admin@example.com',
  identifierType: 'email' as const,
  lastActivityAt: Date.now(),
};

function adminHandler() {
  const app = new Router();
  app.merge(adminRoutes, '/api');
  return app.handler();
}

describe('admin platform-settings routes', () => {
  const handler = adminHandler();

  beforeEach(() => {
    mockGetSessionFromRequest.mockReset();
    mockIsPlatformAdmin.mockReset();
    mockUpsertPlatformSetting.mockReset();
    mockFindAll.mockReset();
    mockFindByKey.mockReset();
    mockGetSessionFromRequest.mockImplementation(() => Promise.resolve(null));
    mockIsPlatformAdmin.mockImplementation(() => Promise.resolve(false));
    mockFindAll.mockImplementation(() => Promise.resolve([]));
    mockFindByKey.mockImplementation(() => Promise.resolve(null));
  });

  test('GET /api/admin/platform-settings returns 401 without session', async () => {
    const res = await handler(new Request('http://localhost/api/admin/platform-settings'));
    expect(res.status).toBe(401);
  });

  test('GET /api/admin/platform-settings returns 403 when session exists but user is not admin', async () => {
    mockGetSessionFromRequest.mockImplementation(() => Promise.resolve(sessionUser));
    mockIsPlatformAdmin.mockImplementation(() => Promise.resolve(false));

    const res = await handler(new Request('http://localhost/api/admin/platform-settings'));
    expect(res.status).toBe(403);
  });

  test('GET /api/admin/platform-settings returns 200 and list when admin', async () => {
    mockGetSessionFromRequest.mockImplementation(() => Promise.resolve(sessionUser));
    mockIsPlatformAdmin.mockImplementation(() => Promise.resolve(true));
    mockFindAll.mockImplementation(() =>
      Promise.resolve([
        {
          _id: new ObjectId(),
          key: PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED,
          description: 'test',
          valueType: 'boolean',
          value: false,
          lastUpdatedBy: 'system',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
    );

    const res = await handler(new Request('http://localhost/api/admin/platform-settings'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect((body.data[0] as { key: string }).key).toBe(
      PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED
    );
  });

  test('PUT /api/admin/platform-settings/:key upserts and returns 200', async () => {
    mockGetSessionFromRequest.mockImplementation(() => Promise.resolve(sessionUser));
    mockIsPlatformAdmin.mockImplementation(() => Promise.resolve(true));
    mockFindByKey.mockImplementation((key: string) => {
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED) {
        return Promise.resolve({
          _id: new ObjectId(),
          key,
          description: 'd',
          valueType: 'boolean',
          value: true,
          lastUpdatedBy: sessionUser.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return Promise.resolve(null);
    });

    const url = `http://localhost/api/admin/platform-settings/${encodeURIComponent(
      PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED
    )}`;
    const res = await handler(
      new Request(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueType: 'boolean', value: true, description: 'd' }),
      })
    );

    expect(mockUpsertPlatformSetting).toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { key: string } };
    expect(body.success).toBe(true);
    expect(body.data.key).toBe(PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED);
  });
});
