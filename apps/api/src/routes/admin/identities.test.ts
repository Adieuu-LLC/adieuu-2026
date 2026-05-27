/**
 * Admin identity management routes — HTTP wiring for moderation actions.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { PLATFORM_PERMISSIONS, PLATFORM_ROLES } from '../../constants/platform-permissions';
import type { PlatformCapabilities } from '../../services/platform-capabilities.service';

const adminIdentityId = new ObjectId().toHexString();
const targetIdentityId = new ObjectId();

const mockRequireIdentitySession = mock(() => Promise.resolve(null as unknown));
const mockGetPlatformCapabilities = mock(() => Promise.resolve({} as PlatformCapabilities));
const mockFindByIdentityId = mock((_id?: unknown) => Promise.resolve(null as unknown));
const mockSuspendIdentity = mock(() => Promise.resolve());
const mockBanIdentity = mock(() => Promise.resolve());
const mockRevokeAllForIdentity = mock(() => Promise.resolve(0));
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

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findByIdentityId: mockFindByIdentityId,
    suspendIdentity: mockSuspendIdentity,
    banIdentity: mockBanIdentity,
  }),
}));

mock.module('../../repositories/session.repository', () => ({
  getSessionRepository: () => ({
    revokeAllForIdentity: mockRevokeAllForIdentity,
  }),
}));

mock.module('../../repositories/audit.repository', () => ({
  getAuditLogRepository: () => ({
    create: mockAuditCreate,
  }),
}));

import { Router } from '../../router';
import { adminIdentitiesRoutes } from './identities';

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

function manageIdentitiesCaps(): PlatformCapabilities {
  return {
    isPlatformAdmin: true,
    isPlatformModerator: false,
    isPlatformSupportAgent: false,
    roles: [PLATFORM_ROLES.ADMIN],
    permissions: [PLATFORM_PERMISSIONS.MANAGE_IDENTITIES],
  };
}

function identitiesHandler() {
  const app = new Router();
  app.merge(adminIdentitiesRoutes, '/api');
  return app.handler();
}

describe('admin identity moderation routes', () => {
  afterAll(() => {
    mock.restore();
  });

  const handler = identitiesHandler();

  beforeEach(() => {
    mockRequireIdentitySession.mockReset();
    mockGetPlatformCapabilities.mockReset();
    mockFindByIdentityId.mockReset();
    mockSuspendIdentity.mockReset();
    mockBanIdentity.mockReset();
    mockRevokeAllForIdentity.mockReset();
    mockAuditCreate.mockReset();

    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(null));
    mockGetPlatformCapabilities.mockImplementation(() => Promise.resolve(manageIdentitiesCaps()));
    mockFindByIdentityId.mockImplementation(() =>
      Promise.resolve({
        _id: targetIdentityId,
        ident: 'target-ident-hash',
        username: 'target',
        platformRoles: [PLATFORM_ROLES.MODERATOR],
      }),
    );
    mockSuspendIdentity.mockImplementation(() => Promise.resolve());
    mockBanIdentity.mockImplementation(() => Promise.resolve());
    mockRevokeAllForIdentity.mockImplementation(() => Promise.resolve(1));
    mockAuditCreate.mockImplementation(() => Promise.resolve({ _id: new ObjectId(), createdAt: new Date() }));
  });

  test('POST /api/admin/identities/:id/suspend returns 401 without session', async () => {
    const res = await handler(
      new Request(`http://localhost/api/admin/identities/${targetIdentityId.toHexString()}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Abuse' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test('POST /api/admin/identities/:id/suspend returns 400 for self-action', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));

    const res = await handler(
      new Request(`http://localhost/api/admin/identities/${adminIdentityId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Self suspend' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockSuspendIdentity).not.toHaveBeenCalled();
  });

  test('POST /api/admin/identities/:id/suspend returns 400 for protected admin target', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockFindByIdentityId.mockImplementation(() =>
      Promise.resolve({
        _id: targetIdentityId,
        ident: 'admin-target-hash',
        username: 'admin-target',
        platformRoles: [PLATFORM_ROLES.ADMIN],
      }),
    );

    const res = await handler(
      new Request(`http://localhost/api/admin/identities/${targetIdentityId.toHexString()}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Attempt admin suspend' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockSuspendIdentity).not.toHaveBeenCalled();
  });

  test('POST /api/admin/identities/:id/suspend returns 200 for moderator target', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));

    const res = await handler(
      new Request(`http://localhost/api/admin/identities/${targetIdentityId.toHexString()}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Policy violation' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mockSuspendIdentity).toHaveBeenCalled();
    expect(mockAuditCreate).toHaveBeenCalled();
  });

  test('POST /api/admin/identities/:id/ban returns 400 for protected admin target', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockFindByIdentityId.mockImplementation(() =>
      Promise.resolve({
        _id: targetIdentityId,
        ident: 'admin-target-hash',
        username: 'admin-target',
        platformRoles: [PLATFORM_ROLES.ADMIN],
      }),
    );

    const res = await handler(
      new Request(`http://localhost/api/admin/identities/${targetIdentityId.toHexString()}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Attempt admin ban' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockBanIdentity).not.toHaveBeenCalled();
  });
});
