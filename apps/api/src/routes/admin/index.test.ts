/**
 * Admin platform-settings routes — handler integration with mocked session and services.
 */

import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import { PLATFORM_SETTING_KEYS } from '../../constants/platform-settings-keys';

const mockRequireIdentitySession = mock(() => Promise.resolve(null as unknown));
const mockIsPlatformAdmin = mock(() => Promise.resolve(false));
const mockUpsertPlatformSetting = mock(() => Promise.resolve());
const mockFindAll = mock(() => Promise.resolve([] as unknown[]));
const mockFindByKey = mock((_key: string) => Promise.resolve(null as unknown));
const mockUserCount = mock(() => Promise.resolve(0));
const mockIdentityCount = mock(() => Promise.resolve(0));
const mockUserFindById = mock((_id?: unknown) => Promise.resolve(null as unknown));
const mockFindByIdentifier = mock(() => Promise.resolve(null as unknown));

mock.module('../../config', () => ({
  config: {
    cors: { origins: 'http://localhost:5173', credentials: true },
  },
}));

mock.module('../../services/session.service', () => ({
  requireIdentitySession: mockRequireIdentitySession,
  getSession: mock(() => Promise.resolve(null)),
  destroySession: mock(() => Promise.resolve()),
  destroyAllSessions: mock(() => Promise.resolve(0)),
  getSessionIdFromRequest: mock(() => null),
  buildLogoutCookie: mock(() => ''),
}));

const mockEnsureAuthAllowlist = mock(() => Promise.resolve());

mock.module('../../services/platform-settings.service', () => ({
  isPlatformAdmin: mockIsPlatformAdmin,
  upsertPlatformSetting: mockUpsertPlatformSetting,
  ensureAuthAllowlistPlatformSettingsExist: mockEnsureAuthAllowlist,
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

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    count: mockUserCount,
    findById: mockUserFindById,
    findByIdentifier: mockFindByIdentifier,
  }),
}));

const mockIdentityFindById = mock((_id?: unknown) => Promise.resolve(null as unknown));

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    count: mockIdentityCount,
    findById: mockIdentityFindById,
    findByIdentityId: mockIdentityFindById,
  }),
}));

mock.module('../../services/rate-limit.service', () => ({
  checkRateLimit: mock(() =>
    Promise.resolve({ allowed: true, remaining: 29, resetAt: 0, limit: 30 })
  ),
}));

import { Router } from '../../router';
import { adminRoutes } from './index';

const sessionUser = {
  type: 'identity' as const,
  identityId: new ObjectId().toHexString(),
  accountHash: 'test-hash',
  lastActivityAt: Date.now(),
  expiresAt: Date.now() + 86_400_000,
};

function adminHandler() {
  const app = new Router();
  app.merge(adminRoutes, '/api');
  return app.handler();
}

describe('admin platform-settings routes', () => {
  afterAll(() => {
    mock.restore();
  });

  const handler = adminHandler();

  beforeEach(() => {
    mockRequireIdentitySession.mockReset();
    mockIsPlatformAdmin.mockReset();
    mockUpsertPlatformSetting.mockReset();
    mockEnsureAuthAllowlist.mockReset();
    mockFindAll.mockReset();
    mockFindByKey.mockReset();
    mockUserCount.mockReset();
    mockIdentityCount.mockReset();
    mockUserFindById.mockReset();
    mockFindByIdentifier.mockReset();
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(null));
    mockIsPlatformAdmin.mockImplementation(() => Promise.resolve(false));
    mockFindAll.mockImplementation(() => Promise.resolve([]));
    mockFindByKey.mockImplementation(() => Promise.resolve(null));
    mockEnsureAuthAllowlist.mockImplementation(() => Promise.resolve());
    mockUserCount.mockImplementation(() => Promise.resolve(0));
    mockIdentityCount.mockImplementation(() => Promise.resolve(0));
    mockUserFindById.mockImplementation(() => Promise.resolve(null));
    mockFindByIdentifier.mockImplementation(() => Promise.resolve(null));
  });

  test('GET /api/admin/platform-settings returns 401 without session', async () => {
    const res = await handler(new Request('http://localhost/api/admin/platform-settings'));
    expect(res.status).toBe(401);
  });

  test('GET /api/admin/platform-settings returns 403 when session exists but user is not admin', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockIsPlatformAdmin.mockImplementation(() => Promise.resolve(false));

    const res = await handler(new Request('http://localhost/api/admin/platform-settings'));
    expect(res.status).toBe(403);
  });

  test('GET /api/admin/platform-settings returns 200 and list when admin', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
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
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockIsPlatformAdmin.mockImplementation(() => Promise.resolve(true));
    mockFindByKey.mockImplementation((key: string) => {
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED) {
        return Promise.resolve({
          _id: new ObjectId(),
          key,
          description: 'd',
          valueType: 'boolean',
          value: true,
          lastUpdatedBy: sessionUser.identityId,
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

  test('GET /api/admin/metrics returns 200 with counts when admin', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockIsPlatformAdmin.mockImplementation(() => Promise.resolve(true));
    mockUserCount.mockImplementation(() => Promise.resolve(42));
    let identityCall = 0;
    mockIdentityCount.mockImplementation(() => {
      const seq = [100, 30, 55];
      return Promise.resolve(seq[identityCall++] ?? 0);
    });

    const res = await handler(new Request('http://localhost/api/admin/metrics'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: {
        totalUsers: number;
        totalIdentities: number;
        activeIdentities15m: number;
        activeIdentities24h: number;
      };
    };
    expect(body.success).toBe(true);
    expect(body.data.totalUsers).toBe(42);
    expect(body.data.totalIdentities).toBe(100);
    expect(body.data.activeIdentities15m).toBe(30);
    expect(body.data.activeIdentities24h).toBe(55);
  });

  test('GET /api/admin/platform-admins returns admins when admin', async () => {
    const otherId = new ObjectId();
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockIsPlatformAdmin.mockImplementation(() => Promise.resolve(true));
    mockFindByKey.mockImplementation((key: string) => {
      if (key === PLATFORM_SETTING_KEYS.ADMIN_IDENTITY_LIST) {
        return Promise.resolve({
          _id: new ObjectId(),
          key,
          description: 'admins',
          valueType: 'objectIdArray',
          value: [otherId],
          lastUpdatedBy: 'system',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return Promise.resolve(null);
    });
    mockIdentityFindById.mockImplementation((id: unknown) => {
      const hex = typeof id === 'string' ? id : (id as ObjectId).toHexString();
      if (hex === otherId.toHexString()) {
        return Promise.resolve({
          _id: otherId,
          displayName: 'Admin User',
          username: 'adminuser',
          avatarUrl: undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return Promise.resolve(null);
    });

    const res = await handler(new Request('http://localhost/api/admin/platform-admins'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { admins: Array<{ identityId: string; displayName?: string; stale?: boolean }> };
    };
    expect(body.success).toBe(true);
    expect(body.data.admins).toHaveLength(1);
    const firstAdmin = body.data.admins[0];
    expect(firstAdmin).toBeDefined();
    expect(firstAdmin!.identityId).toBe(otherId.toHexString());
    expect(firstAdmin!.displayName).toBe('Admin User');
  });

  test('POST /api/admin/platform-admins returns 404 when user not found', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockIsPlatformAdmin.mockImplementation(() => Promise.resolve(true));
    mockIdentityFindById.mockImplementation(() => Promise.resolve(null));

    const res = await handler(
      new Request('http://localhost/api/admin/platform-admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId: new ObjectId().toHexString() }),
      })
    );
    expect(res.status).toBe(404);
  });

  test('DELETE /api/admin/platform-admins/:identityId returns 400 when removing self', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockIsPlatformAdmin.mockImplementation(() => Promise.resolve(true));

    const url = `http://localhost/api/admin/platform-admins/${sessionUser.identityId}`;
    const res = await handler(
      new Request(url, {
        method: 'DELETE',
      })
    );
    expect(res.status).toBe(400);
  });
});
