import { describe, expect, test } from 'bun:test';
import {
  SPACE_PERMISSIONS,
  SPACE_PERMISSION_DEFS,
  applySpacePermissionToggle,
  getSpacePermissionToggleValue,
  normalizeSpacePermissions,
  spacePermissionToggleOptions,
  spacePermissionsSubsetOf,
  canAccessSpaceManageUi,
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_MEMBER_PERMISSIONS,
} from './space-permissions';

describe('space-permissions catalog', () => {
  test('every stored flag appears exactly once in SPACE_PERMISSION_DEFS', () => {
    const seen = new Set<string>();
    for (const def of SPACE_PERMISSION_DEFS) {
      expect(seen.has(def.permission)).toBe(false);
      seen.add(def.permission);
      if (def.managePermission) {
        expect(seen.has(def.managePermission)).toBe(false);
        seen.add(def.managePermission);
      }
      if (def.toggle === 'yesNoManage') {
        expect(def.managePermission).toBeDefined();
      }
    }
    expect([...seen].sort()).toEqual([...SPACE_PERMISSIONS].sort());
  });

  test('DEFAULT_ADMIN_PERMISSIONS is the full catalog', () => {
    expect(DEFAULT_ADMIN_PERMISSIONS).toEqual([...SPACE_PERMISSIONS]);
  });

  test('DEFAULT_MEMBER_PERMISSIONS is a subset of the catalog', () => {
    expect(spacePermissionsSubsetOf(DEFAULT_MEMBER_PERMISSIONS, SPACE_PERMISSIONS)).toBe(true);
  });
});

describe('normalizeSpacePermissions', () => {
  test('maps legacy flags', () => {
    expect(normalizeSpacePermissions(['read', 'post', 'invite'])).toEqual([
      'viewChannels',
      'createInvite',
      'sendMessages',
    ]);
  });

  test('expands legacy admin to full catalog', () => {
    expect(normalizeSpacePermissions(['admin'])).toEqual([...SPACE_PERMISSIONS]);
  });

  test('drops unknown strings and de-dupes', () => {
    expect(normalizeSpacePermissions(['viewChannels', 'viewChannels', 'nope'])).toEqual([
      'viewChannels',
    ]);
  });
});

describe('permission toggles', () => {
  const sendDef = SPACE_PERMISSION_DEFS.find((d) => d.id === 'sendMessages')!;
  const rolesDef = SPACE_PERMISSION_DEFS.find((d) => d.id === 'manageRoles')!;
  const viewDef = SPACE_PERMISSION_DEFS.find((d) => d.id === 'viewChannels')!;

  test('3-way options and apply/get round-trip', () => {
    expect(spacePermissionToggleOptions('yesNoManage')).toEqual(['no', 'yes', 'manage']);
    let perms = applySpacePermissionToggle([], sendDef, 'yes');
    expect(getSpacePermissionToggleValue(sendDef, perms)).toBe('yes');
    perms = applySpacePermissionToggle(perms, sendDef, 'manage');
    expect(perms).toContain('sendMessages');
    expect(perms).toContain('manageMessages');
    expect(getSpacePermissionToggleValue(sendDef, perms)).toBe('manage');
    perms = applySpacePermissionToggle(perms, sendDef, 'no');
    expect(getSpacePermissionToggleValue(sendDef, perms)).toBe('no');
  });

  test('noManage toggle', () => {
    expect(spacePermissionToggleOptions('noManage')).toEqual(['no', 'manage']);
    const perms = applySpacePermissionToggle([], rolesDef, 'manage');
    expect(getSpacePermissionToggleValue(rolesDef, perms)).toBe('manage');
  });

  test('yesNo toggle', () => {
    expect(spacePermissionToggleOptions('yesNo')).toEqual(['no', 'yes']);
    const perms = applySpacePermissionToggle([], viewDef, 'yes');
    expect(getSpacePermissionToggleValue(viewDef, perms)).toBe('yes');
  });
});

describe('canAccessSpaceManageUi', () => {
  test('true when any manage-UI permission is present', () => {
    expect(canAccessSpaceManageUi(['manageRoles'])).toBe(true);
    expect(canAccessSpaceManageUi(['sendMessages'])).toBe(false);
  });
});
