/**
 * Unit tests for Space channel category CRUD + layout (mocked repositories).
 *
 * @module services/space/category-crud.test
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
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
  clearCategory: mock(async (_s: ObjectId, _c: ObjectId) => 0) as AnyMock,
  reparentChannels: mock(async (_s: ObjectId, _c: ObjectId, _to: ObjectId | null) => 0) as AnyMock,
  setLayout: mock(async () => {}) as AnyMock,
  createChannel: mock(async (input: any) => ({
    ...input,
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
};

const categoryRepo = {
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
  findByIdInSpace: mock(async (_s: ObjectId, _c: ObjectId) => null as any) as AnyMock,
  createCategory: mock(async (input: any) => ({
    ...input,
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  updateCategory: mock(async (_s: ObjectId, _c: ObjectId, fields: any) => ({
    _id: _c,
    spaceId: _s,
    name: fields.name ?? 'General',
    position: fields.position ?? 0,
    allowedRoleIds: fields.allowedRoleIds ?? [EVERYONE_ROLE],
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  deleteCategory: mock(async (_s: ObjectId, _c: ObjectId) => true) as AnyMock,
  setLayout: mock(async () => {}) as AnyMock,
  reparentChildren: mock(async () => 0) as AnyMock,
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
  createSpaceChannelCategory,
  deleteSpaceChannelCategory,
  listSpaceChannelCategories,
  updateSpaceChannelLayout,
} from './category-crud';
import { createSpaceChannel } from './channel-crud';

const OWNER = new ObjectId();
const ADMIN_ROLE = new ObjectId();
const EVERYONE_ROLE = new ObjectId();

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
      systemKey: 'admin' as const,
      permissions: ['manageChannels', 'manageEncryption', 'manageRoles', 'manageMetadata'],
      position: 0,
      isDefaultMember: false,
      isSystem: true,
    },
    {
      _id: EVERYONE_ROLE,
      spaceId: new ObjectId(),
      name: 'Everyone',
      systemKey: 'member' as const,
      permissions: ['viewChannels', 'sendMessages'],
      position: 100,
      isDefaultMember: true,
      isSystem: true,
    },
  ];
}

function seedAdmin(spaceId: ObjectId, actor: ObjectId) {
  spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ _id: spaceId }));
  memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) =>
    id.equals(actor)
      ? {
          _id: new ObjectId(),
          spaceId,
          identityId: actor,
          roleIds: [ADMIN_ROLE, EVERYONE_ROLE],
          status: 'active',
          joinedAt: new Date(),
        }
      : null,
  );
  roleRepo.findBySpace.mockResolvedValue(makeRoles().map((r) => ({ ...r, spaceId })));
}

beforeEach(() => {
  spaceRepo.findById.mockReset();
  memberRepo.findMember.mockReset();
  roleRepo.findBySpace.mockReset();
  for (const repo of [spaceRepo, memberRepo, roleRepo, channelRepo, categoryRepo]) {
    for (const fn of Object.values(repo)) (fn as AnyMock).mockClear();
  }
  publishSpaceEvent.mockClear();

  categoryRepo.findBySpace.mockResolvedValue([]);
  channelRepo.findBySpace.mockResolvedValue([]);
  categoryRepo.createCategory.mockImplementation(async (input: Record<string, unknown>) => ({
    ...input,
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  categoryRepo.deleteCategory.mockResolvedValue(true);
});

describe('space/category-crud', () => {
  test('createSpaceChannelCategory requires manageChannels', async () => {
    const spaceId = new ObjectId();
    const actor = new ObjectId();
    spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ _id: spaceId }));
    memberRepo.findMember.mockResolvedValue({
      _id: new ObjectId(),
      spaceId,
      identityId: actor,
      roleIds: [EVERYONE_ROLE],
      status: 'active',
    });
    roleRepo.findBySpace.mockResolvedValue(makeRoles().map((r) => ({ ...r, spaceId })));

    const r = await createSpaceChannelCategory(spaceId, actor, { name: 'Voice' });
    expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
  });

  test('createSpaceChannelCategory succeeds for admin', async () => {
    const spaceId = new ObjectId();
    const actor = new ObjectId();
    seedAdmin(spaceId, actor);

    const r = await createSpaceChannelCategory(spaceId, actor, { name: 'Projects' });
    expect(r.success).toBe(true);
    expect(r.category?.name).toBe('Projects');
    expect(publishSpaceEvent.mock.calls[0]![1].type).toBe('space_category_created');
  });

  test('listSpaceChannelCategories filters by ACL', async () => {
    const spaceId = new ObjectId();
    const actor = new ObjectId();
    const openCat = new ObjectId();
    const privateCat = new ObjectId();
    spaceRepo.findById.mockResolvedValue(makeSpaceDoc({ _id: spaceId }));
    memberRepo.findMember.mockResolvedValue({
      _id: new ObjectId(),
      spaceId,
      identityId: actor,
      roleIds: [EVERYONE_ROLE],
      status: 'active',
    });
    roleRepo.findBySpace.mockResolvedValue(makeRoles().map((r) => ({ ...r, spaceId })));
    categoryRepo.findBySpace.mockResolvedValue([
      {
        _id: openCat,
        spaceId,
        name: 'Open',
        position: 0,
        allowedRoleIds: [EVERYONE_ROLE],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: privateCat,
        spaceId,
        name: 'Private',
        position: 1,
        allowedRoleIds: [ADMIN_ROLE],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const r = await listSpaceChannelCategories(spaceId, actor);
    expect(r.success).toBe(true);
    expect(r.categories?.map((c) => c.name)).toEqual(['Open']);
  });

  test('deleteSpaceChannelCategory promotes children to parent', async () => {
    const spaceId = new ObjectId();
    const actor = new ObjectId();
    const parentId = new ObjectId();
    const categoryId = new ObjectId();
    seedAdmin(spaceId, actor);
    categoryRepo.findByIdInSpace.mockResolvedValue({
      _id: categoryId,
      spaceId,
      name: 'Projects',
      position: 0,
      parentCategoryId: parentId,
      allowedRoleIds: [EVERYONE_ROLE],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const r = await deleteSpaceChannelCategory(spaceId, categoryId, actor);
    expect(r.success).toBe(true);
    expect(channelRepo.reparentChannels).toHaveBeenCalledWith(spaceId, categoryId, parentId);
    expect(categoryRepo.reparentChildren).toHaveBeenCalledWith(spaceId, categoryId, parentId);
    expect(publishSpaceEvent.mock.calls[0]![1].type).toBe('space_category_deleted');
  });

  test('createSpaceChannel inherits category allowedRoleIds', async () => {
    const spaceId = new ObjectId();
    const actor = new ObjectId();
    const categoryId = new ObjectId();
    seedAdmin(spaceId, actor);
    categoryRepo.findByIdInSpace.mockResolvedValue({
      _id: categoryId,
      spaceId,
      name: 'Staff',
      position: 0,
      allowedRoleIds: [ADMIN_ROLE],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const r = await createSpaceChannel(spaceId, actor, {
      type: 'text',
      name: 'ops',
      categoryId: categoryId.toHexString(),
    });
    expect(r.success).toBe(true);
    expect(channelRepo.createChannel.mock.calls[0]![0].allowedRoleIds).toEqual([ADMIN_ROLE]);
    expect(channelRepo.createChannel.mock.calls[0]![0].categoryId).toEqual(categoryId);
  });

  test('updateSpaceChannelLayout reorders nested categories and channels', async () => {
    const spaceId = new ObjectId();
    const actor = new ObjectId();
    const catA = new ObjectId();
    const catB = new ObjectId();
    const ch1 = new ObjectId();
    const ch2 = new ObjectId();
    seedAdmin(spaceId, actor);
    categoryRepo.findBySpace.mockResolvedValue([
      {
        _id: catA,
        spaceId,
        name: 'A',
        position: 0,
        allowedRoleIds: [EVERYONE_ROLE],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: catB,
        spaceId,
        name: 'B',
        position: 1,
        allowedRoleIds: [EVERYONE_ROLE],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    channelRepo.findBySpace.mockResolvedValue([
      {
        _id: ch1,
        spaceId,
        type: 'text',
        name: 'one',
        position: 0,
        categoryId: catA,
        allowedRoleIds: [EVERYONE_ROLE],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: ch2,
        spaceId,
        type: 'text',
        name: 'two',
        position: 0,
        categoryId: catB,
        allowedRoleIds: [EVERYONE_ROLE],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const r = await updateSpaceChannelLayout(spaceId, actor, {
      groups: [
        {
          parentCategoryId: null,
          items: [
            { type: 'category', id: catB.toHexString() },
            { type: 'channel', id: ch2.toHexString() },
            { type: 'category', id: catA.toHexString() },
          ],
        },
        { parentCategoryId: catA.toHexString(), items: [{ type: 'channel', id: ch1.toHexString() }] },
        { parentCategoryId: catB.toHexString(), items: [] },
      ],
    });
    expect(r.success).toBe(true);
    expect(categoryRepo.setLayout).toHaveBeenCalled();
    expect(channelRepo.setLayout).toHaveBeenCalled();
    expect(publishSpaceEvent.mock.calls[0]![1].type).toBe('space_channel_layout_updated');
  });

  test('updateSpaceChannelLayout rejects nesting deeper than max depth', async () => {
    const spaceId = new ObjectId();
    const actor = new ObjectId();
    const ids = Array.from({ length: 6 }, () => new ObjectId());
    seedAdmin(spaceId, actor);
    categoryRepo.findBySpace.mockResolvedValue(
      ids.map((id, i) => ({
        _id: id,
        spaceId,
        name: `C${i}`,
        position: 0,
        parentCategoryId: i === 0 ? undefined : ids[i - 1],
        allowedRoleIds: [EVERYONE_ROLE],
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
    channelRepo.findBySpace.mockResolvedValue([]);

    const groups = [
      { parentCategoryId: null, items: [{ type: 'category' as const, id: ids[0]!.toHexString() }] },
      ...ids.map((id, i) => ({
        parentCategoryId: id.toHexString(),
        items:
          i < ids.length - 1
            ? [{ type: 'category' as const, id: ids[i + 1]!.toHexString() }]
            : [],
      })),
    ];

    const r = await updateSpaceChannelLayout(spaceId, actor, { groups });
    expect(r).toMatchObject({ success: false, errorCode: 'INVALID_CONTENT' });
  });
});
