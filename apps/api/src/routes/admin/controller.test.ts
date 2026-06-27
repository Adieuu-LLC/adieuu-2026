import { afterAll, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
} from '../../constants/platform-permissions';
import type { PlatformCapabilities } from '../../services/platform-capabilities.service';
import type { IdentitySessionData } from '../../services/session.service';

const mockGetPlatformCapabilities = mock(() => Promise.resolve({} as PlatformCapabilities));

mock.module('../../services/platform-capabilities.service', () => ({
  getPlatformCapabilities: mockGetPlatformCapabilities,
}));

import {
  gatePlatformAdminSession,
  gatePlatformPermissionSession,
} from './controller';

const sessionUser: IdentitySessionData = {
  type: 'identity',
  identityId: new ObjectId().toHexString(),
  maxVideoDurationSeconds: 300,
  subscriptions: [],
  entitlements: [],
  isLifetime: false,
  lastActivityAt: Date.now(),
  expiresAt: Date.now() + 86_400_000,
};

function makeCaps(permissions: string[]): PlatformCapabilities {
  return {
    isPlatformAdmin: permissions.includes(PLATFORM_PERMISSIONS.MANAGE_ROLES),
    isPlatformModerator: permissions.includes(PLATFORM_PERMISSIONS.READ_CONTENT_REPORTS),
    isPlatformSupportAgent: permissions.includes(PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS),
    roles: permissions.includes(PLATFORM_PERMISSIONS.MANAGE_ROLES)
      ? [PLATFORM_ROLES.ADMIN]
      : [],
    permissions: permissions as PlatformCapabilities['permissions'],
  };
}

describe('gatePlatformPermissionSession', () => {
  afterAll(() => {
    mock.restore();
  });

  test('returns unauthorized without session', async () => {
    const gate = await gatePlatformPermissionSession(null, PLATFORM_PERMISSIONS.MANAGE_USERS);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe('unauthorized');
  });

  test('returns forbidden when permission is missing', async () => {
    mockGetPlatformCapabilities.mockImplementation(() =>
      Promise.resolve(makeCaps([PLATFORM_PERMISSIONS.MANAGE_USERS])),
    );

    const gate = await gatePlatformPermissionSession(
      sessionUser,
      PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS,
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe('forbidden');
  });

  test('returns ok when permission is present', async () => {
    mockGetPlatformCapabilities.mockImplementation(() =>
      Promise.resolve(makeCaps([PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS])),
    );

    const gate = await gatePlatformPermissionSession(
      sessionUser,
      PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS,
    );
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.session).toBe(sessionUser);
      expect(gate.caps.permissions).toContain(PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
    }
  });
});

describe('gatePlatformAdminSession', () => {
  afterAll(() => {
    mock.restore();
  });

  test('requires manage platform settings permission', async () => {
    mockGetPlatformCapabilities.mockImplementation(() =>
      Promise.resolve(makeCaps([PLATFORM_PERMISSIONS.MANAGE_USERS])),
    );

    const gate = await gatePlatformAdminSession(sessionUser);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe('forbidden');
  });
});
