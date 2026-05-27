/**
 * Admin routes — handler integration with mocked session and services.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { PLATFORM_SETTING_KEYS } from '../../constants/platform-settings-keys';
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
} from '../../constants/platform-permissions';
import type { PlatformCapabilities } from '../../services/platform-capabilities.service';

const mockRequireIdentitySession = mock(() => Promise.resolve(null as unknown));
const mockGetPlatformCapabilities = mock(() => Promise.resolve({} as PlatformCapabilities));
const mockUpsertPlatformSetting = mock(() => Promise.resolve());
const mockFindAll = mock(() => Promise.resolve([] as unknown[]));
const mockFindByKey = mock((_key: string) => Promise.resolve(null as unknown));
const mockUserCount = mock(() => Promise.resolve(0));
const mockIdentityCount = mock(() => Promise.resolve(0));
const mockIdentityFindById = mock((_id?: unknown) => Promise.resolve(null as unknown));
const mockFindByPlatformRole = mock((_role?: string) => Promise.resolve([] as unknown[]));
const mockCountByPlatformRole = mock((_role?: string) => Promise.resolve(0));
const mockAddPlatformRole = mock((_id?: unknown, _role?: string) => Promise.resolve(true));
const mockRemovePlatformRole = mock((_id?: unknown, _role?: string) => Promise.resolve(true));
const mockCheckRateLimit = mock(() =>
  Promise.resolve({ allowed: true, remaining: 29, resetAt: 0, limit: 30 }),
);
const mockEnsureAuthAllowlist = mock(() => Promise.resolve());

mock.module('../../config', () => ({
  config: {
    cors: { origins: 'http://localhost:5173', credentials: true },
  },
}));

mock.module('../../services/session.service', () => ({
  requireIdentitySession: mockRequireIdentitySession,
}));

mock.module('../../services/platform-capabilities.service', () => ({
  getPlatformCapabilities: mockGetPlatformCapabilities,
}));

mock.module('../../services/platform-settings.service', () => ({
  upsertPlatformSetting: mockUpsertPlatformSetting,
  ensureAuthAllowlistPlatformSettingsExist: mockEnsureAuthAllowlist,
}));

mock.module('../../repositories/platform-settings.repository', () => ({
  getPlatformSettingsRepository: () => ({
    findByKey: mockFindByKey,
    findAll: mockFindAll,
  }),
}));

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    count: mockUserCount,
  }),
}));

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    count: mockIdentityCount,
    findById: mockIdentityFindById,
    findByPlatformRole: mockFindByPlatformRole,
    countByPlatformRole: mockCountByPlatformRole,
    addPlatformRole: mockAddPlatformRole,
    removePlatformRole: mockRemovePlatformRole,
  }),
}));

mock.module('../../services/rate-limit.service', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

import { Router } from '../../router';
import { adminRoutes } from './index';

const sessionUser = {
  type: 'identity' as const,
  identityId: new ObjectId().toHexString(),
  lastActivityAt: Date.now(),
  expiresAt: Date.now() + 86_400_000,
};

function adminCaps(): PlatformCapabilities {
  return {
    isPlatformAdmin: true,
    isPlatformModerator: true,
    isPlatformSupportAgent: true,
    roles: [PLATFORM_ROLES.ADMIN],
    permissions: Object.values(PLATFORM_PERMISSIONS),
  };
}

function noCaps(): PlatformCapabilities {
  return {
    isPlatformAdmin: false,
    isPlatformModerator: false,
    isPlatformSupportAgent: false,
    roles: [],
    permissions: [],
  };
}

function adminHandler() {
  const app = new Router();
  app.merge(adminRoutes, '/api');
  return app.handler();
}

describe('admin routes', () => {
  afterAll(() => {
    mock.restore();
  });

  const handler = adminHandler();

  beforeEach(() => {
    mockRequireIdentitySession.mockReset();
    mockGetPlatformCapabilities.mockReset();
    mockUpsertPlatformSetting.mockReset();
    mockEnsureAuthAllowlist.mockReset();
    mockFindAll.mockReset();
    mockFindByKey.mockReset();
    mockUserCount.mockReset();
    mockIdentityCount.mockReset();
    mockIdentityFindById.mockReset();
    mockFindByPlatformRole.mockReset();
    mockCountByPlatformRole.mockReset();
    mockAddPlatformRole.mockReset();
    mockRemovePlatformRole.mockReset();
    mockCheckRateLimit.mockReset();

    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(null));
    mockGetPlatformCapabilities.mockImplementation(() => Promise.resolve(noCaps()));
    mockFindAll.mockImplementation(() => Promise.resolve([]));
    mockFindByKey.mockImplementation(() => Promise.resolve(null));
    mockEnsureAuthAllowlist.mockImplementation(() => Promise.resolve());
    mockUserCount.mockImplementation(() => Promise.resolve(0));
    mockIdentityCount.mockImplementation(() => Promise.resolve(0));
    mockIdentityFindById.mockImplementation(() => Promise.resolve(null));
    mockFindByPlatformRole.mockImplementation(() => Promise.resolve([]));
    mockCountByPlatformRole.mockImplementation(() => Promise.resolve(1));
    mockAddPlatformRole.mockImplementation(() => Promise.resolve(true));
    mockRemovePlatformRole.mockImplementation(() => Promise.resolve(true));
    mockUpsertPlatformSetting.mockImplementation(() => Promise.resolve());
    mockCheckRateLimit.mockImplementation(() =>
      Promise.resolve({ allowed: true, remaining: 29, resetAt: 0, limit: 30 }),
    );
  });

  test('GET /api/admin/platform-settings returns 401 without session', async () => {
    const res = await handler(new Request('http://localhost/api/admin/platform-settings'));
    expect(res.status).toBe(401);
  });

  test('GET /api/admin/platform-settings returns 403 without manage platform settings permission', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockGetPlatformCapabilities.mockImplementation(() =>
      Promise.resolve({
        ...adminCaps(),
        permissions: [PLATFORM_PERMISSIONS.MANAGE_USERS],
      }),
    );

    const res = await handler(new Request('http://localhost/api/admin/platform-settings'));
    expect(res.status).toBe(403);
  });

  test('GET /api/admin/platform-settings returns 200 when permitted', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockGetPlatformCapabilities.mockImplementation(() => Promise.resolve(adminCaps()));
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
      ]),
    );

    const res = await handler(new Request('http://localhost/api/admin/platform-settings'));
    expect(res.status).toBe(200);
  });

  test('GET /api/admin/metrics returns 403 without view metrics permission', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockGetPlatformCapabilities.mockImplementation(() =>
      Promise.resolve({
        ...adminCaps(),
        permissions: [PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS],
      }),
    );

    const res = await handler(new Request('http://localhost/api/admin/metrics'));
    expect(res.status).toBe(403);
  });

  test('GET /api/admin/metrics returns 200 with counts when permitted', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockGetPlatformCapabilities.mockImplementation(() => Promise.resolve(adminCaps()));
    mockUserCount.mockImplementation(() => Promise.resolve(42));
    let identityCall = 0;
    mockIdentityCount.mockImplementation(() => {
      const seq = [100, 30, 55];
      return Promise.resolve(seq[identityCall++] ?? 0);
    });

    const res = await handler(new Request('http://localhost/api/admin/metrics'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { totalUsers: number } };
    expect(body.data.totalUsers).toBe(42);
  });

  test('GET /api/admin/platform-admins returns admins from role query', async () => {
    const otherId = new ObjectId();
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockGetPlatformCapabilities.mockImplementation(() => Promise.resolve(adminCaps()));
    mockFindByPlatformRole.mockImplementation(() =>
      Promise.resolve([
        {
          _id: otherId,
          displayName: 'Admin User',
          username: 'adminuser',
          platformRoles: [PLATFORM_ROLES.ADMIN],
        },
      ]),
    );

    const res = await handler(new Request('http://localhost/api/admin/platform-admins'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { admins: Array<{ identityId: string; displayName?: string }> };
    };
    expect(body.data.admins).toHaveLength(1);
    expect(body.data.admins[0]?.identityId).toBe(otherId.toHexString());
  });

  test('POST /api/admin/identities/:id/roles grants admin role', async () => {
    const targetId = new ObjectId();
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockGetPlatformCapabilities.mockImplementation(() => Promise.resolve(adminCaps()));
    mockIdentityFindById
      .mockImplementationOnce(() =>
        Promise.resolve({ _id: targetId, platformRoles: [] }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({ _id: targetId, platformRoles: [PLATFORM_ROLES.ADMIN] }),
      );

    const res = await handler(
      new Request(`http://localhost/api/admin/identities/${targetId.toHexString()}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: PLATFORM_ROLES.ADMIN }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockAddPlatformRole).toHaveBeenCalled();
  });

  test('DELETE /api/admin/identities/:id/roles/:role blocks self-removal', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockGetPlatformCapabilities.mockImplementation(() => Promise.resolve(adminCaps()));

    const url = `http://localhost/api/admin/identities/${sessionUser.identityId}/roles/${PLATFORM_ROLES.ADMIN}`;
    const res = await handler(new Request(url, { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });

  test('POST /api/admin/identities/:id/roles returns 429 when rate limited', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockGetPlatformCapabilities.mockImplementation(() => Promise.resolve(adminCaps()));
    mockCheckRateLimit.mockImplementationOnce(() =>
      Promise.resolve({ allowed: false, remaining: 0, resetAt: 0, limit: 30 }),
    );

    const res = await handler(
      new Request(`http://localhost/api/admin/identities/${new ObjectId().toHexString()}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: PLATFORM_ROLES.ADMIN }),
      }),
    );
    expect(res.status).toBe(429);
  });
});
