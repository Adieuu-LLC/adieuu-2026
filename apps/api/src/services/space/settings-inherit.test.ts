/**
 * Unit tests for Space settings inherit helpers + cascade.
 *
 * @module services/space/settings-inherit.test
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const channelRepo = {
  findBySpace: mock(async () => [] as any[]) as AnyMock,
  updateChannel: mock(async (_s: ObjectId, id: ObjectId, fields: any) => ({
    _id: id,
    spaceId: _s,
    type: 'text',
    name: 'ch',
    position: 0,
    allowedRoleIds: fields.allowedRoleIds ?? [],
    inheritAllowedRoleIds: fields.inheritAllowedRoleIds,
    inheritCipherCheck: fields.inheritCipherCheck,
    cipherCheck: fields.clearCipherCheck ? undefined : fields.cipherCheck,
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
};

const categoryRepo = {
  findBySpace: mock(async () => [] as any[]) as AnyMock,
  updateCategory: mock(async (_s: ObjectId, id: ObjectId, fields: any) => ({
    _id: id,
    spaceId: _s,
    name: 'cat',
    position: 0,
    allowedRoleIds: fields.allowedRoleIds ?? [],
    inheritAllowedRoleIds: fields.inheritAllowedRoleIds,
    inheritCipherCheck: fields.inheritCipherCheck,
    cipherCheck: fields.clearCipherCheck ? undefined : fields.cipherCheck,
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../repositories/space-channel.repository', () => ({
  getSpaceChannelRepository: () => channelRepo,
}));
mock.module('../../repositories/space-channel-category.repository', () => ({
  getSpaceChannelCategoryRepository: () => categoryRepo,
}));

const publishSpaceEvent = mock(async () => {}) as AnyMock;
mock.module('./redis-events', () => ({
  publishSpaceEvent,
  publishSpaceEventToIdentity: mock(async () => {}),
}));

import {
  ancestorForceFlags,
  cascadeCategorySettings,
  isInheritEnabled,
  resolveParentAcl,
  resolveParentCipher,
} from './settings-inherit';

const EVERYONE = new ObjectId();
const CIPHER = { knownValue: 'kv', encryptedKnownValue: 'enc', nonce: 'n' };

beforeEach(() => {
  channelRepo.findBySpace.mockReset();
  channelRepo.updateChannel.mockClear();
  categoryRepo.findBySpace.mockReset();
  categoryRepo.updateCategory.mockClear();
  publishSpaceEvent.mockClear();
  channelRepo.findBySpace.mockResolvedValue([]);
  categoryRepo.findBySpace.mockResolvedValue([]);
});

describe('settings-inherit helpers', () => {
  test('isInheritEnabled treats missing as false', () => {
    expect(isInheritEnabled(undefined)).toBe(false);
    expect(isInheritEnabled(false)).toBe(false);
    expect(isInheritEnabled(true)).toBe(true);
  });

  test('resolveParentAcl uses Everyone at Space root', () => {
    expect(resolveParentAcl(null, EVERYONE)).toEqual([EVERYONE]);
  });

  test('resolveParentCipher uses parent cipher when present', () => {
    expect(
      resolveParentCipher({ e2ee: true, cipherCheck: CIPHER }, { cipherCheck: CIPHER }),
    ).toEqual(CIPHER);
  });

  test('resolveParentCipher clears under parent without cipher even if Space e2ee', () => {
    expect(
      resolveParentCipher({ e2ee: true, cipherCheck: CIPHER }, { cipherCheck: undefined }),
    ).toBeUndefined();
  });

  test('ancestorForceFlags finds nearest forcing ancestors', () => {
    const rootId = new ObjectId();
    const childId = new ObjectId();
    const map = new Map([
      [
        rootId.toHexString(),
        {
          _id: rootId,
          spaceId: new ObjectId(),
          name: 'Root',
          position: 0,
          forceChildrenAcl: true,
          forceChildrenCipher: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      [
        childId.toHexString(),
        {
          _id: childId,
          spaceId: new ObjectId(),
          name: 'Child',
          position: 0,
          parentCategoryId: rootId,
          forceChildrenCipher: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ]);
    const r = ancestorForceFlags(childId.toHexString(), map as never);
    expect(r.forceAcl).toBe(true);
    expect(r.forceAclByCategoryId).toBe(rootId.toHexString());
    expect(r.forceCipher).toBe(true);
    expect(r.forceCipherByCategoryId).toBe(childId.toHexString());
  });
});

describe('cascadeCategorySettings', () => {
  test('updates inheriting child channel ACL from parent', async () => {
    const spaceId = new ObjectId();
    const rootId = new ObjectId();
    const channelId = new ObjectId();
    const adminRole = new ObjectId();
    const root = {
      _id: rootId,
      spaceId,
      name: 'Root',
      position: 0,
      allowedRoleIds: [adminRole],
      forceChildrenAcl: false,
      forceChildrenCipher: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    categoryRepo.findBySpace.mockResolvedValue([root]);
    channelRepo.findBySpace.mockResolvedValue([
      {
        _id: channelId,
        spaceId,
        type: 'text',
        name: 'ops',
        position: 0,
        categoryId: rootId,
        allowedRoleIds: [EVERYONE],
        inheritAllowedRoleIds: true,
        inheritCipherCheck: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await cascadeCategorySettings(spaceId, root as never, { e2ee: false }, EVERYONE);

    expect(channelRepo.updateChannel).toHaveBeenCalled();
    const fields = channelRepo.updateChannel.mock.calls[0]![2];
    expect(fields.allowedRoleIds).toEqual([adminRole]);
    expect(publishSpaceEvent.mock.calls.some((c) => c[1].type === 'space_channel_updated')).toBe(
      true,
    );
  });

  test('forceChildrenAcl enables inherit and copies ACL on legacy children', async () => {
    const spaceId = new ObjectId();
    const rootId = new ObjectId();
    const channelId = new ObjectId();
    const adminRole = new ObjectId();
    const root = {
      _id: rootId,
      spaceId,
      name: 'Root',
      position: 0,
      allowedRoleIds: [adminRole],
      forceChildrenAcl: true,
      forceChildrenCipher: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    categoryRepo.findBySpace.mockResolvedValue([root]);
    channelRepo.findBySpace.mockResolvedValue([
      {
        _id: channelId,
        spaceId,
        type: 'text',
        name: 'ops',
        position: 0,
        categoryId: rootId,
        allowedRoleIds: [EVERYONE],
        // legacy: inherit flags absent
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await cascadeCategorySettings(spaceId, root as never, { e2ee: false }, EVERYONE);

    const fields = channelRepo.updateChannel.mock.calls[0]![2];
    expect(fields.inheritAllowedRoleIds).toBe(true);
    expect(fields.allowedRoleIds).toEqual([adminRole]);
  });

  test('skips legacy non-inheriting children when force is off', async () => {
    const spaceId = new ObjectId();
    const rootId = new ObjectId();
    const root = {
      _id: rootId,
      spaceId,
      name: 'Root',
      position: 0,
      allowedRoleIds: [EVERYONE],
      forceChildrenAcl: false,
      forceChildrenCipher: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    categoryRepo.findBySpace.mockResolvedValue([root]);
    channelRepo.findBySpace.mockResolvedValue([
      {
        _id: new ObjectId(),
        spaceId,
        type: 'text',
        name: 'ops',
        position: 0,
        categoryId: rootId,
        allowedRoleIds: [EVERYONE],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await cascadeCategorySettings(spaceId, root as never, { e2ee: false }, EVERYONE);
    expect(channelRepo.updateChannel).not.toHaveBeenCalled();
  });
});
