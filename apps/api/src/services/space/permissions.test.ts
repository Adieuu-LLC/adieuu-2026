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

  test('unions permissions across a member role', async () => {
    memberRepo.findMember.mockResolvedValue({
      _id: new ObjectId(), spaceId: SPACE, identityId: IDENTITY, roleIds: [MEMBER_ROLE], status: 'active',
    });
    roleRepo.findBySpace.mockResolvedValue([
      { _id: MEMBER_ROLE, spaceId: SPACE, permissions: ['read', 'post'] },
    ]);

    const perms = await resolveMemberPermissions(SPACE, IDENTITY);
    expect(perms.isMember).toBe(true);
    expect(perms.isAdmin).toBe(false);
    expect(perms.permissions.has('read')).toBe(true);
    expect(perms.permissions.has('post')).toBe(true);
    expect(perms.permissions.has('manageMembers')).toBe(false);
  });

  test('detects the admin super-permission', async () => {
    memberRepo.findMember.mockResolvedValue({
      _id: new ObjectId(), spaceId: SPACE, identityId: IDENTITY, roleIds: [ADMIN_ROLE], status: 'active',
    });
    roleRepo.findBySpace.mockResolvedValue([
      { _id: ADMIN_ROLE, spaceId: SPACE, permissions: ['admin', 'read', 'post'] },
    ]);

    const perms = await resolveMemberPermissions(SPACE, IDENTITY);
    expect(perms.isAdmin).toBe(true);
  });

  test('unions permissions across multiple roles and ignores unknown role ids', async () => {
    const unknownRole = new ObjectId();
    memberRepo.findMember.mockResolvedValue({
      _id: new ObjectId(), spaceId: SPACE, identityId: IDENTITY,
      roleIds: [MEMBER_ROLE, unknownRole], status: 'active',
    });
    roleRepo.findBySpace.mockResolvedValue([
      { _id: MEMBER_ROLE, spaceId: SPACE, permissions: ['read', 'post', 'invite'] },
    ]);

    const perms = await resolveMemberPermissions(SPACE, IDENTITY);
    expect(perms.permissions.has('invite')).toBe(true);
    expect(perms.permissions.size).toBe(3);
  });

  describe('memberHasPermission', () => {
    test('admin implies every permission', () => {
      const perms = { isMember: true, isAdmin: true, permissions: new Set<never>(), roleIds: [] };
      expect(memberHasPermission(perms, 'manageChannels')).toBe(true);
      expect(memberHasPermission(perms, 'post')).toBe(true);
    });

    test('non-admin only holds explicit permissions', () => {
      const perms = {
        isMember: true, isAdmin: false,
        permissions: new Set(['read', 'post'] as const), roleIds: [],
      };
      expect(memberHasPermission(perms, 'post')).toBe(true);
      expect(memberHasPermission(perms, 'manageMembers')).toBe(false);
    });
  });
});
