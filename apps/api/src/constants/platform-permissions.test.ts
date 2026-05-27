import { describe, expect, test } from 'bun:test';
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
  derivePlatformRoleFlags,
  normalizePlatformRoles,
  resolvePermissions,
} from './platform-permissions';

describe('resolvePermissions', () => {
  test('support_agent receives support ticket permissions only', () => {
    const perms = resolvePermissions([PLATFORM_ROLES.SUPPORT_AGENT]);
    expect(perms).toEqual([
      PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS,
      PLATFORM_PERMISSIONS.UPDATE_SUPPORT_TICKETS,
    ]);
  });

  test('moderator receives report and support permissions', () => {
    const perms = resolvePermissions([PLATFORM_ROLES.MODERATOR]);
    expect(perms).toContain(PLATFORM_PERMISSIONS.READ_CONTENT_REPORTS);
    expect(perms).toContain(PLATFORM_PERMISSIONS.UPDATE_ABUSE_REPORTS);
    expect(perms).toContain(PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS);
    expect(perms).not.toContain(PLATFORM_PERMISSIONS.MANAGE_ESCALATED_REPORTS);
    expect(perms).not.toContain(PLATFORM_PERMISSIONS.MANAGE_USERS);
  });

  test('admin receives all platform permissions', () => {
    const perms = resolvePermissions([PLATFORM_ROLES.ADMIN]);
    expect(perms).toContain(PLATFORM_PERMISSIONS.MANAGE_ESCALATED_REPORTS);
    expect(perms).toContain(PLATFORM_PERMISSIONS.MANAGE_ESCALATED_TICKETS);
    expect(perms).toContain(PLATFORM_PERMISSIONS.VIEW_ADMIN_METRICS);
    expect(perms).toContain(PLATFORM_PERMISSIONS.MANAGE_PLATFORM_SETTINGS);
    expect(perms).toContain(PLATFORM_PERMISSIONS.MANAGE_ROLES);
    expect(perms).toContain(PLATFORM_PERMISSIONS.MANAGE_USERS);
    expect(perms).toContain(PLATFORM_PERMISSIONS.MANAGE_IDENTITIES);
  });

  test('unknown roles produce no permissions', () => {
    expect(resolvePermissions(['superuser' as typeof PLATFORM_ROLES.ADMIN])).toEqual([]);
  });

  test('direct attributes are included only when valid permission strings', () => {
    const perms = resolvePermissions([], [
      PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS,
      'not-a-permission',
    ]);
    expect(perms).toEqual([PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS]);
  });

  test('roles combine additively without duplicates', () => {
    const perms = resolvePermissions([
      PLATFORM_ROLES.ADMIN,
      PLATFORM_ROLES.SUPPORT_AGENT,
    ]);
    expect(new Set(perms).size).toBe(perms.length);
    expect(perms).toContain(PLATFORM_PERMISSIONS.MANAGE_ROLES);
    expect(perms).toContain(PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS);
  });

  test('duplicate direct attributes do not duplicate permissions', () => {
    const perms = resolvePermissions([], [
      PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS,
      PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS,
    ]);
    expect(perms).toEqual([PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS]);
  });
});

describe('normalizePlatformRoles', () => {
  test('filters unknown roles and deduplicates', () => {
    expect(
      normalizePlatformRoles(['admin', 'admin', 'invalid', 'moderator']),
    ).toEqual(['admin', 'moderator']);
  });
});

describe('derivePlatformRoleFlags', () => {
  test('admin implies moderator and support agent flags', () => {
    expect(derivePlatformRoleFlags(['admin'])).toEqual({
      isPlatformAdmin: true,
      isPlatformModerator: true,
      isPlatformSupportAgent: true,
    });
  });

  test('moderator implies support agent but not admin', () => {
    expect(derivePlatformRoleFlags(['moderator'])).toEqual({
      isPlatformAdmin: false,
      isPlatformModerator: true,
      isPlatformSupportAgent: true,
    });
  });

  test('support agent is not moderator or admin', () => {
    expect(derivePlatformRoleFlags(['support_agent'])).toEqual({
      isPlatformAdmin: false,
      isPlatformModerator: false,
      isPlatformSupportAgent: true,
    });
  });
});
