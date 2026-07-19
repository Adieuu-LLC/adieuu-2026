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
  listBySpace: mock(async (_s: ObjectId, _l?: number, _c?: ObjectId) => [] as any[]) as AnyMock,
};

const roleRepo = {
  findDefaultMember: mock(async (_s: ObjectId) => null as any) as AnyMock,
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
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
    memberRepo.listBySpace.mockResolvedValue([]);
    roleRepo.findDefaultMember.mockResolvedValue({ _id: DEFAULT_ROLE });
    roleRepo.findBySpace.mockResolvedValue([]);
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
      // First lookup: not a member. After the duplicate-key throw: the winner.
      memberRepo.findMember.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
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
      expect(event.data).toMatchObject({ identityId: leaver.toHexString() });
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

    test('rejects an actor without manageMembers', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      stubActingPermissions(space._id, acting, ['read', 'post']);
      const r = await removeSpaceMember(space._id, acting, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    });

    test('cannot remove the owner', async () => {
      const space = makeSpaceDoc({ ownerIdentityId: OWNER });
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      stubActingPermissions(space._id, acting, ['manageMembers']);
      const r = await removeSpaceMember(space._id, acting, OWNER);
      expect(r).toMatchObject({ success: false, errorCode: 'CANNOT_REMOVE_OWNER' });
    });

    test('returns MEMBER_NOT_FOUND when the target is not a member', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      stubActingPermissions(space._id, acting, ['admin']);
      memberRepo.removeMember.mockResolvedValue(false);
      const r = await removeSpaceMember(space._id, acting, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'MEMBER_NOT_FOUND' });
    });

    test('removes the target and decrements the count', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const acting = new ObjectId();
      stubActingPermissions(space._id, acting, ['admin']);
      memberRepo.removeMember.mockResolvedValue(true);
      const target = new ObjectId();
      const r = await removeSpaceMember(space._id, acting, target);
      expect(r.success).toBe(true);
      expect(spaceRepo.incrementMemberCount).toHaveBeenCalledWith(space._id, -1);
      expect(publishSpaceEvent).toHaveBeenCalledTimes(1);
      expect(publishSpaceEvent.mock.calls[0]![1]).toMatchObject({
        type: 'space_member_left',
        data: { identityId: target.toHexString() },
      });
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
        { _id: new ObjectId(), spaceId: space._id, name: 'Admin', permissions: ['admin'], isDefaultMember: false, isSystem: true, createdAt: new Date(), updatedAt: new Date() },
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
