import { afterAll, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
} from '../constants/platform-permissions';

const mockFindById = mock((_id?: unknown) => Promise.resolve(null as unknown));

mock.module('../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findById: mockFindById,
  }),
}));

import { getPlatformCapabilities } from './platform-capabilities.service';

describe('getPlatformCapabilities', () => {
  afterAll(() => {
    mock.restore();
  });

  test('returns empty capabilities when identity is missing', async () => {
    mockFindById.mockImplementation(() => Promise.resolve(null));
    const caps = await getPlatformCapabilities(new ObjectId());
    expect(caps).toEqual({
      isPlatformAdmin: false,
      isPlatformModerator: false,
      isPlatformSupportAgent: false,
      roles: [],
      permissions: [],
    });
  });

  test('admin role grants all flags and permissions', async () => {
    mockFindById.mockImplementation(() =>
      Promise.resolve({
        _id: new ObjectId(),
        platformRoles: [PLATFORM_ROLES.ADMIN],
      }),
    );

    const caps = await getPlatformCapabilities(new ObjectId());
    expect(caps.isPlatformAdmin).toBe(true);
    expect(caps.isPlatformModerator).toBe(true);
    expect(caps.isPlatformSupportAgent).toBe(true);
    expect(caps.permissions).toContain(PLATFORM_PERMISSIONS.MANAGE_ROLES);
    expect(caps.permissions).toContain(PLATFORM_PERMISSIONS.MANAGE_ESCALATED_REPORTS);
  });

  test('moderator role grants moderator and support flags only', async () => {
    mockFindById.mockImplementation(() =>
      Promise.resolve({
        _id: new ObjectId(),
        platformRoles: [PLATFORM_ROLES.MODERATOR],
      }),
    );

    const caps = await getPlatformCapabilities(new ObjectId());
    expect(caps.isPlatformAdmin).toBe(false);
    expect(caps.isPlatformModerator).toBe(true);
    expect(caps.isPlatformSupportAgent).toBe(true);
    expect(caps.permissions).toContain(PLATFORM_PERMISSIONS.READ_CONTENT_REPORTS);
    expect(caps.permissions).not.toContain(PLATFORM_PERMISSIONS.MANAGE_ROLES);
  });

  test('support_agent role grants support permissions only', async () => {
    mockFindById.mockImplementation(() =>
      Promise.resolve({
        _id: new ObjectId(),
        platformRoles: [PLATFORM_ROLES.SUPPORT_AGENT],
      }),
    );

    const caps = await getPlatformCapabilities(new ObjectId());
    expect(caps.isPlatformAdmin).toBe(false);
    expect(caps.isPlatformModerator).toBe(false);
    expect(caps.isPlatformSupportAgent).toBe(true);
    expect(caps.permissions).toEqual([
      PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS,
      PLATFORM_PERMISSIONS.UPDATE_SUPPORT_TICKETS,
    ]);
  });

  test('direct attributes grant permissions without roles', async () => {
    mockFindById.mockImplementation(() =>
      Promise.resolve({
        _id: new ObjectId(),
        platformAttributes: [PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS],
      }),
    );

    const caps = await getPlatformCapabilities(new ObjectId());
    expect(caps.roles).toEqual([]);
    expect(caps.permissions).toEqual([PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS]);
  });
});
