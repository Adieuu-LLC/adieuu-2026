import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

let lastFindFilter: any = null;
const findResult = {
  sort: mock(() => findResult),
  limit: mock(() => findResult),
  toArray: mock(() => Promise.resolve([] as any[])),
};

const mockCollection = {
  insertOne: mock((doc: any) =>
    Promise.resolve({ insertedId: doc._id ?? new ObjectId() })
  ) as AnyMock,
  findOne: mock(() => Promise.resolve(null)) as AnyMock,
  updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })) as AnyMock,
  updateMany: mock(() => Promise.resolve({ modifiedCount: 0 })) as AnyMock,
  deleteMany: mock(() => Promise.resolve({ deletedCount: 0 })) as AnyMock,
  find: mock((filter: any) => {
    lastFindFilter = filter;
    return findResult;
  }) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../config', () => ({
  config: {
    env: 'test',
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
  },
}));

mock.module('../db', () => ({
  getCollection: mock(() => mockCollection),
  Collections: { SPACE_ROLES: 'space_roles' },
}));

import { SpaceRoleRepository } from './space-role.repository';

describe('SpaceRoleRepository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockCollection.insertOne.mockClear();
    mockCollection.findOne.mockClear();
    mockCollection.updateOne.mockClear();
    mockCollection.updateMany.mockClear();
    mockCollection.deleteMany.mockClear();
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });
    mockCollection.find.mockClear();
    findResult.sort.mockClear();
    findResult.limit.mockClear();
    findResult.toArray.mockClear();
    findResult.toArray.mockResolvedValue([]);
    lastFindFilter = null;
  });

  test('findBySpace backfills systemKey and position on legacy Admin/Member', async () => {
    const repo = new SpaceRoleRepository();
    const spaceId = new ObjectId();
    const adminId = new ObjectId();
    const memberId = new ObjectId();
    findResult.toArray.mockResolvedValueOnce([
      {
        _id: adminId,
        spaceId,
        name: 'Admin',
        permissions: ['admin', 'manageRoles'],
        isSystem: true,
        isDefaultMember: false,
      },
      {
        _id: memberId,
        spaceId,
        name: 'Member',
        permissions: ['read', 'post'],
        isSystem: true,
        isDefaultMember: true,
      },
    ]);

    const roles = await repo.findBySpace(spaceId);
    expect(roles[0]!.systemKey).toBe('admin');
    expect(roles[0]!.position).toBe(0);
    expect(roles[1]!.systemKey).toBe('everyone');
    expect(roles[1]!.position).toBe(1000);
    expect(mockCollection.updateOne).toHaveBeenCalled();
  });

  test('createRole defaults isDefaultMember and isSystem to false', async () => {
    const repo = new SpaceRoleRepository();
    const role = await repo.createRole({
      spaceId: new ObjectId(),
      name: 'Member',
      permissions: ['viewChannels', 'sendMessages'],
    });
    expect(role.isDefaultMember).toBe(false);
    expect(role.isSystem).toBe(false);
    const [doc] = mockCollection.insertOne.mock.calls[0]!;
    expect(doc.isDefaultMember).toBe(false);
    expect(doc.isSystem).toBe(false);
    expect(doc.displaySeparately).toBe(false);
    expect(doc.mentionable).toBe(false);
    expect(doc.createdAt).toBeInstanceOf(Date);
  });

  test('createRole normalizes legacy permissions and respects flags', async () => {
    const repo = new SpaceRoleRepository();
    const role = await repo.createRole({
      spaceId: new ObjectId(),
      name: 'Admin',
      // Legacy input still accepted via normalizeSpacePermissions.
      permissions: ['admin' as never],
      isDefaultMember: false,
      isSystem: true,
      systemKey: 'admin',
    });
    expect(role.isSystem).toBe(true);
    const [doc] = mockCollection.insertOne.mock.calls[0]!;
    expect(doc.isSystem).toBe(true);
    expect(doc.systemKey).toBe('admin');
    expect(doc.permissions).toContain('manageRoles');
    expect(doc.permissions).not.toContain('admin');
  });

  test('findBySpace queries by space and orders by position then _id', async () => {
    const repo = new SpaceRoleRepository();
    const spaceId = new ObjectId();
    await repo.findBySpace(spaceId);
    expect(lastFindFilter).toEqual({ spaceId });
    expect(findResult.sort).toHaveBeenCalledWith({ position: 1, _id: 1 });
  });

  test('findDefaultMember filters by the default-member flag', async () => {
    const repo = new SpaceRoleRepository();
    const spaceId = new ObjectId();
    await repo.findDefaultMember(spaceId);
    expect(mockCollection.findOne).toHaveBeenCalledWith({
      spaceId,
      isDefaultMember: true,
    });
  });

  test('deleteBySpace removes all roles and returns the deleted count', async () => {
    const repo = new SpaceRoleRepository();
    const spaceId = new ObjectId();
    mockCollection.deleteMany.mockResolvedValueOnce({ deletedCount: 2 });
    const count = await repo.deleteBySpace(spaceId);
    expect(count).toBe(2);
    expect(mockCollection.deleteMany).toHaveBeenCalledWith({ spaceId });
  });
});
