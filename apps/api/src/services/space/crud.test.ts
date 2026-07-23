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
const mockIsSpaceCreationEnabled = mock(async () => true) as AnyMock;
const mockGetPlatformCapabilities = mock(async () => ({
  isPlatformAdmin: false,
  isPlatformModerator: false,
  isPlatformSupportAgent: false,
  roles: [],
  permissions: [],
})) as AnyMock;

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
  findForIdentityInSpaces: mock(async (_i: ObjectId, _ids: ObjectId[]) => [] as any[]) as AnyMock,
  listRecentBySpace: mock(async (_id: ObjectId, _l: number) => [] as any[]) as AnyMock,
  deleteBySpace: mock(async (_id: ObjectId) => 0) as AnyMock,
};

const channelRepo = {
  createChannel: mock(async (input: any) => ({
    ...input,
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  findBySpace: mock(async (_id: ObjectId) => [] as any[]) as AnyMock,
  countBySpace: mock(async (_id: ObjectId) => 0) as AnyMock,
  deleteBySpace: mock(async (_id: ObjectId) => 0) as AnyMock,
};

const categoryRepo = {
  createCategory: mock(async (input: any) => ({
    ...input,
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  deleteBySpace: mock(async (_id: ObjectId) => 0) as AnyMock,
};

const messageRepo = {
  deleteBySpace: mock(async (_id: ObjectId) => 0) as AnyMock,
};

const reactionRepo = {
  deleteBySpace: mock(async (_id: ObjectId) => 0) as AnyMock,
};

const pinRepo = {
  deleteByChannelIds: mock(async (_ids: ObjectId[]) => 0) as AnyMock,
};

const inviteRepo = {
  deleteBySpace: mock(async (_id: ObjectId) => 0) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../billing/resolve-access', () => ({ hasPaidAccess: mockHasPaidAccess }));
mock.module('./space-settings', () => ({ isSpaceCreationEnabled: mockIsSpaceCreationEnabled }));
mock.module('../platform-capabilities.service', () => ({
  getPlatformCapabilities: mockGetPlatformCapabilities,
}));
mock.module('../../repositories/space.repository', () => ({ getSpaceRepository: () => spaceRepo }));
mock.module('../../repositories/space-role.repository', () => ({ getSpaceRoleRepository: () => roleRepo }));
mock.module('../../repositories/space-member.repository', () => ({ getSpaceMemberRepository: () => memberRepo }));
mock.module('../../repositories/space-channel.repository', () => ({ getSpaceChannelRepository: () => channelRepo }));
mock.module('../../repositories/space-channel-category.repository', () => ({
  getSpaceChannelCategoryRepository: () => categoryRepo,
}));
mock.module('../../repositories/space-message.repository', () => ({ getSpaceMessageRepository: () => messageRepo }));
mock.module('../../repositories/space-reaction.repository', () => ({ getSpaceReactionRepository: () => reactionRepo }));
mock.module('../../repositories/space-pin.repository', () => ({ getSpacePinRepository: () => pinRepo }));
mock.module('../../repositories/space-invite.repository', () => ({ getSpaceInviteRepository: () => inviteRepo }));

const publishSpaceEvent = mock(async () => {}) as AnyMock;
const publishSpaceEventToIdentity = mock(async () => {}) as AnyMock;
mock.module('./redis-events', () => ({ publishSpaceEvent, publishSpaceEventToIdentity }));

import {
  createSpace,
  getSpaceBySlug,
  getSpaceById,
  updateSpace,
  getSpaceViewerPermissions,
  getSpaceManageOverview,
  deleteSpace,
  listMySpaces,
  discoverSpaces,
  isSlugAvailable,
} from './crud';

const CREATOR = new ObjectId();
const PAID = { subscriptions: ['access'] as const };

const VALID_ENCRYPTED_SEED = {
  category: {
    encryptedName: 'ZW5jLWNhdA',
    nameNonce: 'bm9uY2U',
    cipherId: 'cipher-hex',
  },
  channel: {
    encryptedName: 'ZW5jLWNo',
    nameNonce: 'bm9uY2U',
    cipherId: 'cipher-hex',
  },
  roles: [
    {
      system: 'admin' as const,
      encryptedName: 'ZW5jLWFkbWlu',
      nameNonce: 'bm9uY2U',
      cipherId: 'cipher-hex',
    },
    {
      system: 'everyone' as const,
      encryptedName: 'ZW5jLW1lbWJlcg',
      nameNonce: 'bm9uY2U',
      cipherId: 'cipher-hex',
    },
  ],
};

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
    mockIsSpaceCreationEnabled.mockReset();
    mockIsSpaceCreationEnabled.mockResolvedValue(true);
    mockGetPlatformCapabilities.mockReset();
    mockGetPlatformCapabilities.mockResolvedValue({
      isPlatformAdmin: false,
      isPlatformModerator: false,
      isPlatformSupportAgent: false,
      roles: [],
      permissions: [],
    });
    for (const repo of [
      spaceRepo, roleRepo, memberRepo, channelRepo, categoryRepo,
      messageRepo, reactionRepo, pinRepo, inviteRepo,
    ]) {
      for (const fn of Object.values(repo)) (fn as AnyMock).mockClear();
    }
    spaceRepo.findBySlug.mockResolvedValue(null);
    spaceRepo.findById.mockResolvedValue(null);
    spaceRepo.findByIds.mockResolvedValue([]);
    spaceRepo.discover.mockResolvedValue([]);
    spaceRepo.deleteById.mockResolvedValue(true);
    roleRepo.findBySpace.mockResolvedValue([]);
    memberRepo.findMember.mockResolvedValue(null);
    memberRepo.findForIdentity.mockResolvedValue([]);
    memberRepo.listRecentBySpace.mockResolvedValue([]);
    channelRepo.findBySpace.mockResolvedValue([]);
    channelRepo.countBySpace.mockResolvedValue(0);
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
      {
        _id: adminRoleId,
        spaceId,
        name: 'Admin',
        permissions: ['manageMetadata', 'manageRoles', 'kickMembers', 'viewChannels', 'sendMessages'],
        systemKey: 'admin',
      },
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

    test('rejects non-admins when Space creation is disabled', async () => {
      mockIsSpaceCreationEnabled.mockResolvedValue(false);
      mockGetPlatformCapabilities.mockResolvedValue({
        isPlatformAdmin: false,
        isPlatformModerator: false,
        isPlatformSupportAgent: false,
        roles: [],
        permissions: [],
      });
      const r = await createSpace(CREATOR, {
        slug: 'my-space', name: 'My Space', visibility: 'public',
      }, PAID);
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_CREATION_DISABLED' });
      expect(spaceRepo.createSpace).not.toHaveBeenCalled();
    });

    test('allows platform admins when Space creation is disabled', async () => {
      mockIsSpaceCreationEnabled.mockResolvedValue(false);
      mockGetPlatformCapabilities.mockResolvedValue({
        isPlatformAdmin: true,
        isPlatformModerator: false,
        isPlatformSupportAgent: false,
        roles: ['admin'],
        permissions: [],
      });
      const r = await createSpace(CREATOR, {
        slug: 'admin-space', name: 'Admin Space', visibility: 'public',
      }, PAID);
      expect(r.success).toBe(true);
      expect(spaceRepo.createSpace).toHaveBeenCalled();
    });

    test('allows paid non-admins when Space creation is enabled', async () => {
      mockIsSpaceCreationEnabled.mockResolvedValue(true);
      const r = await createSpace(CREATOR, {
        slug: 'open-space', name: 'Open Space', visibility: 'public',
      }, PAID);
      expect(r.success).toBe(true);
      expect(mockGetPlatformCapabilities).not.toHaveBeenCalled();
      expect(spaceRepo.createSpace).toHaveBeenCalled();
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

    test('seeds Admin + Member roles, creator membership, Text Channels, and #general', async () => {
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
      expect(adminArg.permissions).toContain('manageRoles');
      expect(adminArg.permissions).toContain('manageMetadata');
      expect(adminArg.permissions).not.toContain('admin');
      expect(adminArg.isSystem).toBe(true);
      expect(adminArg.systemKey).toBe('admin');
      expect(memberArg.name).toBe('Everyone');
      expect(memberArg.isDefaultMember).toBe(true);
      expect(memberArg.systemKey).toBe('everyone');
      expect(memberArg.permissions).toContain('viewChannels');
      expect(memberArg.permissions).toContain('sendMessages');
      expect(memberArg.permissions).not.toContain('manageRoles');

      // Creator added as a member with the Admin role.
      expect(memberRepo.createMember).toHaveBeenCalledTimes(1);
      const memberInput = memberRepo.createMember.mock.calls[0]![0];
      expect(memberInput.identityId).toBe(CREATOR);
      expect(memberInput.roleIds).toHaveLength(1);
      expect(memberInput.roleIds[0]).toBeInstanceOf(ObjectId);

      // Default Text Channels category at position 0, open to Everyone.
      expect(categoryRepo.createCategory).toHaveBeenCalledTimes(1);
      const categoryInput = categoryRepo.createCategory.mock.calls[0]![0];
      expect(categoryInput).toMatchObject({ name: 'Text Channels', position: 0 });
      expect(categoryInput.allowedRoleIds).toHaveLength(1);
      expect(categoryInput.allowedRoleIds[0]).toBeInstanceOf(ObjectId);

      // Default #general text channel nested in that category.
      expect(channelRepo.createChannel).toHaveBeenCalledTimes(1);
      const channelInput = channelRepo.createChannel.mock.calls[0]![0];
      expect(channelInput).toMatchObject({
        type: 'text',
        name: 'general',
        position: 0,
        inheritAllowedRoleIds: true,
        inheritCipherCheck: true,
      });
      expect(channelInput.categoryId).toBeInstanceOf(ObjectId);
      expect(channelInput.allowedRoleIds).toHaveLength(1);
      expect(channelInput.allowedRoleIds[0]).toBeInstanceOf(ObjectId);

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
        slug: 'secret', name: 'Secret', visibility: 'hidden', id: clientId,
        cipherCheck, e2ee: true, cipherRequired: true,
        encryptedSeed: VALID_ENCRYPTED_SEED,
      }, PAID);

      expect(r.success).toBe(true);
      const createArg = spaceRepo.createSpace.mock.calls[0]![0];
      expect(createArg._id.toHexString()).toBe(clientId);
      expect(createArg.cipherCheck).toEqual(cipherCheck);
      expect(createArg.e2ee).toBe(true);
      expect(createArg.encryptIdentity).toBe(false);
      expect(createArg.cipherRequired).toBe(true);

      const categoryInput = categoryRepo.createCategory.mock.calls[0]![0];
      expect(categoryInput.name).toBe('');
      expect(categoryInput.encryptedName).toBe(VALID_ENCRYPTED_SEED.category.encryptedName);
      expect(categoryInput.cipherCheck).toEqual(cipherCheck);

      const channelInput = channelRepo.createChannel.mock.calls[0]![0];
      expect(channelInput.name).toBe('');
      expect(channelInput.encryptedName).toBe(VALID_ENCRYPTED_SEED.channel.encryptedName);
      expect(channelInput.cipherCheck).toEqual(cipherCheck);
      expect(channelInput.categoryId).toBeInstanceOf(ObjectId);

      const adminArg = roleRepo.createRole.mock.calls[0]![0];
      expect(adminArg.name).toBe('');
      expect(adminArg.encryptedName).toBe(VALID_ENCRYPTED_SEED.roles[0]!.encryptedName);
    });

    test('forces Hidden Space slug to equal the client ObjectId', async () => {
      const clientId = new ObjectId().toHexString();
      const r = await createSpace(CREATOR, {
        visibility: 'hidden',
        name: 'Secret Hideout',
        id: clientId,
        slug: 'ignored-vanity',
      }, PAID);

      expect(r.success).toBe(true);
      const createArg = spaceRepo.createSpace.mock.calls[0]![0];
      expect(createArg._id.toHexString()).toBe(clientId);
      expect(createArg.slug).toBe(clientId);
      expect(createArg.visibility).toBe('hidden');
    });

    test('rejects Hidden Space create without a client id', async () => {
      const r = await createSpace(CREATOR, {
        visibility: 'hidden',
        name: 'No Id',
      }, PAID);
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_ID' });
      expect(spaceRepo.createSpace).not.toHaveBeenCalled();
    });

    test('persists encryptIdentity ciphertext and omits plaintext name', async () => {
      const clientId = new ObjectId().toHexString();
      const cipherCheck = { knownValue: 'kv', encryptedKnownValue: 'enc', nonce: 'n' };
      const r = await createSpace(CREATOR, {
        slug: 'secret', visibility: 'listed', id: clientId,
        cipherCheck, e2ee: true, encryptIdentity: true, cipherRequired: true,
        encryptedSeed: VALID_ENCRYPTED_SEED,
        encryptedName: 'ZW5jLW5hbWU',
        nameNonce: 'bm9uY2U',
        cipherId: 'cipher-hex',
        encryptedDescription: 'ZW5jLWRlc2M',
        descriptionNonce: 'ZGVzYy1ub25jZQ',
      }, PAID);

      expect(r.success).toBe(true);
      const createArg = spaceRepo.createSpace.mock.calls[0]![0];
      expect(createArg.name).toBe('');
      expect(createArg.description).toBeUndefined();
      expect(createArg.encryptIdentity).toBe(true);
      expect(createArg.encryptedName).toBe('ZW5jLW5hbWU');
      expect(createArg.encryptedDescription).toBe('ZW5jLWRlc2M');
    });

    test('persists gate-only cipherCheck without e2ee', async () => {
      const clientId = new ObjectId().toHexString();
      const cipherCheck = { knownValue: 'kv', encryptedKnownValue: 'enc', nonce: 'n' };
      const r = await createSpace(CREATOR, {
        slug: 'gated', name: 'Gated', visibility: 'listed', id: clientId,
        cipherCheck, e2ee: false, cipherRequired: true,
      }, PAID);

      expect(r.success).toBe(true);
      const createArg = spaceRepo.createSpace.mock.calls[0]![0];
      expect(createArg.cipherCheck).toEqual(cipherCheck);
      expect(createArg.e2ee).toBe(false);
      expect(createArg.cipherRequired).toBe(true);
    });

    test('rejects e2ee without cipherCheck', async () => {
      const r = await createSpace(CREATOR, {
        slug: 'broken', name: 'Broken', visibility: 'listed', e2ee: true,
      }, PAID);
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_ENCRYPTION' });
    });

    test('rolls back seeded documents when membership seeding fails', async () => {
      memberRepo.createMember.mockRejectedValueOnce(new Error('boom'));
      await expect(
        createSpace(CREATOR, { slug: 'my-space', name: 'My Space', visibility: 'public' }, PAID),
      ).rejects.toThrow('boom');

      expect(channelRepo.deleteBySpace).toHaveBeenCalledTimes(1);
      expect(categoryRepo.deleteBySpace).toHaveBeenCalledTimes(1);
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

    test('reveals hidden Spaces to active members', async () => {
      spaceRepo.findBySlug.mockResolvedValue(makeSpaceDoc({ slug: 'secret', visibility: 'hidden' }));
      memberRepo.findMember.mockResolvedValue({ _id: new ObjectId(), status: 'active' });
      const r = await getSpaceBySlug('secret', CREATOR);
      expect(r).toMatchObject({ success: true });
      expect(r.space?.slug).toBe('secret');
    });

    test('hides hidden Spaces from banned members', async () => {
      spaceRepo.findBySlug.mockResolvedValue(makeSpaceDoc({ slug: 'secret', visibility: 'hidden' }));
      memberRepo.findMember.mockResolvedValue({ _id: new ObjectId(), status: 'banned' });
      const r = await getSpaceBySlug('secret', CREATOR);
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_NOT_FOUND' });
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

    test('hides hidden Spaces from banned members', async () => {
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ visibility: 'hidden' }));
      memberRepo.findMember.mockResolvedValue({ _id: new ObjectId(), status: 'banned' });
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
        { _id: memberRoleId, spaceId, name: 'Member', permissions: ['viewChannels', 'sendMessages'] },
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

    test('allows toggling cipherRequired when a cipherCheck exists', async () => {
      const spaceId = new ObjectId();
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({
        _id: spaceId,
        cipherCheck: { knownValue: 'k', encryptedKnownValue: 'e', nonce: 'n' },
        e2ee: true,
        cipherRequired: true,
      }));
      seedAdminMembership(spaceId);
      const r = await updateSpace(spaceId, CREATOR, { cipherRequired: false });
      expect(r.success).toBe(true);
      const [, patch] = spaceRepo.updateById.mock.calls[0]!;
      expect(patch).toEqual({ cipherRequired: false });
    });

    test('rejects enabling cipherRequired without cipherCheck', async () => {
      const spaceId = new ObjectId();
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ _id: spaceId }));
      seedAdminMembership(spaceId);
      const r = await updateSpace(spaceId, CREATOR, { cipherRequired: true });
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_ENCRYPTION' });
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

  describe('getSpaceViewerPermissions', () => {
    test('returns empty permissions for a non-member', async () => {
      const spaceId = new ObjectId();
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ _id: spaceId }));
      memberRepo.findMember.mockResolvedValue(null);
      const r = await getSpaceViewerPermissions(spaceId, CREATOR);
      expect(r).toMatchObject({
        success: true,
        viewer: { isMember: false, isAdmin: false, permissions: [], roleIds: [] },
      });
    });

    test('returns admin permissions for an admin member', async () => {
      const spaceId = new ObjectId();
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ _id: spaceId }));
      seedAdminMembership(spaceId);
      const r = await getSpaceViewerPermissions(spaceId, CREATOR);
      expect(r.success).toBe(true);
      expect(r.viewer).toMatchObject({ isMember: true, isAdmin: true });
      expect(r.viewer!.permissions).toContain('manageMetadata');
      expect(r.viewer!.permissions).not.toContain('admin');
    });
  });

  describe('getSpaceManageOverview', () => {
    test('rejects a non-admin member', async () => {
      const spaceId = new ObjectId();
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ _id: spaceId }));
      const memberRoleId = new ObjectId();
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(), spaceId, identityId: CREATOR, status: 'active', roleIds: [memberRoleId],
      });
      roleRepo.findBySpace.mockResolvedValue([
        { _id: memberRoleId, spaceId, name: 'Member', permissions: ['viewChannels', 'sendMessages'] },
      ]);
      const r = await getSpaceManageOverview(spaceId, CREATOR);
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    });

    test('returns stats and recent joins for an admin', async () => {
      const spaceId = new ObjectId();
      const joinedAt = new Date('2026-01-15T12:00:00.000Z');
      const joinerId = new ObjectId();
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({
        _id: spaceId, memberCount: 3, slug: 'hq', name: 'HQ',
      }));
      seedAdminMembership(spaceId);
      channelRepo.countBySpace.mockResolvedValue(2);
      memberRepo.listRecentBySpace.mockResolvedValue([
        { identityId: joinerId, joinedAt },
      ]);
      const r = await getSpaceManageOverview(spaceId, CREATOR);
      expect(r.success).toBe(true);
      expect(r.overview).toMatchObject({
        spaceId: spaceId.toHexString(),
        slug: 'hq',
        name: 'HQ',
        memberCount: 3,
        channelCount: 2,
      });
      expect(r.overview!.recentJoins).toEqual([
        { identityId: joinerId.toHexString(), joinedAt: joinedAt.toISOString() },
      ]);
    });
  });

  describe('deleteSpace', () => {
    test('rejects a non-member', async () => {
      const spaceId = new ObjectId();
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ _id: spaceId }));
      memberRepo.findMember.mockResolvedValue(null);
      const r = await deleteSpace(spaceId, CREATOR);
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_MEMBER' });
      expect(spaceRepo.deleteById).not.toHaveBeenCalled();
    });

    test('rejects a member with manageMetadata but without deleteSpace', async () => {
      const spaceId = new ObjectId();
      const actor = new ObjectId();
      spaceRepo.findById.mockResolvedValue(
        makeSpaceDoc({ _id: spaceId, ownerIdentityId: CREATOR }),
      );
      const roleId = new ObjectId();
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(),
        spaceId,
        identityId: actor,
        status: 'active',
        roleIds: [roleId],
      });
      roleRepo.findBySpace.mockResolvedValue([
        {
          _id: roleId,
          spaceId,
          name: 'Manager',
          permissions: ['manageMetadata', 'viewChannels'],
        },
      ]);
      const r = await deleteSpace(spaceId, actor);
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
      expect(spaceRepo.deleteById).not.toHaveBeenCalled();
    });

    test('allows a non-owner member with deleteSpace', async () => {
      const spaceId = new ObjectId();
      const actor = new ObjectId();
      spaceRepo.findById.mockResolvedValue(
        makeSpaceDoc({ _id: spaceId, ownerIdentityId: CREATOR }),
      );
      const roleId = new ObjectId();
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(),
        spaceId,
        identityId: actor,
        status: 'active',
        roleIds: [roleId],
      });
      roleRepo.findBySpace.mockResolvedValue([
        {
          _id: roleId,
          spaceId,
          name: 'Deleter',
          permissions: ['deleteSpace', 'viewChannels'],
        },
      ]);
      channelRepo.findBySpace.mockResolvedValue([]);
      const r = await deleteSpace(spaceId, actor);
      expect(r.success).toBe(true);
      expect(spaceRepo.deleteById).toHaveBeenCalledWith(spaceId);
    });

    test('cascades deletes and publishes space_deleted for the owner', async () => {
      const spaceId = new ObjectId();
      const channelId = new ObjectId();
      spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ _id: spaceId }));
      seedAdminMembership(spaceId);
      channelRepo.findBySpace.mockResolvedValue([{ _id: channelId, spaceId }]);
      const r = await deleteSpace(spaceId, CREATOR);
      expect(r.success).toBe(true);
      expect(messageRepo.deleteBySpace).toHaveBeenCalledWith(spaceId);
      expect(reactionRepo.deleteBySpace).toHaveBeenCalledWith(spaceId);
      expect(pinRepo.deleteByChannelIds).toHaveBeenCalledWith([channelId]);
      expect(inviteRepo.deleteBySpace).toHaveBeenCalledWith(spaceId);
      expect(channelRepo.deleteBySpace).toHaveBeenCalledWith(spaceId);
      expect(categoryRepo.deleteBySpace).toHaveBeenCalledWith(spaceId);
      expect(memberRepo.deleteBySpace).toHaveBeenCalledWith(spaceId);
      expect(roleRepo.deleteBySpace).toHaveBeenCalledWith(spaceId);
      expect(spaceRepo.deleteById).toHaveBeenCalledWith(spaceId);
      expect(publishSpaceEvent).toHaveBeenCalledTimes(1);
      expect(publishSpaceEvent.mock.calls[0]![1]).toEqual({
        type: 'space_deleted',
        data: { spaceId: spaceId.toHexString() },
      });
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
