/**
 * Unit tests for the Space invites service (mocked repositories + billing).
 *
 * @module services/space/invites.test
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
    ...input, _id: new ObjectId(), status: 'active', joinedAt: new Date(),
  })) as AnyMock,
};

const roleRepo = {
  findDefaultMember: mock(async (_s: ObjectId) => null as any) as AnyMock,
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
};

const inviteRepo = {
  createInvite: mock(async (input: any) => ({
    ...input, _id: new ObjectId(), status: 'pending', createdAt: new Date(), updatedAt: new Date(),
  })) as AnyMock,
  findById: mock(async (_id: ObjectId) => null as any) as AnyMock,
  findPendingForSpace: mock(async (_s: ObjectId, _i: ObjectId) => null as any) as AnyMock,
  findPendingForIdentity: mock(async (_i: ObjectId, _l?: number, _c?: ObjectId) => [] as any[]) as AnyMock,
  findAllPendingForSpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
  updateStatus: mock(async (id: ObjectId, status: string) => ({
    _id: id, spaceId: new ObjectId(), invitedIdentityId: new ObjectId(),
    invitedByIdentityId: new ObjectId(), status, memberCount: 1, createdAt: new Date(),
  })) as AnyMock,
};

const identityRepo = {
  findByIdentityId: mock(async (_id: ObjectId) => ({ _id: new ObjectId() }) as any) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../billing/resolve-access', () => ({ hasPaidAccess: mockHasPaidAccess }));
mock.module('../../repositories/space.repository', () => ({ getSpaceRepository: () => spaceRepo }));
mock.module('../../repositories/space-member.repository', () => ({ getSpaceMemberRepository: () => memberRepo }));
mock.module('../../repositories/space-role.repository', () => ({ getSpaceRoleRepository: () => roleRepo }));
mock.module('../../repositories/space-invite.repository', () => ({ getSpaceInviteRepository: () => inviteRepo }));
mock.module('../../repositories/identity.repository', () => ({ getIdentityRepository: () => identityRepo }));

import {
  createSpaceInvite,
  acceptSpaceInvite,
  declineSpaceInvite,
  revokeSpaceInvite,
  listSpaceInvitesForIdentity,
  listPendingInvitesForSpace,
} from './invites';

const OWNER = new ObjectId();
const DEFAULT_ROLE = new ObjectId();

function makeSpaceDoc(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    _id: new ObjectId(), slug: 'a-space', name: 'A Space', visibility: 'listed',
    createdBy: OWNER, ownerIdentityId: OWNER, allowFreeMembers: false, memberCount: 5,
    createdAt: now, updatedAt: now, ...overrides,
  };
}

function makeInviteDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new ObjectId(), spaceId: new ObjectId(), invitedIdentityId: new ObjectId(),
    invitedByIdentityId: OWNER, status: 'pending', memberCount: 5, createdAt: new Date(),
    ...overrides,
  };
}

/** Configures the actor as a member holding `permissions`; others are non-members. */
function grantPermissions(spaceId: ObjectId, actorId: ObjectId, permissions: string[]) {
  const roleId = new ObjectId();
  memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) =>
    id.equals(actorId)
      ? { _id: new ObjectId(), spaceId, identityId: actorId, roleIds: [roleId], status: 'active', joinedAt: new Date() }
      : null,
  );
  roleRepo.findBySpace.mockResolvedValue([{ _id: roleId, spaceId, permissions }]);
}

describe('space/invites', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    mockHasPaidAccess.mockReset();
    mockHasPaidAccess.mockReturnValue(false);
    for (const repo of [spaceRepo, memberRepo, roleRepo, inviteRepo, identityRepo]) {
      for (const fn of Object.values(repo)) (fn as AnyMock).mockClear();
    }
    spaceRepo.findById.mockResolvedValue(null);
    spaceRepo.incrementMemberCount.mockResolvedValue(undefined);
    memberRepo.findMember.mockResolvedValue(null);
    roleRepo.findDefaultMember.mockResolvedValue({ _id: DEFAULT_ROLE });
    roleRepo.findBySpace.mockResolvedValue([]);
    inviteRepo.findById.mockResolvedValue(null);
    inviteRepo.findPendingForSpace.mockResolvedValue(null);
    inviteRepo.findPendingForIdentity.mockResolvedValue([]);
    inviteRepo.findAllPendingForSpace.mockResolvedValue([]);
    identityRepo.findByIdentityId.mockResolvedValue({ _id: new ObjectId() });
  });

  describe('createSpaceInvite', () => {
    test('rejects self-invites', async () => {
      const id = new ObjectId();
      const r = await createSpaceInvite(new ObjectId(), id, id);
      expect(r).toMatchObject({ success: false, errorCode: 'CANNOT_INVITE_SELF' });
    });

    test('returns SPACE_NOT_FOUND for a missing space', async () => {
      const r = await createSpaceInvite(new ObjectId(), new ObjectId(), new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_NOT_FOUND' });
    });

    test('rejects a non-member inviter', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.findMember.mockResolvedValue(null);
      const r = await createSpaceInvite(space._id, new ObjectId(), new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_MEMBER' });
    });

    test('rejects an inviter without the invite permission', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const inviter = new ObjectId();
      grantPermissions(space._id, inviter, ['read', 'post']);
      const r = await createSpaceInvite(space._id, inviter, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    });

    test('rejects when the invited identity does not exist', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const inviter = new ObjectId();
      grantPermissions(space._id, inviter, ['invite']);
      identityRepo.findByIdentityId.mockResolvedValue(null);
      const r = await createSpaceInvite(space._id, inviter, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'IDENTITY_NOT_FOUND' });
    });

    test('rejects inviting an existing member', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const inviter = new ObjectId();
      const invited = new ObjectId();
      // Inviter has the perm; the invited already has a membership.
      const roleId = new ObjectId();
      memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) =>
        id.equals(inviter)
          ? { _id: new ObjectId(), spaceId: space._id, identityId: inviter, roleIds: [roleId], status: 'active', joinedAt: new Date() }
          : id.equals(invited)
            ? { _id: new ObjectId(), spaceId: space._id, identityId: invited, roleIds: [], status: 'active', joinedAt: new Date() }
            : null,
      );
      roleRepo.findBySpace.mockResolvedValue([{ _id: roleId, spaceId: space._id, permissions: ['invite'] }]);
      const r = await createSpaceInvite(space._id, inviter, invited);
      expect(r).toMatchObject({ success: false, errorCode: 'ALREADY_MEMBER' });
    });

    test('rejects a duplicate pending invite', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const inviter = new ObjectId();
      grantPermissions(space._id, inviter, ['invite']);
      inviteRepo.findPendingForSpace.mockResolvedValue(makeInviteDoc({ spaceId: space._id }));
      const r = await createSpaceInvite(space._id, inviter, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'INVITE_EXISTS' });
    });

    test('creates a pending invite with space snapshots', async () => {
      const space = makeSpaceDoc({ name: 'Cool Space', slug: 'cool', memberCount: 9 });
      spaceRepo.findById.mockResolvedValue(space);
      const inviter = new ObjectId();
      const invited = new ObjectId();
      grantPermissions(space._id, inviter, ['admin']); // admin implies invite
      const r = await createSpaceInvite(space._id, inviter, invited);
      expect(r.success).toBe(true);
      expect(inviteRepo.createInvite).toHaveBeenCalledTimes(1);
      const [input] = inviteRepo.createInvite.mock.calls[0]!;
      expect(input).toMatchObject({ spaceName: 'Cool Space', spaceSlug: 'cool', memberCount: 9 });
      expect(input.invitedIdentityId.equals(invited)).toBe(true);
    });
  });

  describe('acceptSpaceInvite', () => {
    test('rejects a missing/non-pending invite', async () => {
      inviteRepo.findById.mockResolvedValue(null);
      const r = await acceptSpaceInvite(new ObjectId(), new ObjectId(), { subscriptions: ['free'] });
      expect(r).toMatchObject({ success: false, errorCode: 'INVITE_NOT_FOUND' });
    });

    test('rejects an invite addressed to someone else', async () => {
      inviteRepo.findById.mockResolvedValue(makeInviteDoc({ invitedIdentityId: new ObjectId() }));
      const r = await acceptSpaceInvite(new ObjectId(), new ObjectId(), { subscriptions: ['free'] });
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_AUTHORIZED' });
    });

    test('accepts, joins the space, and marks the invite accepted', async () => {
      const identity = new ObjectId();
      const space = makeSpaceDoc({ visibility: 'hidden' });
      const invite = makeInviteDoc({ spaceId: space._id, invitedIdentityId: identity });
      inviteRepo.findById.mockResolvedValue(invite);
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.findMember.mockResolvedValue(null); // not yet a member

      const r = await acceptSpaceInvite(invite._id, identity, { subscriptions: ['free'] });
      expect(r.success).toBe(true);
      expect(r.invite?.status).toBe('accepted');
      expect(memberRepo.createMember).toHaveBeenCalledTimes(1);
      const [input] = memberRepo.createMember.mock.calls[0]!;
      expect(input.roleIds).toEqual([DEFAULT_ROLE]);
      expect(spaceRepo.incrementMemberCount).toHaveBeenCalledWith(space._id, 1);
      expect(inviteRepo.updateStatus).toHaveBeenCalledWith(invite._id, 'accepted');
    });

    test('is idempotent when already a member (no double increment)', async () => {
      const identity = new ObjectId();
      const space = makeSpaceDoc();
      const invite = makeInviteDoc({ spaceId: space._id, invitedIdentityId: identity });
      inviteRepo.findById.mockResolvedValue(invite);
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(), spaceId: space._id, identityId: identity, roleIds: [DEFAULT_ROLE], status: 'active', joinedAt: new Date(),
      });

      const r = await acceptSpaceInvite(invite._id, identity, { subscriptions: ['free'] });
      expect(r.success).toBe(true);
      expect(memberRepo.createMember).not.toHaveBeenCalled();
      expect(spaceRepo.incrementMemberCount).not.toHaveBeenCalled();
      expect(inviteRepo.updateStatus).toHaveBeenCalledWith(invite._id, 'accepted');
    });
  });

  describe('declineSpaceInvite', () => {
    test('rejects an invite addressed to someone else', async () => {
      inviteRepo.findById.mockResolvedValue(makeInviteDoc({ invitedIdentityId: new ObjectId() }));
      const r = await declineSpaceInvite(new ObjectId(), new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_AUTHORIZED' });
    });

    test('declines a pending invite', async () => {
      const identity = new ObjectId();
      const invite = makeInviteDoc({ invitedIdentityId: identity });
      inviteRepo.findById.mockResolvedValue(invite);
      const r = await declineSpaceInvite(invite._id, identity);
      expect(r.success).toBe(true);
      expect(inviteRepo.updateStatus).toHaveBeenCalledWith(invite._id, 'declined');
    });
  });

  describe('revokeSpaceInvite', () => {
    test('rejects a requester without the invite permission', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const requester = new ObjectId();
      grantPermissions(space._id, requester, ['read', 'post']);
      const r = await revokeSpaceInvite(space._id, new ObjectId(), requester);
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    });

    test('rejects an invite from a different space', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const requester = new ObjectId();
      grantPermissions(space._id, requester, ['invite']);
      inviteRepo.findById.mockResolvedValue(makeInviteDoc({ spaceId: new ObjectId() }));
      const r = await revokeSpaceInvite(space._id, new ObjectId(), requester);
      expect(r).toMatchObject({ success: false, errorCode: 'INVITE_NOT_FOUND' });
    });

    test('rejects a non-pending invite', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const requester = new ObjectId();
      grantPermissions(space._id, requester, ['invite']);
      inviteRepo.findById.mockResolvedValue(makeInviteDoc({ spaceId: space._id, status: 'accepted' }));
      const r = await revokeSpaceInvite(space._id, new ObjectId(), requester);
      expect(r).toMatchObject({ success: false, errorCode: 'INVITE_NOT_PENDING' });
    });

    test('revokes a pending invite', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const requester = new ObjectId();
      grantPermissions(space._id, requester, ['invite']);
      const invite = makeInviteDoc({ spaceId: space._id });
      inviteRepo.findById.mockResolvedValue(invite);
      const r = await revokeSpaceInvite(space._id, invite._id, requester);
      expect(r.success).toBe(true);
      expect(inviteRepo.updateStatus).toHaveBeenCalledWith(invite._id, 'revoked');
    });
  });

  describe('listSpaceInvitesForIdentity', () => {
    test('paginates the inbox', async () => {
      const identity = new ObjectId();
      const docs = Array.from({ length: 3 }, () => makeInviteDoc({ invitedIdentityId: identity }));
      inviteRepo.findPendingForIdentity.mockResolvedValue(docs);
      const r = await listSpaceInvitesForIdentity(identity, 2);
      expect(r.success).toBe(true);
      expect(r.invites).toHaveLength(2);
      expect(r.cursor).toBe(docs[1]!._id.toHexString());
    });

    test('returns a null cursor when there is no next page', async () => {
      inviteRepo.findPendingForIdentity.mockResolvedValue([makeInviteDoc()]);
      const r = await listSpaceInvitesForIdentity(new ObjectId(), 10);
      expect(r.cursor).toBeNull();
    });
  });

  describe('listPendingInvitesForSpace', () => {
    test('requires membership', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.findMember.mockResolvedValue(null);
      const r = await listPendingInvitesForSpace(space._id, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_MEMBER' });
    });

    test('lists pending invites for a member', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const requester = new ObjectId();
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(), spaceId: space._id, identityId: requester, roleIds: [], status: 'active', joinedAt: new Date(),
      });
      inviteRepo.findAllPendingForSpace.mockResolvedValue([makeInviteDoc({ spaceId: space._id })]);
      const r = await listPendingInvitesForSpace(space._id, requester);
      expect(r.success).toBe(true);
      expect(r.invites).toHaveLength(1);
      expect(r.cursor).toBeNull();
    });
  });
});
