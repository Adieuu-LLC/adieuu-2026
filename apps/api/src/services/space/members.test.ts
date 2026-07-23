/**
 * Unit tests for the Space membership service (mocked repositories + billing).
 *
 * @module services/space/members.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const mockHasPaidAccess = mock((_ctx: any) => false) as AnyMock;

const spaceRepo = {
  findById: mock(async (_id: ObjectId) => null as any) as AnyMock,
  incrementMemberCount: mock(async (_id: ObjectId, _d?: number) => undefined) as AnyMock,
};

const memberRepo = {
  findMember: mock(async (_s: ObjectId, _i: ObjectId) => null as any) as AnyMock,
  createMember: mock(async (input: any) => ({
    ...input,
    _id: new ObjectId(),
    status: 'active',
    joinedAt: new Date(),
  })) as AnyMock,
  removeMember: mock(async (_s: ObjectId, _i: ObjectId) => true) as AnyMock,
  banMember: mock(async (_s: ObjectId, _i: ObjectId, fields: any) => ({
    _id: new ObjectId(),
    spaceId: _s,
    identityId: _i,
    roleIds: [],
    status: 'banned',
    joinedAt: new Date(),
    banReason: fields.banReason,
    bannedAt: fields.bannedAt,
    banExpiresAt: fields.banExpiresAt,
  })) as AnyMock,
  clearBanAndActivate: mock(async (_s: ObjectId, _i: ObjectId, roleIds: ObjectId[]) => ({
    _id: new ObjectId(),
    spaceId: _s,
    identityId: _i,
    roleIds,
    status: 'active',
    joinedAt: new Date(),
  })) as AnyMock,
  listBySpace: mock(async (_s: ObjectId, _l?: number, _c?: ObjectId) => [] as any[]) as AnyMock,
  countWithRole: mock(async (_s: ObjectId, _r: ObjectId) => 0) as AnyMock,
  updateProfile: mock(async (_s: ObjectId, _i: ObjectId, patch: any) => ({
    _id: new ObjectId(),
    spaceId: _s,
    identityId: _i,
    roleIds: [],
    status: 'active',
    joinedAt: new Date(),
    ...(patch.nickname ? { nickname: patch.nickname } : {}),
    ...(patch.color ? { color: patch.color } : {}),
  })) as AnyMock,
};

const roleRepo = {
  findDefaultMember: mock(async (_s: ObjectId) => null as any) as AnyMock,
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
  findBySystemKey: mock(async (_s: ObjectId, _k: string) => null as any) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../billing/resolve-access', () => ({ hasPaidAccess: mockHasPaidAccess }));
mock.module('../../repositories/space.repository', () => ({ getSpaceRepository: () => spaceRepo }));
mock.module('../../repositories/space-member.repository', () => ({ getSpaceMemberRepository: () => memberRepo }));
mock.module('../../repositories/space-role.repository', () => ({ getSpaceRoleRepository: () => roleRepo }));

const publishSpaceEvent = mock(async () => {}) as AnyMock;
mock.module('./redis-events', () => ({
  publishSpaceEvent,
  publishSpaceEventToIdentity: mock(async () => {}),
}));

import {
  joinSpace,
  leaveSpace,
  removeSpaceMember,
  banSpaceMember,
  updateSpaceMemberProfile,
  listSpaceMembers,
  listSpaceRoles,
  resolveEffectiveTier,
} from './members';

const OWNER = new ObjectId();
const DEFAULT_ROLE = new ObjectId();

function makeSpaceDoc(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    _id: new ObjectId(),
    slug: 'a-space',
    name: 'A Space',
    visibility: 'public',
    e2ee: false,
    encryptIdentity: false,
    cipherRequired: false,
    createdBy: OWNER,
    ownerIdentityId: OWNER,
    allowFreeMembers: false,
    memberCount: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/** Makes an active membership doc for the acting identity holding given permissions. */
function stubActingPermissions(spaceId: ObjectId, identityId: ObjectId, permissions: string[]) {
  const roleId = new ObjectId();
  memberRepo.findMember.mockResolvedValue({
    _id: new ObjectId(), spaceId, identityId, roleIds: [roleId], status: 'active',
  });
  roleRepo.findBySpace.mockResolvedValue([{ _id: roleId, spaceId, permissions }]);
}

describe('space/members', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    mockHasPaidAccess.mockReset();
    mockHasPaidAccess.mockReturnValue(false);
    for (const repo of [spaceRepo, memberRepo, roleRepo]) {
      for (const fn of Object.values(repo)) (fn as AnyMock).mockClear();
    }
    spaceRepo.findById.mockResolvedValue(null);
    spaceRepo.incrementMemberCount.mockResolvedValue(undefined);
    memberRepo.findMember.mockResolvedValue(null);
    memberRepo.removeMember.mockResolvedValue(true);
    memberRepo.banMember.mockClear();
    memberRepo.clearBanAndActivate.mockClear();
    memberRepo.listBySpace.mockResolvedValue([]);
    memberRepo.countWithRole.mockResolvedValue(0);
    memberRepo.updateProfile.mockClear();
    memberRepo.updateProfile.mockImplementation(async (_s: ObjectId, _i: ObjectId, patch: any) => ({
      _id: new ObjectId(),
      spaceId: _s,
      identityId: _i,
      roleIds: [],
      status: 'active',
      joinedAt: new Date(),
      ...(patch.nickname ? { nickname: patch.nickname } : {}),
      ...(patch.color ? { color: patch.color } : {}),
    }));
    roleRepo.findDefaultMember.mockResolvedValue({ _id: DEFAULT_ROLE });
    roleRepo.findBySpace.mockResolvedValue([]);
    roleRepo.findBySystemKey.mockResolvedValue(null);
    publishSpaceEvent.mockClear();
  });

  describe('resolveEffectiveTier', () => {
    test('free with no paid access stays free', () => {
      expect(resolveEffectiveTier({ subscriptions: ['free'] })).toBe('free');
    });
    test('access subscription resolves to access', () => {
      expect(resolveEffectiveTier({ subscriptions: ['free', 'access'] })).toBe('access');
    });
    test('insider outranks all', () => {
      expect(resolveEffectiveTier({ subscriptions: ['access', 'insider'] })).toBe('insider');
    });
    test('lifetime/gifted paid access bumps free to access', () => {
      mockHasPaidAccess.mockReturnValue(true);
      expect(resolveEffectiveTier({ subscriptions: ['free'], isLifetime: true })).toBe('access');
    });
  });

  describe('joinSpace', () => {
    test('rejects an invalid id', async () => {
      const r = await joinSpace('nope', new ObjectId(), { subscriptions: ['access'] });
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_ID' });
    });

    test('returns SPACE_NOT_FOUND for a missing space', async () => {
      spaceRepo.findById.mockResolvedValue(null);
      const r = await joinSpace(new ObjectId(), new ObjectId(), { subscriptions: ['access'] });
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_NOT_FOUND' });
    });

    test('is idempotent when already a member', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const identity = new ObjectId();
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(), spaceId: space._id, identityId: identity, roleIds: [DEFAULT_ROLE], status: 'active', joinedAt: new Date(),
      });
      const r = await joinSpace(space._id, identity, { subscriptions: ['free'] });
      expect(r.success).toBe(true);
      expect(memberRepo.createMember).not.toHaveBeenCalled();
      expect(spaceRepo.incrementMemberCount).not.toHaveBeenCalled();
      // No fan-out when membership already existed.
      expect(publishSpaceEvent).not.toHaveBeenCalled();
    });

    test('rejects an active ban', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const identity = new ObjectId();
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(),
        spaceId: space._id,
        identityId: identity,
        roleIds: [],
        status: 'banned',
        joinedAt: new Date(),
        banReason: 'spam',
        bannedAt: new Date(),
        banExpiresAt: null,
      });
      const r = await joinSpace(space._id, identity, { subscriptions: ['access'] });
      expect(r).toMatchObject({ success: false, errorCode: 'MEMBER_BANNED' });
      expect(memberRepo.createMember).not.toHaveBeenCalled();
    });

    test('allows rejoin after a ban expires', async () => {
      const space = makeSpaceDoc({ allowFreeMembers: true });
      spaceRepo.findById.mockResolvedValue(space);
      const identity = new ObjectId();
      const expired = new Date(Date.now() - 60_000);
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(),
        spaceId: space._id,
        identityId: identity,
        roleIds: [],
        status: 'banned',
        joinedAt: new Date(),
        banReason: 'temp',
        bannedAt: new Date(Date.now() - 120_000),
        banExpiresAt: expired,
      });
      const r = await joinSpace(space._id, identity, { subscriptions: ['free'] });
      expect(r.success).toBe(true);
      expect(memberRepo.clearBanAndActivate).toHaveBeenCalled();
      expect(spaceRepo.incrementMemberCount).toHaveBeenCalledWith(space._id, 1);
    });

    test('blocks free-tier open-join of a public space', async () => {
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ visibility: 'public', allowFreeMembers: false }));
      const r = await joinSpace(new ObjectId(), new ObjectId(), { subscriptions: ['free'] });
      expect(r).toMatchObject({ success: false, errorCode: 'TIER_REQUIRED' });
      expect(memberRepo.createMember).not.toHaveBeenCalled();
    });

    test('allows free-tier join when allowFreeMembers is set', async () => {
      const space = makeSpaceDoc({ visibility: 'public', allowFreeMembers: true });
      spaceRepo.findById.mockResolvedValue(space);
      const r = await joinSpace(space._id, new ObjectId(), { subscriptions: ['free'] });
      expect(r.success).toBe(true);
      expect(memberRepo.createMember).toHaveBeenCalledTimes(1);
      const [input] = memberRepo.createMember.mock.calls[0]!;
      expect(input.roleIds).toEqual([DEFAULT_ROLE]);
      expect(spaceRepo.incrementMemberCount).toHaveBeenCalledWith(space._id, 1);
      // Fans a member-joined event out on the Space channel.
      expect(publishSpaceEvent).toHaveBeenCalledTimes(1);
      const [joinSpaceId, event] = publishSpaceEvent.mock.calls[0]!;
      expect(joinSpaceId).toBe(space._id.toHexString());
      expect(event.type).toBe('space_member_joined');
    });

    test('allows paid open-join of a listed space', async () => {
      const space = makeSpaceDoc({ visibility: 'listed' });
      spaceRepo.findById.mockResolvedValue(space);
      mockHasPaidAccess.mockReturnValue(true);
      const r = await joinSpace(space._id, new ObjectId(), { subscriptions: ['access'] });
      expect(r.success).toBe(true);
    });

    test('blocks open-join of a hidden space (invite required)', async () => {
      const space = makeSpaceDoc({ visibility: 'hidden' });
      spaceRepo.findById.mockResolvedValue(space);
      mockHasPaidAccess.mockReturnValue(true);
      const r = await joinSpace(space._id, new ObjectId(), { subscriptions: ['insider'] });
      expect(r).toMatchObject({ success: false, errorCode: 'INVITE_REQUIRED' });
    });

    test('resolves a duplicate-key race to the existing membership', async () => {
      const space = makeSpaceDoc({ visibility: 'public', allowFreeMembers: true });
      spaceRepo.findById.mockResolvedValue(space);
      const identity = new ObjectId();
      const existing = {
        _id: new ObjectId(), spaceId: space._id, identityId: identity, roleIds: [DEFAULT_ROLE], status: 'active', joinedAt: new Date(),
      };
      // Ban check + existing check: not a member. After the duplicate-key throw: the winner.
      memberRepo.findMember
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existing);
      memberRepo.createMember.mockRejectedValueOnce({ code: 11000 });

      const r = await joinSpace(space._id, identity, { subscriptions: ['free'] });
      expect(r.success).toBe(true);
      expect(r.member?.id).toBe(existing._id.toHexString());
      expect(spaceRepo.incrementMemberCount).not.toHaveBeenCalled();
    });
  });

  describe('leaveSpace', () => {
    test('blocks the owner from leaving', async () => {
      const space = makeSpaceDoc({ ownerIdentityId: OWNER });
      spaceRepo.findById.mockResolvedValue(space);
      const r = await leaveSpace(space._id, OWNER);
      expect(r).toMatchObject({ success: false, errorCode: 'OWNER_CANNOT_LEAVE' });
      expect(memberRepo.removeMember).not.toHaveBeenCalled();
    });

    test('returns NOT_MEMBER when not a member', async () => {
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc());
      memberRepo.removeMember.mockResolvedValue(false);
      const r = await leaveSpace(new ObjectId(), new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_MEMBER' });
    });

    test('removes a member and decrements the count', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.removeMember.mockResolvedValue(true);
      const leaver = new ObjectId();
      const r = await leaveSpace(space._id, leaver);
      expect(r.success).toBe(true);
      expect(spaceRepo.incrementMemberCount).toHaveBeenCalledWith(space._id, -1);
      // Fans a member-left event out on the Space channel.
      expect(publishSpaceEvent).toHaveBeenCalledTimes(1);
      const [leaveSpaceId, event] = publishSpaceEvent.mock.calls[0]!;
      expect(leaveSpaceId).toBe(space._id.toHexString());
      expect(event.type).toBe('space_member_left');
      expect(event.data).toMatchObject({ identityId: leaver.toHexString(), reason: 'left' });
    });

    test('blocks the last Admin from leaving', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const leaver = new ObjectId();
      const adminRoleId = new ObjectId();
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(),
        spaceId: space._id,
        identityId: leaver,
        roleIds: [adminRoleId],
        status: 'active',
      });
      roleRepo.findBySystemKey.mockResolvedValue({
        _id: adminRoleId,
        spaceId: space._id,
        systemKey: 'admin',
      });
      memberRepo.countWithRole.mockResolvedValue(1);

      const r = await leaveSpace(space._id, leaver);
      expect(r).toMatchObject({ success: false, errorCode: 'LAST_ADMIN' });
      expect(memberRepo.removeMember).not.toHaveBeenCalled();
    });
  });

  describe('removeSpaceMember', () => {
    test('rejects a non-member actor', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.findMember.mockResolvedValue(null);
      const r = await removeSpaceMember(space._id, new ObjectId(), new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_MEMBER' });
    });

    test('rejects an actor without kickMembers', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      stubActingPermissions(space._id, acting, ['viewChannels', 'sendMessages']);
      const r = await removeSpaceMember(space._id, acting, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    });

    test('cannot remove the owner', async () => {
      const space = makeSpaceDoc({ ownerIdentityId: OWNER });
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      stubActingPermissions(space._id, acting, ['kickMembers']);
      const r = await removeSpaceMember(space._id, acting, OWNER);
      expect(r).toMatchObject({ success: false, errorCode: 'CANNOT_REMOVE_OWNER' });
    });

    test('returns MEMBER_NOT_FOUND when the target is not a member', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      stubActingPermissions(space._id, acting, ['kickMembers']);
      memberRepo.removeMember.mockResolvedValue(false);
      const r = await removeSpaceMember(space._id, acting, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'MEMBER_NOT_FOUND' });
    });

    test('removes the target and decrements the count', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      stubActingPermissions(space._id, acting, ['kickMembers']);
      memberRepo.removeMember.mockResolvedValue(true);
      const target = new ObjectId();
      const r = await removeSpaceMember(space._id, acting, target);
      expect(r.success).toBe(true);
      expect(spaceRepo.incrementMemberCount).toHaveBeenCalledWith(space._id, -1);
      expect(publishSpaceEvent).toHaveBeenCalledTimes(1);
      expect(publishSpaceEvent.mock.calls[0]![1]).toMatchObject({
        type: 'space_member_left',
        data: { identityId: target.toHexString(), reason: 'kicked' },
      });
    });

    test('cannot kick the last Admin', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      const target = new ObjectId();
      const actorRoleId = new ObjectId();
      const adminRoleId = new ObjectId();
      memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) => {
        if (id.equals(acting)) {
          return {
            _id: new ObjectId(),
            spaceId: space._id,
            identityId: acting,
            roleIds: [actorRoleId],
            status: 'active',
          };
        }
        if (id.equals(target)) {
          return {
            _id: new ObjectId(),
            spaceId: space._id,
            identityId: target,
            roleIds: [adminRoleId],
            status: 'active',
          };
        }
        return null;
      });
      roleRepo.findBySpace.mockResolvedValue([
        { _id: actorRoleId, spaceId: space._id, permissions: ['kickMembers'] },
      ]);
      roleRepo.findBySystemKey.mockResolvedValue({
        _id: adminRoleId,
        spaceId: space._id,
        systemKey: 'admin',
      });
      memberRepo.countWithRole.mockResolvedValue(1);

      const r = await removeSpaceMember(space._id, acting, target);
      expect(r).toMatchObject({ success: false, errorCode: 'LAST_ADMIN' });
      expect(memberRepo.removeMember).not.toHaveBeenCalled();
    });
  });

  describe('banSpaceMember', () => {
    test('rejects an actor without banMembers', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      stubActingPermissions(space._id, acting, ['kickMembers']);
      const r = await banSpaceMember(space._id, acting, new ObjectId(), {
        reason: 'spam',
        duration: '1d',
      });
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    });

    test('cannot ban the owner', async () => {
      const space = makeSpaceDoc({ ownerIdentityId: OWNER });
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      stubActingPermissions(space._id, acting, ['banMembers']);
      const r = await banSpaceMember(space._id, acting, OWNER, {
        reason: 'spam',
        duration: 'permanent',
      });
      expect(r).toMatchObject({ success: false, errorCode: 'CANNOT_REMOVE_OWNER' });
    });

    test('bans the target and emits space_member_left with reason banned', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      stubActingPermissions(space._id, acting, ['banMembers']);
      const target = new ObjectId();
      const r = await banSpaceMember(space._id, acting, target, {
        reason: 'harassment',
        duration: '7d',
      });
      expect(r.success).toBe(true);
      expect(memberRepo.banMember).toHaveBeenCalled();
      expect(spaceRepo.incrementMemberCount).toHaveBeenCalledWith(space._id, -1);
      expect(publishSpaceEvent.mock.calls[0]![1]).toMatchObject({
        type: 'space_member_left',
        data: { identityId: target.toHexString(), reason: 'banned' },
      });
    });
  });

  describe('updateSpaceMemberProfile', () => {
    test('rejects when actor is not a member', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.findMember.mockResolvedValue(null);
      const r = await updateSpaceMemberProfile(space._id, new ObjectId(), new ObjectId(), {
        nickname: 'Nick',
      });
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_MEMBER' });
    });

    test('allows self nickname change with changeNickname', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const self = new ObjectId();
      const roleId = new ObjectId();
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(),
        spaceId: space._id,
        identityId: self,
        roleIds: [roleId],
        status: 'active',
        joinedAt: new Date(),
      });
      roleRepo.findBySpace.mockResolvedValue([
        { _id: roleId, spaceId: space._id, permissions: ['changeNickname'], position: 1000 },
      ]);
      memberRepo.updateProfile.mockResolvedValue({
        _id: new ObjectId(),
        spaceId: space._id,
        identityId: self,
        roleIds: [roleId],
        status: 'active',
        joinedAt: new Date(),
        nickname: 'Nick',
      });

      const r = await updateSpaceMemberProfile(space._id, self, self, { nickname: 'Nick' });
      expect(r.success).toBe(true);
      expect(r.member?.nickname).toBe('Nick');
      expect(publishSpaceEvent).toHaveBeenCalledTimes(1);
      expect(publishSpaceEvent.mock.calls[0]![1].type).toBe('space_member_updated');
    });

    test('rejects self change without changeNickname', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const self = new ObjectId();
      const roleId = new ObjectId();
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(),
        spaceId: space._id,
        identityId: self,
        roleIds: [roleId],
        status: 'active',
      });
      roleRepo.findBySpace.mockResolvedValue([
        { _id: roleId, spaceId: space._id, permissions: ['viewChannels'], position: 1000 },
      ]);
      const r = await updateSpaceMemberProfile(space._id, self, self, { nickname: 'Nick' });
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    });

    test('allows managing others with manageNicknames', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      const target = new ObjectId();
      const actorRole = new ObjectId();
      const targetRole = new ObjectId();
      memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) => {
        if (id.equals(acting)) {
          return {
            _id: new ObjectId(),
            spaceId: space._id,
            identityId: acting,
            roleIds: [actorRole],
            status: 'active',
          };
        }
        if (id.equals(target)) {
          return {
            _id: new ObjectId(),
            spaceId: space._id,
            identityId: target,
            roleIds: [targetRole],
            status: 'active',
          };
        }
        return null;
      });
      roleRepo.findBySpace.mockResolvedValue([
        { _id: actorRole, spaceId: space._id, permissions: ['manageNicknames'], position: 0 },
        { _id: targetRole, spaceId: space._id, permissions: ['changeNickname'], position: 1000 },
      ]);
      memberRepo.updateProfile.mockResolvedValue({
        _id: new ObjectId(),
        spaceId: space._id,
        identityId: target,
        roleIds: [targetRole],
        status: 'active',
        joinedAt: new Date(),
        color: '#e57373',
      });

      const r = await updateSpaceMemberProfile(space._id, acting, target, { color: '#e57373' });
      expect(r.success).toBe(true);
      expect(r.member?.color).toBe('#e57373');
    });

    test('rejects managing a higher-ranked member', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      const target = new ObjectId();
      const actorRole = new ObjectId();
      const targetRole = new ObjectId();
      memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) => {
        if (id.equals(acting)) {
          return {
            _id: new ObjectId(),
            spaceId: space._id,
            identityId: acting,
            roleIds: [actorRole],
            status: 'active',
          };
        }
        if (id.equals(target)) {
          return {
            _id: new ObjectId(),
            spaceId: space._id,
            identityId: target,
            roleIds: [targetRole],
            status: 'active',
          };
        }
        return null;
      });
      roleRepo.findBySpace.mockResolvedValue([
        { _id: actorRole, spaceId: space._id, permissions: ['manageNicknames'], position: 500 },
        { _id: targetRole, spaceId: space._id, permissions: ['changeNickname'], position: 0 },
      ]);

      const r = await updateSpaceMemberProfile(space._id, acting, target, { nickname: 'Nope' });
      expect(r).toMatchObject({ success: false, errorCode: 'ESCALATION' });
      expect(memberRepo.updateProfile).not.toHaveBeenCalled();
    });

    test('rejects managing others without manageNicknames', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      const target = new ObjectId();
      const roleId = new ObjectId();
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(),
        spaceId: space._id,
        identityId: acting,
        roleIds: [roleId],
        status: 'active',
      });
      roleRepo.findBySpace.mockResolvedValue([
        { _id: roleId, spaceId: space._id, permissions: ['changeNickname'], position: 1000 },
      ]);
      const r = await updateSpaceMemberProfile(space._id, acting, target, { nickname: 'Nope' });
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    });
  });

  describe('listSpaceMembers', () => {
    test('lets anyone list a public space', async () => {
      const space = makeSpaceDoc({ visibility: 'public' });
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.listBySpace.mockResolvedValue([
        { _id: new ObjectId(), spaceId: space._id, identityId: new ObjectId(), roleIds: [], status: 'active', joinedAt: new Date() },
      ]);
      const r = await listSpaceMembers(space._id, new ObjectId());
      expect(r.success).toBe(true);
      expect(r.members).toHaveLength(1);
      // Non-member read must not require a membership lookup for public spaces.
      expect(memberRepo.findMember).not.toHaveBeenCalled();
    });

    test('lets non-members browse members of a listed non-E2EE space', async () => {
      const space = makeSpaceDoc({ visibility: 'listed' });
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.listBySpace.mockResolvedValue([
        { _id: new ObjectId(), spaceId: space._id, identityId: new ObjectId(), roleIds: [], status: 'active', joinedAt: new Date() },
      ]);
      const r = await listSpaceMembers(space._id, new ObjectId());
      expect(r.success).toBe(true);
      expect(r.members).toHaveLength(1);
    });

    test('requires membership for a listed E2EE space', async () => {
      const space = makeSpaceDoc({
        visibility: 'listed',
        e2ee: true,
        cipherCheck: { knownValue: 'k', encryptedKnownValue: 'e', nonce: 'n' },
      });
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.findMember.mockResolvedValue(null);
      const r = await listSpaceMembers(space._id, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_MEMBER' });
    });

    test('hides a hidden space from non-members', async () => {
      const space = makeSpaceDoc({ visibility: 'hidden' });
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.findMember.mockResolvedValue(null);
      const r = await listSpaceMembers(space._id, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_NOT_FOUND' });
    });

    test('paginates with a cursor', async () => {
      const space = makeSpaceDoc({ visibility: 'public' });
      spaceRepo.findById.mockResolvedValue(space);
      const docs = Array.from({ length: 3 }, () => ({
        _id: new ObjectId(), spaceId: space._id, identityId: new ObjectId(), roleIds: [], status: 'active', joinedAt: new Date(),
      }));
      memberRepo.listBySpace.mockResolvedValue(docs); // limit+1 = 3 returned for limit 2
      const r = await listSpaceMembers(space._id, new ObjectId(), 2);
      expect(r.members).toHaveLength(2);
      expect(r.cursor).toBe(docs[1]!._id.toHexString());
    });
  });

  describe('listSpaceRoles', () => {
    test('returns roles for a member of a hidden space', async () => {
      const space = makeSpaceDoc({ visibility: 'hidden' });
      spaceRepo.findById.mockResolvedValue(space);
      const requester = new ObjectId();
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(), spaceId: space._id, identityId: requester, roleIds: [], status: 'active',
      });
      roleRepo.findBySpace.mockResolvedValue([
        { _id: new ObjectId(), spaceId: space._id, name: 'Admin', permissions: ['kickMembers'], systemKey: 'admin' as const, isDefaultMember: false, isSystem: true, createdAt: new Date(), updatedAt: new Date() },
      ]);
      const r = await listSpaceRoles(space._id, requester);
      expect(r.success).toBe(true);
      expect(r.roles).toHaveLength(1);
      expect(r.roles![0]!.name).toBe('Admin');
    });

    test('hides roles of a hidden space from non-members', async () => {
      const space = makeSpaceDoc({ visibility: 'hidden' });
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.findMember.mockResolvedValue(null);
      const r = await listSpaceRoles(space._id, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_NOT_FOUND' });
    });
  });
});
