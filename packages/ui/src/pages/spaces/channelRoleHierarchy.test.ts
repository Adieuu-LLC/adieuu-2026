import { describe, expect, test } from 'bun:test';
import type { PublicSpaceRole } from '@adieuu/shared';
import {
  actorTopRolePosition,
  findEveryoneRole,
  roleIdsForAclPicker,
  rolesAtOrBelowHierarchy,
} from './channelRoleHierarchy';

function role(
  id: string,
  position: number,
  extras: Partial<PublicSpaceRole> = {},
): PublicSpaceRole {
  return {
    id,
    spaceId: 's1',
    name: id,
    permissions: [],
    color: '#000000',
    displaySeparately: false,
    mentionable: false,
    position,
    isDefaultMember: false,
    isSystem: false,
    createdAt: '',
    updatedAt: '',
    ...extras,
  };
}

describe('channelRoleHierarchy', () => {
  const admin = role('admin', 0, { systemKey: 'admin', isSystem: true });
  const mod = role('mod', 100);
  const everyone = role('everyone', 1000, {
    systemKey: 'member',
    isDefaultMember: true,
    isSystem: true,
  });
  const roles = [admin, mod, everyone];

  test('actorTopRolePosition is the lowest held position', () => {
    expect(actorTopRolePosition(['mod', 'everyone'], roles)).toBe(100);
    expect(actorTopRolePosition(['admin'], roles)).toBe(0);
  });

  test('rolesAtOrBelowHierarchy includes own role and lower, excluding Everyone', () => {
    expect(rolesAtOrBelowHierarchy(roles, 100).map((r) => r.id)).toEqual(['mod']);
  });

  test('findEveryoneRole prefers system member', () => {
    expect(findEveryoneRole(roles)?.id).toBe('everyone');
  });

  test('roleIdsForAclPicker treats Everyone allowlist as unrestricted', () => {
    expect(roleIdsForAclPicker(['everyone'], roles)).toEqual([]);
    expect(roleIdsForAclPicker(['everyone', 'mod'], roles)).toEqual([]);
    expect(roleIdsForAclPicker(['mod'], roles)).toEqual(['mod']);
  });
});
