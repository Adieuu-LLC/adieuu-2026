/**
 * Unit tests for channel visibility helpers, focused on the realtime audience
 * resolution used to keep restricted-channel events off other members' sockets.
 *
 * @module services/space/channel-access.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const roleRepo = {
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
};

const memberRepo = {
  findMember: mock(async (_s: ObjectId, _i: ObjectId) => null as any) as AnyMock,
  listByAnyRole: mock(async (_s: ObjectId, _r: ObjectId[]) => [] as any[]) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../repositories/space-role.repository', () => ({
  getSpaceRoleRepository: () => roleRepo,
}));
mock.module('../../repositories/space-member.repository', () => ({
  getSpaceMemberRepository: () => memberRepo,
}));

import { resolveChannelAudience } from './channel-access';

const SPACE = new ObjectId();
const ADMIN_ROLE = new ObjectId();
const MOD_ROLE = new ObjectId();
const EVERYONE_ROLE = new ObjectId();

function seedRoles() {
  roleRepo.findBySpace.mockResolvedValue([
    {
      _id: ADMIN_ROLE,
      spaceId: SPACE,
      permissions: [],
      position: 0,
      isDefaultMember: false,
      isSystem: true,
      systemKey: 'admin',
    },
    {
      _id: MOD_ROLE,
      spaceId: SPACE,
      permissions: ['viewChannels', 'sendMessages'],
      position: 100,
      isDefaultMember: false,
      isSystem: false,
    },
    {
      _id: EVERYONE_ROLE,
      spaceId: SPACE,
      permissions: ['viewChannels', 'sendMessages'],
      position: 1000,
      isDefaultMember: true,
      isSystem: true,
      systemKey: 'everyone',
    },
  ]);
}

describe('resolveChannelAudience', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    roleRepo.findBySpace.mockClear();
    memberRepo.listByAnyRole.mockClear();
    memberRepo.listByAnyRole.mockResolvedValue([]);
    seedRoles();
  });

  test('returns null (space-wide broadcast) for a legacy channel without an ACL', async () => {
    const audience = await resolveChannelAudience(SPACE, { allowedRoleIds: [] });
    expect(audience).toBeNull();
    expect(memberRepo.listByAnyRole).not.toHaveBeenCalled();
  });

  test('returns null when the ACL includes the Everyone role', async () => {
    const audience = await resolveChannelAudience(SPACE, {
      allowedRoleIds: [MOD_ROLE, EVERYONE_ROLE],
    });
    expect(audience).toBeNull();
  });

  test('resolves restricted-channel audiences from the allowed roles', async () => {
    const modMember = new ObjectId();
    memberRepo.listByAnyRole.mockResolvedValue([
      { _id: new ObjectId(), spaceId: SPACE, identityId: modMember, roleIds: [MOD_ROLE], status: 'active' },
    ]);

    const audience = await resolveChannelAudience(SPACE, { allowedRoleIds: [MOD_ROLE] });
    expect(audience).toEqual([modMember.toHexString()]);
  });

  test('always includes Admin/manageChannels roles in the queried role set', async () => {
    await resolveChannelAudience(SPACE, { allowedRoleIds: [MOD_ROLE] });
    const [, queriedRoleIds] = memberRepo.listByAnyRole.mock.calls[0]!;
    const hexIds = (queriedRoleIds as ObjectId[]).map((id) => id.toHexString());
    expect(hexIds).toContain(MOD_ROLE.toHexString());
    expect(hexIds).toContain(ADMIN_ROLE.toHexString());
    expect(hexIds).not.toContain(EVERYONE_ROLE.toHexString());
  });

  test('returns an empty audience (deliver to nobody) when no member holds the roles', async () => {
    memberRepo.listByAnyRole.mockResolvedValue([]);
    const audience = await resolveChannelAudience(SPACE, { allowedRoleIds: [MOD_ROLE] });
    expect(audience).toEqual([]);
  });
});
