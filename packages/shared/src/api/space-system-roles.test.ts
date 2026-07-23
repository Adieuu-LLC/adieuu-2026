/**
 * Unit tests for seeded Space system-role recognition (incl. legacy docs).
 *
 * @module api/space-system-roles.test
 */

import { describe, expect, test } from 'bun:test';
import {
  isSpaceAdminRole,
  isSpaceEveryoneRole,
  resolveSpaceRoleSystemKey,
} from './space-system-roles';

describe('space-system-roles', () => {
  test('prefers persisted systemKey and maps legacy member → everyone', () => {
    expect(resolveSpaceRoleSystemKey({ systemKey: 'admin', isSystem: true })).toBe('admin');
    expect(resolveSpaceRoleSystemKey({ systemKey: 'everyone', isSystem: true })).toBe('everyone');
    expect(resolveSpaceRoleSystemKey({ systemKey: 'member', isSystem: true })).toBe('everyone');
    expect(isSpaceAdminRole({ systemKey: 'admin' })).toBe(true);
    expect(isSpaceEveryoneRole({ systemKey: 'everyone' })).toBe(true);
    expect(isSpaceEveryoneRole({ systemKey: 'member' })).toBe(true);
  });

  test('recognizes legacy isSystem Admin by name or legacy permission', () => {
    expect(
      resolveSpaceRoleSystemKey({
        isSystem: true,
        name: 'Admin',
        permissions: ['manageRoles'],
      }),
    ).toBe('admin');
    expect(
      resolveSpaceRoleSystemKey({
        isSystem: true,
        name: '',
        permissions: ['admin', 'read', 'post'],
      }),
    ).toBe('admin');
    expect(isSpaceAdminRole({ isSystem: true, name: 'Admin' })).toBe(true);
  });

  test('recognizes legacy isSystem Member/Everyone as everyone', () => {
    expect(
      resolveSpaceRoleSystemKey({
        isSystem: true,
        name: 'Member',
        isDefaultMember: true,
      }),
    ).toBe('everyone');
    expect(
      resolveSpaceRoleSystemKey({
        isSystem: true,
        name: 'Everyone',
      }),
    ).toBe('everyone');
    expect(
      resolveSpaceRoleSystemKey({
        isSystem: true,
        name: '',
        isDefaultMember: true,
      }),
    ).toBe('everyone');
  });

  test('does not treat custom roles as system', () => {
    expect(
      resolveSpaceRoleSystemKey({
        isSystem: false,
        name: 'Admin',
        permissions: ['admin'],
      }),
    ).toBeUndefined();
    expect(
      isSpaceEveryoneRole({
        isSystem: false,
        isDefaultMember: true,
        name: 'Cool Dude',
      }),
    ).toBe(false);
  });
});
