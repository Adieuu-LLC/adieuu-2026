/**
 * Unit tests for the Space CRUD service (mocked repositories + billing).
 *
 * @module services/space/crud.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const mockHasPaidAccess = mock((_ctx: any) => true) as AnyMock;

const spaceRepo = {
  findBySlug: mock(async (_slug: string) => null) as AnyMock,
  findById: mock(async (_id: ObjectId) => null) as AnyMock,
  createSpace: mock(async (input: any) => ({
    ...input,
    _id: input._id ?? new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  updateById: mock(async (_id: ObjectId, patch: any) => ({
    ...makeSpaceDoc(),
    ...patch,
  })) as AnyMock,
  findByIds: mock(async (_ids: ObjectId[]) => [] as any[]) as AnyMock,
  discover: mock(async (_opts: any) => [] as any[]) as AnyMock,
  deleteById: mock(async (_id: ObjectId) => true) as AnyMock,
};

const roleRepo = {
  createRole: mock(async (input: any) => ({
    ...input,
    _id: new ObjectId(),
    isDefaultMember: input.isDefaultMember ?? false,
    isSystem: input.isSystem ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  findBySpace: mock(async (_id: ObjectId) => [] as any[]) as AnyMock,
  deleteBySpace: mock(async (_id: ObjectId) => 0) as AnyMock,
};

const memberRepo = {
  createMember: mock(async (input: any) => ({
    ...input,
    _id: new ObjectId(),
    status: 'active',
    joinedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  findMember: mock(async (_s: ObjectId, _i: ObjectId) => null) as AnyMock,
  findForIdentity: mock(async (_i: ObjectId, _l: number, _c?: ObjectId) => [] as any[]) as AnyMock,
  deleteBySpace: mock(async (_id: ObjectId) => 0) as AnyMock,
};

const channelRepo = {
  createChannel: mock(async (input: any) => ({
    ...input,
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  deleteBySpace: mock(async (_id: ObjectId) => 0) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../billing/resolve-access', () => ({ hasPaidAccess: mockHasPaidAccess }));
mock.module('../../repositories/space.repository', () => ({ getSpaceRepository: () => spaceRepo }));
mock.module('../../repositories/space-role.repository', () => ({ getSpaceRoleRepository: () => roleRepo }));
mock.module('../../repositories/space-member.repository', () => ({ getSpaceMemberRepository: () => memberRepo }));
mock.module('../../repositories/space-channel.repository', () => ({ getSpaceChannelRepository: () => channelRepo }));

const publishSpaceEvent = mock(async () => {}) as AnyMock;
const publishSpaceEventToIdentity = mock(async () => {}) as AnyMock;
mock.module('./redis-events', () => ({ publishSpaceEvent, publishSpaceEventToIdentity }));

import {
  createSpace,
  getSpaceBySlug,
  getSpaceById,
  updateSpace,
  listMySpaces,
  discoverSpaces,
  isSlugAvailable,
} from './crud';

const CREATOR = new ObjectId();
const PAID = { subscriptions: ['access'] as const };

function makeSpaceDoc(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    _id: new ObjectId(),
    slug: 'a-space',
    name: 'A Space',
    visibility: 'public',
    createdBy: CREATOR,
    ownerIdentityId: CREATOR,
    allowFreeMembers: false,
    memberCount: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('space/crud', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    mockHasPaidAccess.mockReset();
    mockHasPaidAccess.mockReturnValue(true);
    for (const repo of [spaceRepo, roleRepo, memberRepo, channelRepo]) {
      for (const fn of Object.values(repo)) (fn as AnyMock).mockClear();
    }
    spaceRepo.findBySlug.mockResolvedValue(null);
    spaceRepo.findById.mockResolvedValue(null);
    spaceRepo.findByIds.mockResolvedValue([]);
    spaceRepo.discover.mockResolvedValue([]);
    roleRepo.findBySpace.mockResolvedValue([]);
    memberRepo.findMember.mockResolvedValue(null);
    memberRepo.findForIdentity.mockResolvedValue([]);
    publishSpaceEvent.mockClear();
    publishSpaceEventToIdentity.mockClear();
  });

  /** Makes `resolveMemberPermissions` treat CREATOR as an admin member. */
  function seedAdminMembership(spaceId: ObjectId) {
    const adminRoleId = new ObjectId();
    memberRepo.findMember.mockResolvedValue({
      _id: new ObjectId(),
      spaceId,
      identityId: CREATOR,
      status: 'active',
      roleIds: [adminRoleId],
    });
    roleRepo.findBySpace.mockResolvedValue([
      { _id: adminRoleId, spaceId, name: 'Admin', permissions: ['admin'] },
    ]);
  }

  describe('createSpace', () => {
    test('rejects free-tier users with TIER_REQUIRED', async () => {
      mockHasPaidAccess.mockReturnValue(false);
      const r = await createSpace(CREATOR, {
        slug: 'my-space', name: 'My Space', visibility: 'public',
      }, { subscriptions: ['free'] });
      expect(r).toMatchObject({ success: false, errorCode: 'TIER_REQUIRED' });
      expect(spaceRepo.createSpace).not.toHaveBeenCalled();
    });

    test('rejects reserved slugs', async () => {
      const r = await createSpace(CREATOR, {
        slug: 'admin', name: 'Nope', visibility: 'public',
      }, PAID);
      expect(r).toMatchObject({ success: false, errorCode: 'SLUG_RESERVED' });
    });

    test('rejects public + cipherCheck', async () => {
      const r = await createSpace(CREATOR, {
        slug: 'my-space', name: 'My Space', visibility: 'public',
        cipherCheck: { knownValue: 'x', encryptedKnownValue: 'y', nonce: 'z' },
      }, PAID);
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_ENCRYPTION' });
    });

    test('rejects an already-taken slug', async () => {
      spaceRepo.findBySlug.mockResolvedValue(makeSpaceDoc({ slug: 'taken' }));
      const r = await createSpace(CREATOR, {
        slug: 'taken', name: 'Dup', visibility: 'public',
      }, PAID);
      expect(r).toMatchObject({ success: false, errorCode: 'SLUG_TAKEN' });
      expect(spaceRepo.createSpace).not.toHaveBeenCalled();
    });

    test('maps a duplicate-key insert to SLUG_TAKEN', async () => {
      spaceRepo.createSpace.mockRejectedValueOnce({ code: 11000 });
      const r = await createSpace(CREATOR, {
        slug: 'racey', name: 'Race', visibility: 'public',
      }, PAID);
      expect(r).toMatchObject({ success: false, errorCode: 'SLUG_TAKEN' });
    });

    test('rejects an invalid client-supplied id', async () => {
      const r = await createSpace(CREATOR, {
        slug: 'my-space', name: 'My Space', visibility: 'public', id: 'not-hex',
      }, PAID);
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_ID' });
    });

    test('seeds Admin + Member roles, creator membership, and #general', async () => {
      const r = await createSpace(CREATOR, {
        slug: 'my-space', name: 'My Space', visibility: 'listed',
      }, PAID);

      expect(r.success).toBe(true);
      expect(r.space?.slug).toBe('my-space');

      // Two system roles seeded: Admin (all perms), Member (default).
      expect(roleRepo.createRole).toHaveBeenCalledTimes(2);
      const adminArg = roleRepo.createRole.mock.calls[0]![0];
      const memberArg = roleRepo.createRole.mock.calls[1]![0];
      expect(adminArg.name).toBe('Admin');
      expect(adminArg.permissions).toContain('admin');
      expect(adminArg.isSystem).toBe(true);
      expect(memberArg.name).toBe('Member');
      expect(memberArg.isDefaultMember).toBe(true);
      expect(memberArg.permissions).toEqual(['read', 'post']);

      // Creator added as a member with the Admin role.
      expect(memberRepo.createMember).toHaveBeenCalledTimes(1);
      const memberInput = memberRepo.createMember.mock.calls[0]![0];
      expect(memberInput.identityId).toBe(CREATOR);
      expect(memberInput.roleIds).toHaveLength(1);
      expect(memberInput.roleIds[0]).toBeInstanceOf(ObjectId);

      // Default #general text channel at position 0.
      expect(channelRepo.createChannel).toHaveBeenCalledTimes(1);
      const channelInput = channelRepo.createChannel.mock.calls[0]![0];
      expect(channelInput).toMatchObject({ type: 'text', name: 'general', position: 0 });

      // Creator is notified of their new Space on their identity channel.
      expect(publishSpaceEventToIdentity).toHaveBeenCalledTimes(1);
      const [target, event] = publishSpaceEventToIdentity.mock.calls[0]!;
      expect(target).toBe(CREATOR.toHexString());
      expect(event.type).toBe('space_created');
    });

    test('persists the cipher challenge for E2EE Spaces and binds a client id', async () => {
      const clientId = new ObjectId().toHexString();
      const cipherCheck = { knownValue: 'kv', encryptedKnownValue: 'enc', nonce: 'n' };
      const r = await createSpace(CREATOR, {
        slug: 'secret', name: 'Secret', visibility: 'hidden', id: clientId, cipherCheck,
      }, PAID);

      expect(r.success).toBe(true);
      const createArg = spaceRepo.createSpace.mock.calls[0]![0];
      expect(createArg._id.toHexString()).toBe(clientId);
      expect(createArg.cipherCheck).toEqual(cipherCheck);
    });

    test('rolls back seeded documents when membership seeding fails', async () => {
      memberRepo.createMember.mockRejectedValueOnce(new Error('boom'));
      await expect(
        createSpace(CREATOR, { slug: 'my-space', name: 'My Space', visibility: 'public' }, PAID),
      ).rejects.toThrow('boom');

      expect(channelRepo.deleteBySpace).toHaveBeenCalledTimes(1);
      expect(memberRepo.deleteBySpace).toHaveBeenCalledTimes(1);
      expect(roleRepo.deleteBySpace).toHaveBeenCalledTimes(1);
      expect(spaceRepo.deleteById).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSpaceBySlug', () => {
    test('returns public Spaces to anyone', async () => {
      spaceRepo.findBySlug.mockResolvedValue(makeSpaceDoc({ slug: 'open', visibility: 'public' }));
      const r = await getSpaceBySlug('open');
      expect(r).toMatchObject({ success: true });
      expect(r.space?.slug).toBe('open');
    });

    test('hides hidden Spaces from non-members', async () => {
      spaceRepo.findBySlug.mockResolvedValue(makeSpaceDoc({ visibility: 'hidden' }));
      memberRepo.findMember.mockResolvedValue(null);
      const r = await getSpaceBySlug('secret', CREATOR);
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_NOT_FOUND' });
    });

    test('reveals hidden Spaces to members', async () => {
      spaceRepo.findBySlug.mockResolvedValue(makeSpaceDoc({ slug: 'secret', visibility: 'hidden' }));
      memberRepo.findMember.mockResolvedValue({ _id: new ObjectId() });
      const r = await getSpaceBySlug('secret', CREATOR);
      expect(r).toMatchObject({ success: true });
      expect(r.space?.slug).toBe('secret');
    });

    test('returns SPACE_NOT_FOUND when missing', async () => {
      spaceRepo.findBySlug.mockResolvedValue(null);
      const r = await getSpaceBySlug('ghost');
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_NOT_FOUND' });
    });
  });

  describe('getSpaceById', () => {
    test('rejects an invalid id', async () => {
      const r = await getSpaceById('not-hex');
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_ID' });
    });

    test('returns a public Space to anyone', async () => {
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ visibility: 'public' }));
      const r = await getSpaceById(new ObjectId());
      expect(r).toMatchObject({ success: true });
    });

    test('hides hidden Spaces from non-members', async () => {
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ visibility: 'hidden' }));
      memberRepo.findMember.mockResolvedValue(null);
      const r = await getSpaceById(new ObjectId(), CREATOR);
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_NOT_FOUND' });
    });

    test('returns SPACE_NOT_FOUND when missing', async () => {
      spaceRepo.findById.mockResolvedValue(null);
      const r = await getSpaceById(new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_NOT_FOUND' });
    });
  });

  describe('updateSpace', () => {
    test('rejects a non-member', async () => {
      const spaceId = new ObjectId();
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ _id: spaceId }));
      memberRepo.findMember.mockResolvedValue(null);
      const r = await updateSpace(spaceId, CREATOR, { name: 'New' });
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_MEMBER' });
      expect(spaceRepo.updateById).not.toHaveBeenCalled();
    });

    test('rejects a member without the admin permission', async () => {
      const spaceId = new ObjectId();
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ _id: spaceId }));
      const memberRoleId = new ObjectId();
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(), spaceId, identityId: CREATOR, status: 'active', roleIds: [memberRoleId],
      });
      roleRepo.findBySpace.mockResolvedValue([
        { _id: memberRoleId, spaceId, name: 'Member', permissions: ['read', 'post'] },
      ]);
      const r = await updateSpace(spaceId, CREATOR, { name: 'New' });
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    });

    test('applies the patch for an admin member', async () => {
      const spaceId = new ObjectId();
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ _id: spaceId }));
      seedAdminMembership(spaceId);
      const r = await updateSpace(spaceId, CREATOR, {
        name: 'Renamed', allowFreeMembers: true,
      });
      expect(r.success).toBe(true);
      const [, patch] = spaceRepo.updateById.mock.calls[0]!;
      expect(patch).toEqual({ name: 'Renamed', allowFreeMembers: true });
      // Broadcasts the update to the Space channel.
      expect(publishSpaceEvent).toHaveBeenCalledTimes(1);
      expect(publishSpaceEvent.mock.calls[0]![1].type).toBe('space_updated');
    });

    test('refuses to make an encrypted Space public', async () => {
      const spaceId = new ObjectId();
      spaceRepo.findById.mockResolvedValue(
        makeSpaceDoc({
          _id: spaceId,
          visibility: 'hidden',
          cipherCheck: { knownValue: 'k', encryptedKnownValue: 'e', nonce: 'n' },
        }),
      );
      seedAdminMembership(spaceId);
      const r = await updateSpace(spaceId, CREATOR, { visibility: 'public' });
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_ENCRYPTION' });
      expect(spaceRepo.updateById).not.toHaveBeenCalled();
    });

    test('returns SPACE_NOT_FOUND when missing', async () => {
      spaceRepo.findById.mockResolvedValue(null);
      const r = await updateSpace(new ObjectId(), CREATOR, { name: 'x' });
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_NOT_FOUND' });
    });
  });

  describe('listMySpaces', () => {
    test('preserves membership order and paginates', async () => {
      const spaceA = makeSpaceDoc({ slug: 'a' });
      const spaceB = makeSpaceDoc({ slug: 'b' });
      const memberships = [
        { _id: new ObjectId(), spaceId: spaceA._id },
        { _id: new ObjectId(), spaceId: spaceB._id },
      ];
      memberRepo.findForIdentity.mockResolvedValue(memberships);
      // Returned out of order to prove ordering is by membership, not query result.
      spaceRepo.findByIds.mockResolvedValue([spaceB, spaceA]);

      const r = await listMySpaces(CREATOR, 1);
      // limit=1 -> one item returned, hasMore true -> cursor is first membership id.
      expect(r.spaces).toHaveLength(1);
      expect(r.spaces[0]!.slug).toBe('a');
      expect(r.cursor).toBe(memberships[0]!._id.toHexString());
    });

    test('returns null cursor when no more pages', async () => {
      memberRepo.findForIdentity.mockResolvedValue([]);
      const r = await listMySpaces(CREATOR, 10);
      expect(r).toEqual({ spaces: [], cursor: null });
    });
  });

  describe('discoverSpaces', () => {
    test('paginates with a next cursor', async () => {
      const s1 = makeSpaceDoc({ slug: 's1' });
      const s2 = makeSpaceDoc({ slug: 's2' });
      spaceRepo.discover.mockResolvedValue([s1, s2]);
      const r = await discoverSpaces({ limit: 1 });
      expect(r.spaces).toHaveLength(1);
      expect(r.spaces[0]!.slug).toBe('s1');
      expect(r.cursor).toBe(s1._id.toHexString());
      // Repo asked for limit+1.
      expect(spaceRepo.discover.mock.calls[0]![0].limit).toBe(2);
    });

    test('passes the search term through', async () => {
      spaceRepo.discover.mockResolvedValue([]);
      await discoverSpaces({ q: 'games' });
      expect(spaceRepo.discover.mock.calls[0]![0].q).toBe('games');
    });
  });

  describe('isSlugAvailable', () => {
    test('reserved slug is unavailable', async () => {
      expect(await isSlugAvailable('api')).toBe(false);
      expect(spaceRepo.findBySlug).not.toHaveBeenCalled();
    });

    test('taken slug is unavailable', async () => {
      spaceRepo.findBySlug.mockResolvedValue(makeSpaceDoc());
      expect(await isSlugAvailable('used')).toBe(false);
    });

    test('free slug is available', async () => {
      spaceRepo.findBySlug.mockResolvedValue(null);
      expect(await isSlugAvailable('brand-new')).toBe(true);
    });
  });
});
