import { describe, expect, test } from 'bun:test';
import type { PublicIdentity, PublicSpaceMember, PublicSpaceRole } from '@adieuu/shared';
import {
  getMemberRoleBadges,
  groupSpaceMembersByRole,
  resolveSpaceMemberColor,
  spaceMembersToSettingsMap,
} from './groupSpaceMembersByRole';

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

function member(
  identityId: string,
  roleIds: string[],
  extras: Partial<PublicSpaceMember> = {},
): PublicSpaceMember {
  return {
    id: `m-${identityId}`,
    spaceId: 's1',
    identityId,
    roleIds,
    status: 'active',
    joinedAt: '',
    ...extras,
  };
}

function profile(id: string, displayName: string): PublicIdentity {
  return {
    id,
    displayName,
    username: id,
    lastActiveAt: '',
    isDeleted: false,
  };
}

const profiles: Record<string, PublicIdentity> = {
  alice: profile('alice', 'Alice'),
  bob: profile('bob', 'Bob'),
  carol: profile('carol', 'Carol'),
  dave: profile('dave', 'Dave'),
};

describe('groupSpaceMembersByRole', () => {
  const admin = role('admin', 0, {
    systemKey: 'admin',
    isSystem: true,
    displaySeparately: true,
    color: '#e74c3c',
    name: 'Admin',
  });
  const mod = role('mod', 100, {
    displaySeparately: true,
    color: '#2ecc71',
    name: 'Mod',
  });
  const everyone = role('everyone', 1000, {
    systemKey: 'member',
    isDefaultMember: true,
    isSystem: true,
    name: 'Members',
    color: '#99aab5',
  });
  const roles = [admin, mod, everyone];

  test('groups under highest hoisted role, leftovers under Members', () => {
    const members = [
      member('alice', ['admin', 'everyone']),
      member('bob', ['mod', 'everyone']),
      member('carol', ['everyone']),
      member('dave', ['mod', 'admin', 'everyone']),
    ];

    const groups = groupSpaceMembersByRole(members, roles, profiles);
    expect(groups.map((g) => g.title)).toEqual(['Admin', 'Mod', 'Members']);
    expect(groups[0]!.members.map((m) => m.identityId).sort()).toEqual(['alice', 'dave']);
    expect(groups[1]!.members.map((m) => m.identityId)).toEqual(['bob']);
    expect(groups[2]!.members.map((m) => m.identityId)).toEqual(['carol']);
  });

  test('omits empty hoisted groups', () => {
    const members = [member('carol', ['everyone'])];
    const groups = groupSpaceMembersByRole(members, roles, profiles);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.roleId).toBeNull();
    expect(groups[0]!.title).toBe('Members');
  });

  test('sorts within a group by display name / nickname', () => {
    const members = [
      member('bob', ['everyone']),
      member('alice', ['everyone'], { nickname: 'Zed' }),
      member('carol', ['everyone']),
    ];
    const groups = groupSpaceMembersByRole(members, roles, profiles);
    expect(groups[0]!.members.map((m) => m.identityId)).toEqual(['bob', 'carol', 'alice']);
  });
});

describe('resolveSpaceMemberColor', () => {
  const admin = role('admin', 0, { color: '#e74c3c' });
  const mod = role('mod', 100, { color: '#2ecc71' });
  const everyone = role('everyone', 1000, { color: '#99aab5', isDefaultMember: true });

  test('prefers custom member colour', () => {
    expect(
      resolveSpaceMemberColor(member('a', ['admin'], { color: '#e57373' }), [admin, everyone]),
    ).toBe('#e57373');
  });

  test('falls back to highest held role colour', () => {
    expect(
      resolveSpaceMemberColor(member('a', ['mod', 'everyone']), [admin, mod, everyone]),
    ).toBe('#2ecc71');
  });
});

describe('spaceMembersToSettingsMap', () => {
  test('includes nickname and resolved colour', () => {
    const admin = role('admin', 0, { color: '#e74c3c' });
    const map = spaceMembersToSettingsMap(
      [member('alice', ['admin'], { nickname: 'Ali' })],
      [admin],
    );
    expect(map.alice).toEqual({ nickname: 'Ali', color: '#e74c3c' });
  });
});

describe('getMemberRoleBadges', () => {
  const admin = role('admin', 0, { name: 'Admin' });
  const mod = role('mod', 100, { name: 'Mod' });
  const helper = role('helper', 200, { name: 'Helper' });
  const vip = role('vip', 300, { name: 'VIP' });
  const everyone = role('everyone', 1000, { name: 'Members', isDefaultMember: true });
  const roles = [admin, mod, helper, vip, everyone];
  const resolveName = (r: PublicSpaceRole) => r.name;

  test('shows all roles when 3 or fewer', () => {
    const { visible, overflow } = getMemberRoleBadges(
      member('a', ['mod', 'helper', 'everyone']),
      roles,
      resolveName,
    );
    expect(visible.map((b) => b.name)).toEqual(['Mod', 'Helper', 'Members']);
    expect(overflow).toHaveLength(0);
  });

  test('shows first two plus overflow when more than 3', () => {
    const { visible, overflow } = getMemberRoleBadges(
      member('a', ['admin', 'mod', 'helper', 'vip']),
      roles,
      resolveName,
    );
    expect(visible.map((b) => b.name)).toEqual(['Admin', 'Mod']);
    expect(overflow.map((b) => b.name)).toEqual(['Helper', 'VIP']);
  });
});
