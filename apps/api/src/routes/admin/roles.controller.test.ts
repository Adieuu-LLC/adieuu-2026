import { afterAll, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
} from '../../constants/platform-permissions';
import type { PlatformCapabilities } from '../../services/platform-capabilities.service';

const mockFindById = mock((_id?: unknown) => Promise.resolve(null as unknown));
const mockFindByPlatformRole = mock((_role?: string) => Promise.resolve([] as unknown[]));
const mockCountByPlatformRole = mock((_role?: string) => Promise.resolve(0));
const mockAddPlatformRole = mock((_id?: unknown, _role?: string) => Promise.resolve(true));
const mockRemovePlatformRole = mock((_id?: unknown, _role?: string) => Promise.resolve(true));
const mockCheckRateLimit = mock(() =>
  Promise.resolve({ allowed: true, remaining: 29, resetAt: 0, limit: 30 }),
);

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findById: mockFindById,
    findByPlatformRole: mockFindByPlatformRole,
    countByPlatformRole: mockCountByPlatformRole,
    addPlatformRole: mockAddPlatformRole,
    removePlatformRole: mockRemovePlatformRole,
  }),
}));

mock.module('../../services/rate-limit.service', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

import {
  grantPlatformRoleResult,
  listPlatformRoleHoldersResult,
  revokePlatformRoleResult,
} from './roles.controller';

const actorId = new ObjectId().toHexString();
const targetId = new ObjectId();

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

describe('listPlatformRoleHoldersResult', () => {
  afterAll(() => {
    mock.restore();
  });

  test('forbidden without manage roles permission', async () => {
    const result = await listPlatformRoleHoldersResult('admin', noCaps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('forbidden');
  });

  test('lists identities for a valid role', async () => {
    mockFindByPlatformRole.mockImplementation(() =>
      Promise.resolve([
        {
          _id: targetId,
          displayName: 'Admin User',
          username: 'adminuser',
          platformRoles: [PLATFORM_ROLES.ADMIN],
        },
      ]),
    );

    const result = await listPlatformRoleHoldersResult('admin', adminCaps());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identities).toHaveLength(1);
      expect(result.identities[0]?.identityId).toBe(targetId.toHexString());
    }
  });
});

describe('grantPlatformRoleResult', () => {
  afterAll(() => {
    mock.restore();
  });

  test('forbidden without manage roles permission', async () => {
    const result = await grantPlatformRoleResult(
      actorId,
      targetId.toHexString(),
      { role: PLATFORM_ROLES.ADMIN },
      noCaps(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('forbidden');
  });

  test('returns rate limited when throttled', async () => {
    mockCheckRateLimit.mockImplementationOnce(() =>
      Promise.resolve({ allowed: false, remaining: 0, resetAt: 0, limit: 30 }),
    );

    const result = await grantPlatformRoleResult(
      actorId,
      targetId.toHexString(),
      { role: PLATFORM_ROLES.ADMIN },
      adminCaps(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('rate_limited');
  });

  test('grants a valid role', async () => {
    mockFindById.mockImplementation(() =>
      Promise.resolve({
        _id: targetId,
        platformRoles: [],
      }),
    );
    mockAddPlatformRole.mockImplementation(() => Promise.resolve(true));
    mockFindById.mockImplementationOnce(() =>
      Promise.resolve({
        _id: targetId,
        platformRoles: [],
      }),
    );
    mockFindById.mockImplementationOnce(() =>
      Promise.resolve({
        _id: targetId,
        platformRoles: [PLATFORM_ROLES.ADMIN],
      }),
    );

    const result = await grantPlatformRoleResult(
      actorId,
      targetId.toHexString(),
      { role: PLATFORM_ROLES.ADMIN },
      adminCaps(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.roles).toContain(PLATFORM_ROLES.ADMIN);
    }
  });

  test('rejects invalid role body', async () => {
    const result = await grantPlatformRoleResult(
      actorId,
      targetId.toHexString(),
      { role: 'superuser' },
      adminCaps(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('validation_failed');
  });
});

describe('revokePlatformRoleResult', () => {
  afterAll(() => {
    mock.restore();
  });

  test('blocks self-removal of admin role', async () => {
    const result = await revokePlatformRoleResult(
      actorId,
      actorId,
      PLATFORM_ROLES.ADMIN,
      adminCaps(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('validation_failed');
  });

  test('blocks removal of the last admin', async () => {
    mockFindById.mockImplementation(() =>
      Promise.resolve({
        _id: targetId,
        platformRoles: [PLATFORM_ROLES.ADMIN],
      }),
    );
    mockCountByPlatformRole.mockImplementation(() => Promise.resolve(1));

    const result = await revokePlatformRoleResult(
      actorId,
      targetId.toHexString(),
      PLATFORM_ROLES.ADMIN,
      adminCaps(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('last_admin');
  });

  test('revokes role from another identity', async () => {
    mockFindById.mockImplementationOnce(() =>
      Promise.resolve({
        _id: targetId,
        platformRoles: [PLATFORM_ROLES.ADMIN, PLATFORM_ROLES.MODERATOR],
      }),
    );
    mockCountByPlatformRole.mockImplementation(() => Promise.resolve(2));
    mockRemovePlatformRole.mockImplementation(() => Promise.resolve(true));
    mockFindById.mockImplementationOnce(() =>
      Promise.resolve({
        _id: targetId,
        platformRoles: [PLATFORM_ROLES.MODERATOR],
      }),
    );

    const result = await revokePlatformRoleResult(
      actorId,
      targetId.toHexString(),
      PLATFORM_ROLES.ADMIN,
      adminCaps(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.roles).toEqual([PLATFORM_ROLES.MODERATOR]);
    }
  });
});
