/**
 * Admin user management routes — HTTP wiring for moderation actions.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { PLATFORM_PERMISSIONS, PLATFORM_ROLES } from '../../constants/platform-permissions';
import type { PlatformCapabilities } from '../../services/platform-capabilities.service';

const adminIdentityId = new ObjectId().toHexString();
const targetUserId = new ObjectId();

const mockRequireIdentitySession = mock(() => Promise.resolve(null as unknown));
const mockGetPlatformCapabilities = mock(() => Promise.resolve({} as PlatformCapabilities));
const mockFindById = mock((_id?: unknown) => Promise.resolve(null as unknown));
const mockSuspendAccount = mock(() => Promise.resolve());
const mockBanAccount = mock(() => Promise.resolve());
const mockAuditCreate = mock(() => Promise.resolve({ _id: new ObjectId(), createdAt: new Date() }));

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

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
    suspendAccount: mockSuspendAccount,
    banAccount: mockBanAccount,
  }),
}));

mock.module('../../repositories/session.repository', () => ({
  getSessionRepository: () => ({
    revokeAllForUser: mock(() => Promise.resolve(0)),
  }),
}));

mock.module('../../repositories/audit.repository', () => ({
  getAuditLogRepository: () => ({
    create: mockAuditCreate,
  }),
}));

import { Router } from '../../router';
import { adminUsersRoutes } from './users';

const sessionUser = {
  type: 'identity' as const,
  identityId: adminIdentityId,
  maxVideoDurationSeconds: 300,
  subscriptions: [],
  entitlements: [],
  isLifetime: false,
  lastActivityAt: Date.now(),
  expiresAt: Date.now() + 86_400_000,
};

function manageUsersCaps(): PlatformCapabilities {
  return {
    isPlatformAdmin: true,
    isPlatformModerator: false,
    isPlatformSupportAgent: false,
    roles: [PLATFORM_ROLES.ADMIN],
    permissions: [PLATFORM_PERMISSIONS.MANAGE_USERS],
  };
}

function usersHandler() {
  const app = new Router();
  app.merge(adminUsersRoutes, '/api');
  return app.handler();
}

describe('admin user moderation routes', () => {
  afterAll(() => {
    mock.restore();
  });

  const handler = usersHandler();

  beforeEach(() => {
    mockRequireIdentitySession.mockReset();
    mockGetPlatformCapabilities.mockReset();
    mockFindById.mockReset();
    mockSuspendAccount.mockReset();
    mockBanAccount.mockReset();
    mockAuditCreate.mockReset();

    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(null));
    mockGetPlatformCapabilities.mockImplementation(() => Promise.resolve(manageUsersCaps()));
    mockFindById.mockImplementation(() =>
      Promise.resolve({
        _id: targetUserId,
        email: 'target@example.com',
      }),
    );
    mockSuspendAccount.mockImplementation(() => Promise.resolve());
    mockBanAccount.mockImplementation(() => Promise.resolve());
    mockAuditCreate.mockImplementation(() => Promise.resolve({ _id: new ObjectId(), createdAt: new Date() }));
  });

  test('POST /api/admin/users/:id/suspend returns 401 without session', async () => {
    const res = await handler(
      new Request(`http://localhost/api/admin/users/${targetUserId.toHexString()}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Abuse' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test('POST /api/admin/users/:id/suspend returns 403 without manage-users permission', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockGetPlatformCapabilities.mockImplementation(() =>
      Promise.resolve({
        ...manageUsersCaps(),
        permissions: [PLATFORM_PERMISSIONS.MANAGE_IDENTITIES],
      }),
    );

    const res = await handler(
      new Request(`http://localhost/api/admin/users/${targetUserId.toHexString()}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Abuse' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  test('POST /api/admin/users/:id/suspend returns 400 for self-action', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));

    const res = await handler(
      new Request(`http://localhost/api/admin/users/${adminIdentityId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Self suspend' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockSuspendAccount).not.toHaveBeenCalled();
  });

  test('POST /api/admin/users/:id/suspend returns 200 when permitted', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));

    const res = await handler(
      new Request(`http://localhost/api/admin/users/${targetUserId.toHexString()}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Abuse' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockSuspendAccount).toHaveBeenCalled();
    expect(mockAuditCreate).toHaveBeenCalled();
  });

  test('POST /api/admin/users/:id/ban returns 400 for self-action', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));

    const res = await handler(
      new Request(`http://localhost/api/admin/users/${adminIdentityId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Self ban' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockBanAccount).not.toHaveBeenCalled();
  });
});
