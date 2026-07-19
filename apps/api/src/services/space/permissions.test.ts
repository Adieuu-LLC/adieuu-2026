/**
 * Unit tests for the Space permission resolver (mocked repositories).
 *
 * @module services/space/permissions.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const memberRepo = {
  findMember: mock(async (_s: ObjectId, _i: ObjectId) => null as any) as AnyMock,
};
const roleRepo = {
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../repositories/space-member.repository', () => ({
  getSpaceMemberRepository: () => memberRepo,
}));
mock.module('../../repositories/space-role.repository', () => ({
  getSpaceRoleRepository: () => roleRepo,
}));

import { resolveMemberPermissions, memberHasPermission } from './permissions';

const SPACE = new ObjectId();
const IDENTITY = new ObjectId();
const ADMIN_ROLE = new ObjectId();
const MEMBER_ROLE = new ObjectId();

describe('space/permissions', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    memberRepo.findMember.mockReset();
    roleRepo.findBySpace.mockReset();
    memberRepo.findMember.mockResolvedValue(null);
    roleRepo.findBySpace.mockResolvedValue([]);
  });

  test('returns non-member result when no membership exists', async () => {
    const perms = await resolveMemberPermissions(SPACE, IDENTITY);
    expect(perms.isMember).toBe(false);
    expect(perms.isAdmin).toBe(false);
    expect(perms.permissions.size).toBe(0);
    expect(roleRepo.findBySpace).not.toHaveBeenCalled();
  });

  test('treats a non-active member as a non-member', async () => {
    memberRepo.findMember.mockResolvedValue({
      _id: new ObjectId(), spaceId: SPACE, identityId: IDENTITY, roleIds: [MEMBER_ROLE], status: 'banned',
    });
    const perms = await resolveMemberPermissions(SPACE, IDENTITY);
    expect(perms.isMember).toBe(false);
  });

  test('unions and normalizes permissions across a member role', async () => {
    memberRepo.findMember.mockResolvedValue({
      _id: new ObjectId(), spaceId: SPACE, identityId: IDENTITY, roleIds: [MEMBER_ROLE], status: 'active',
    });
    roleRepo.findBySpace.mockResolvedValue([
      { _id: MEMBER_ROLE, spaceId: SPACE, permissions: ['read', 'post'], systemKey: 'member' },
    ]);

    const perms = await resolveMemberPermissions(SPACE, IDENTITY);
    expect(perms.isMember).toBe(true);
    expect(perms.isAdmin).toBe(false);
    expect(perms.permissions.has('viewChannels')).toBe(true);
    expect(perms.permissions.has('sendMessages')).toBe(true);
    expect(perms.permissions.has('kickMembers')).toBe(false);
  });

  test('isAdmin is true when the member holds the system Admin role', async () => {
    memberRepo.findMember.mockResolvedValue({
      _id: new ObjectId(), spaceId: SPACE, identityId: IDENTITY, roleIds: [ADMIN_ROLE], status: 'active',
    });
    roleRepo.findBySpace.mockResolvedValue([
      {
        _id: ADMIN_ROLE,
        spaceId: SPACE,
        permissions: ['viewChannels', 'sendMessages'],
        systemKey: 'admin',
      },
    ]);

    const perms = await resolveMemberPermissions(SPACE, IDENTITY);
    expect(perms.isAdmin).toBe(true);
    // No god-flag: isAdmin does not imply missing permissions.
    expect(memberHasPermission(perms, 'manageRoles')).toBe(false);
  });

  test('unions permissions across multiple roles and ignores unknown role ids', async () => {
    const unknownRole = new ObjectId();
    memberRepo.findMember.mockResolvedValue({
      _id: new ObjectId(), spaceId: SPACE, identityId: IDENTITY,
      roleIds: [MEMBER_ROLE, unknownRole], status: 'active',
    });
    roleRepo.findBySpace.mockResolvedValue([
      { _id: MEMBER_ROLE, spaceId: SPACE, permissions: ['viewChannels', 'sendMessages', 'createInvite'] },
    ]);

    const perms = await resolveMemberPermissions(SPACE, IDENTITY);
    expect(perms.permissions.has('createInvite')).toBe(true);
    expect(perms.permissions.size).toBe(3);
  });

  describe('memberHasPermission', () => {
    test('only holds explicit permissions (no admin bypass)', () => {
      const perms = {
        isMember: true,
        isAdmin: true,
        permissions: new Set(['sendMessages'] as const),
        roleIds: [],
      };
      expect(memberHasPermission(perms, 'sendMessages')).toBe(true);
      expect(memberHasPermission(perms, 'manageRoles')).toBe(false);
    });

    test('non-admin only holds explicit permissions', () => {
      const perms = {
        isMember: true,
        isAdmin: false,
        permissions: new Set(['viewChannels', 'sendMessages'] as const),
        roleIds: [],
      };
      expect(memberHasPermission(perms, 'sendMessages')).toBe(true);
      expect(memberHasPermission(perms, 'kickMembers')).toBe(false);
    });
  });
});
