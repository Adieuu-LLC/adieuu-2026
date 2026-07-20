/**
 * Unit tests for Space channel list + create (mocked repositories).
 *
 * @module services/space/channel-crud.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const spaceRepo = {
  findById: mock(async (_id: ObjectId) => null as any) as AnyMock,
};

const memberRepo = {
  findMember: mock(async (_s: ObjectId, _i: ObjectId) => null as any) as AnyMock,
};

const roleRepo = {
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
};

const channelRepo = {
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
  findByIdInSpace: mock(async (_s: ObjectId, _c: ObjectId) => null as any) as AnyMock,
  createChannel: mock(async (input: any) => ({
    ...input,
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  updateChannel: mock(async (_s: ObjectId, _c: ObjectId, fields: any) => ({
    _id: _c,
    spaceId: _s,
    type: 'text',
    name: fields.name ?? 'lounge',
    position: fields.position ?? 0,
    categoryId: fields.clearCategoryId ? undefined : fields.categoryId,
    allowedRoleIds: fields.allowedRoleIds ?? [EVERYONE_ROLE],
    ...(fields.cipherCheck ? { cipherCheck: fields.cipherCheck } : {}),
    ...(fields.encryptedName
      ? {
          encryptedName: fields.encryptedName,
          nameNonce: fields.nameNonce,
          cipherId: fields.cipherId,
        }
      : {}),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
};

const categoryRepo = {
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
  findByIdInSpace: mock(async (_s: ObjectId, _c: ObjectId) => null as any) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../repositories/space.repository', () => ({ getSpaceRepository: () => spaceRepo }));
mock.module('../../repositories/space-member.repository', () => ({ getSpaceMemberRepository: () => memberRepo }));
mock.module('../../repositories/space-role.repository', () => ({ getSpaceRoleRepository: () => roleRepo }));
mock.module('../../repositories/space-channel.repository', () => ({ getSpaceChannelRepository: () => channelRepo }));
mock.module('../../repositories/space-channel-category.repository', () => ({
  getSpaceChannelCategoryRepository: () => categoryRepo,
}));

const publishSpaceEvent = mock(async () => {}) as AnyMock;
mock.module('./redis-events', () => ({
  publishSpaceEvent,
  publishSpaceEventToIdentity: mock(async () => {}),
}));

import {
  createSpaceChannel,
  listSpaceChannels,
  updateSpaceChannel,
  resolveChannelCipherCheck,
} from './channel-crud';

const OWNER = new ObjectId();
const ADMIN_ROLE = new ObjectId();
const EVERYONE_ROLE = new ObjectId();
const MOD_ROLE = new ObjectId();

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

function makeRoles() {
  return [
    {
      _id: ADMIN_ROLE,
      spaceId: new ObjectId(),
      name: 'Admin',
      permissions: ['manageChannels', 'manageEncryption', 'viewChannels', 'sendMessages'],
      position: 0,
      isDefaultMember: false,
      isSystem: true,
      systemKey: 'admin' as const,
    },
    {
      _id: MOD_ROLE,
      spaceId: new ObjectId(),
      name: 'Mod',
      permissions: ['manageChannels', 'manageEncryption', 'viewChannels', 'sendMessages'],
      position: 100,
      isDefaultMember: false,
      isSystem: false,
    },
    {
      _id: EVERYONE_ROLE,
      spaceId: new ObjectId(),
      name: 'Everyone',
      permissions: ['viewChannels', 'sendMessages'],
      position: 1000,
      isDefaultMember: true,
      isSystem: true,
      systemKey: 'member' as const,
    },
  ];
}

function grantMember(
  spaceId: ObjectId,
  actorId: ObjectId,
  roleIds: ObjectId[],
  roleDocs = makeRoles(),
) {
  memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) =>
    id.equals(actorId)
      ? {
          _id: new ObjectId(),
          spaceId,
          identityId: actorId,
          roleIds,
          status: 'active',
          joinedAt: new Date(),
        }
      : null,
  );
  roleRepo.findBySpace.mockResolvedValue(
    roleDocs.map((r) => ({ ...r, spaceId })),
  );
}

describe('space/channel-crud', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    for (const repo of [spaceRepo, memberRepo, roleRepo, channelRepo]) {
      for (const fn of Object.values(repo)) (fn as AnyMock).mockClear();
    }
    spaceRepo.findById.mockResolvedValue(null);
    memberRepo.findMember.mockResolvedValue(null);
    roleRepo.findBySpace.mockResolvedValue([]);
    channelRepo.findBySpace.mockResolvedValue([]);
    channelRepo.findByIdInSpace.mockResolvedValue(null);
    publishSpaceEvent.mockClear();
  });

  describe('createSpaceChannel', () => {
    test('rejects without manageChannels', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const actor = new ObjectId();
      grantMember(space._id, actor, [EVERYONE_ROLE]);
      const r = await createSpaceChannel(space._id, actor, { type: 'text', name: 'lounge' });
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    });

    test('defaults allowedRoleIds to Everyone and publishes event', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const actor = new ObjectId();
      grantMember(space._id, actor, [ADMIN_ROLE, EVERYONE_ROLE]);
      channelRepo.findBySpace.mockResolvedValue([
        { _id: new ObjectId(), spaceId: space._id, position: 0 },
      ]);

      const r = await createSpaceChannel(space._id, actor, { type: 'text', name: 'lounge' });
      expect(r.success).toBe(true);
      expect(r.channel?.name).toBe('lounge');
      expect(r.channel?.allowedRoleIds).toEqual([EVERYONE_ROLE.toHexString()]);
      expect(r.channel?.position).toBe(1);

      const input = channelRepo.createChannel.mock.calls[0]![0];
      expect(input.allowedRoleIds).toEqual([EVERYONE_ROLE]);
      expect(publishSpaceEvent).toHaveBeenCalledTimes(1);
      expect(publishSpaceEvent.mock.calls[0]![1].type).toBe('space_channel_created');
    });

    test('rejects roles above the actor in hierarchy', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const actor = new ObjectId();
      // Mod at position 100 — Admin at 0 is above them.
      grantMember(space._id, actor, [MOD_ROLE, EVERYONE_ROLE]);

      const r = await createSpaceChannel(space._id, actor, {
        type: 'text',
        name: 'mods-only',
        allowedRoleIds: [ADMIN_ROLE.toHexString()],
      });
      expect(r).toMatchObject({ success: false, errorCode: 'ESCALATION' });
    });

    test('allows restricting to roles at or below the actor', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const actor = new ObjectId();
      grantMember(space._id, actor, [MOD_ROLE, EVERYONE_ROLE]);
      channelRepo.findBySpace.mockResolvedValue([]);

      const r = await createSpaceChannel(space._id, actor, {
        type: 'text',
        name: 'mods',
        allowedRoleIds: [MOD_ROLE.toHexString()],
      });
      expect(r.success).toBe(true);
      expect(r.channel?.allowedRoleIds).toEqual([MOD_ROLE.toHexString()]);
    });

    test('inherits Space cipherCheck when the Space is e2ee', async () => {
      const cipherCheck = { knownValue: 'kv', encryptedKnownValue: 'enc', nonce: 'n' };
      const space = makeSpaceDoc({ e2ee: true, cipherCheck });
      spaceRepo.findById.mockResolvedValue(space);
      const actor = new ObjectId();
      grantMember(space._id, actor, [ADMIN_ROLE, EVERYONE_ROLE]);
      channelRepo.findBySpace.mockResolvedValue([]);

      const r = await createSpaceChannel(space._id, actor, {
        type: 'text',
        encryptedName: 'enc-name',
        nameNonce: 'nonce',
        cipherId: 'cid',
      });
      expect(r.success).toBe(true);
      const input = channelRepo.createChannel.mock.calls[0]![0];
      expect(input.cipherCheck).toEqual(cipherCheck);
      expect(r.channel?.cipherCheck).toEqual(cipherCheck);
    });

    test('skips inheriting cipherCheck when encrypt is false', async () => {
      const cipherCheck = { knownValue: 'kv', encryptedKnownValue: 'enc', nonce: 'n' };
      const space = makeSpaceDoc({ e2ee: true, cipherCheck });
      spaceRepo.findById.mockResolvedValue(space);
      const actor = new ObjectId();
      grantMember(space._id, actor, [ADMIN_ROLE, EVERYONE_ROLE]);
      channelRepo.findBySpace.mockResolvedValue([]);

      const r = await createSpaceChannel(space._id, actor, {
        type: 'text',
        encrypt: false,
        encryptedName: 'enc-name',
        nameNonce: 'nonce',
        cipherId: 'cid',
      });
      expect(r.success).toBe(true);
      const input = channelRepo.createChannel.mock.calls[0]![0];
      expect(input.cipherCheck).toBeUndefined();
    });
  });

  describe('resolveChannelCipherCheck', () => {
    const cipherCheck = { knownValue: 'kv', encryptedKnownValue: 'enc', nonce: 'n' };

    test('inherits from an e2ee Space by default', () => {
      expect(
        resolveChannelCipherCheck({ e2ee: true, cipherCheck }, {}),
      ).toEqual(cipherCheck);
    });

    test('does not inherit when Space is not e2ee unless encrypt is true', () => {
      expect(
        resolveChannelCipherCheck({ e2ee: false, cipherCheck }, {}),
      ).toBeUndefined();
      expect(
        resolveChannelCipherCheck({ e2ee: false, cipherCheck }, { encrypt: true }),
      ).toEqual(cipherCheck);
    });
  });

  describe('updateSpaceChannel', () => {
    test('updates name and allowedRoleIds and publishes event', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const actor = new ObjectId();
      const channelId = new ObjectId();
      grantMember(space._id, actor, [ADMIN_ROLE, EVERYONE_ROLE]);
      channelRepo.findByIdInSpace.mockResolvedValue({
        _id: channelId,
        spaceId: space._id,
        type: 'text',
        name: 'old',
        position: 0,
        allowedRoleIds: [EVERYONE_ROLE],
      });

      const r = await updateSpaceChannel(space._id, channelId, actor, {
        name: 'renamed',
        allowedRoleIds: [MOD_ROLE.toHexString()],
      });
      expect(r.success).toBe(true);
      expect(r.channel?.name).toBe('renamed');
      expect(channelRepo.updateChannel).toHaveBeenCalled();
      expect(publishSpaceEvent.mock.calls[0]![1].type).toBe('space_channel_updated');
    });

    test('clears cipherCheck when encrypt is false', async () => {
      const cipherCheck = { knownValue: 'kv', encryptedKnownValue: 'enc', nonce: 'n' };
      const space = makeSpaceDoc({ cipherCheck });
      spaceRepo.findById.mockResolvedValue(space);
      const actor = new ObjectId();
      const channelId = new ObjectId();
      grantMember(space._id, actor, [ADMIN_ROLE, EVERYONE_ROLE]);
      channelRepo.findByIdInSpace.mockResolvedValue({
        _id: channelId,
        spaceId: space._id,
        type: 'text',
        name: 'lounge',
        position: 0,
        allowedRoleIds: [EVERYONE_ROLE],
        cipherCheck,
      });

      const r = await updateSpaceChannel(space._id, channelId, actor, { encrypt: false });
      expect(r.success).toBe(true);
      const fields = channelRepo.updateChannel.mock.calls[0]![2];
      expect(fields.clearCipherCheck).toBe(true);
    });

    test('rejects encryption changes without manageEncryption', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const actor = new ObjectId();
      const channelId = new ObjectId();
      // Custom (non-system) role with manageChannels but not manageEncryption.
      const roles = makeRoles().map((r) =>
        r._id.equals(MOD_ROLE)
          ? { ...r, permissions: ['manageChannels', 'viewChannels', 'sendMessages'] }
          : r,
      );
      grantMember(space._id, actor, [MOD_ROLE, EVERYONE_ROLE], roles);
      channelRepo.findByIdInSpace.mockResolvedValue({
        _id: channelId,
        spaceId: space._id,
        type: 'text',
        name: 'lounge',
        position: 0,
        allowedRoleIds: [EVERYONE_ROLE],
      });

      const r = await updateSpaceChannel(space._id, channelId, actor, { encrypt: true, cipherCheck: {
        knownValue: 'kv', encryptedKnownValue: 'enc', nonce: 'n',
      } });
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    });

    test('allows encryption-only update with manageEncryption', async () => {
      const cipherCheck = { knownValue: 'kv', encryptedKnownValue: 'enc', nonce: 'n' };
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const actor = new ObjectId();
      const channelId = new ObjectId();
      const roles = makeRoles().map((r) =>
        r._id.equals(MOD_ROLE)
          ? { ...r, permissions: ['manageEncryption', 'viewChannels', 'sendMessages'] }
          : r,
      );
      grantMember(space._id, actor, [MOD_ROLE, EVERYONE_ROLE], roles);
      channelRepo.findByIdInSpace.mockResolvedValue({
        _id: channelId,
        spaceId: space._id,
        type: 'text',
        name: 'lounge',
        position: 0,
        allowedRoleIds: [EVERYONE_ROLE],
      });

      const r = await updateSpaceChannel(space._id, channelId, actor, {
        encrypt: true,
        cipherCheck,
      });
      expect(r.success).toBe(true);
      expect(channelRepo.updateChannel.mock.calls[0]![2].cipherCheck).toEqual(cipherCheck);
    });
  });

  describe('listSpaceChannels', () => {
    test('hides restricted channels from members without the role', async () => {
      const space = makeSpaceDoc({ visibility: 'public' });
      spaceRepo.findById.mockResolvedValue(space);
      const actor = new ObjectId();
      grantMember(space._id, actor, [EVERYONE_ROLE]);

      const open = {
        _id: new ObjectId(),
        spaceId: space._id,
        type: 'text',
        name: 'general',
        position: 0,
        allowedRoleIds: [EVERYONE_ROLE],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const modsOnly = {
        _id: new ObjectId(),
        spaceId: space._id,
        type: 'text',
        name: 'mods',
        position: 1,
        allowedRoleIds: [MOD_ROLE],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      channelRepo.findBySpace.mockResolvedValue([open, modsOnly]);

      const r = await listSpaceChannels(space._id, actor);
      expect(r.success).toBe(true);
      expect(r.channels?.map((c) => c.name)).toEqual(['general']);
    });

    test('manageChannels sees restricted channels', async () => {
      const space = makeSpaceDoc({ visibility: 'public' });
      spaceRepo.findById.mockResolvedValue(space);
      const actor = new ObjectId();
      grantMember(space._id, actor, [ADMIN_ROLE]);

      const modsOnly = {
        _id: new ObjectId(),
        spaceId: space._id,
        type: 'text',
        name: 'mods',
        position: 0,
        allowedRoleIds: [MOD_ROLE],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      channelRepo.findBySpace.mockResolvedValue([modsOnly]);

      const r = await listSpaceChannels(space._id, actor);
      expect(r.success).toBe(true);
      expect(r.channels).toHaveLength(1);
    });

    test('non-members see Everyone-open channels on public spaces', async () => {
      const space = makeSpaceDoc({ visibility: 'public' });
      spaceRepo.findById.mockResolvedValue(space);
      roleRepo.findBySpace.mockResolvedValue(makeRoles().map((r) => ({ ...r, spaceId: space._id })));

      const open = {
        _id: new ObjectId(),
        spaceId: space._id,
        type: 'text',
        name: 'general',
        position: 0,
        allowedRoleIds: [EVERYONE_ROLE],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const modsOnly = {
        _id: new ObjectId(),
        spaceId: space._id,
        type: 'text',
        name: 'mods',
        position: 1,
        allowedRoleIds: [MOD_ROLE],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      channelRepo.findBySpace.mockResolvedValue([open, modsOnly]);

      const r = await listSpaceChannels(space._id, new ObjectId());
      expect(r.success).toBe(true);
      expect(r.channels?.map((c) => c.name)).toEqual(['general']);
    });
  });
});
