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
  insertOne: mock((doc: any) => Promise.resolve({ insertedId: doc._id ?? new ObjectId() })) as AnyMock,
  findOne: mock(() => Promise.resolve(null)) as AnyMock,
  updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })) as AnyMock,
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
  Collections: { SPACES: 'spaces' },
}));

import { SpaceRepository } from './space.repository';

describe('SpaceRepository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockCollection.insertOne.mockClear();
    mockCollection.findOne.mockClear();
    mockCollection.updateOne.mockClear();
    mockCollection.find.mockClear();
    findResult.sort.mockClear();
    findResult.limit.mockClear();
    findResult.toArray.mockClear();
    findResult.toArray.mockResolvedValue([]);
    lastFindFilter = null;
  });

  test('createSpace persists a client-generated _id', async () => {
    const repo = new SpaceRepository();
    const clientId = new ObjectId();
    const created = await repo.createSpace({
      _id: clientId,
      slug: 'my-space',
      name: 'My Space',
      visibility: 'public',
      e2ee: false,
      encryptIdentity: false,
      cipherRequired: false,
      createdBy: new ObjectId(),
      ownerIdentityId: new ObjectId(),
      allowFreeMembers: false,
      memberCount: 1,
    });

    expect(created._id.equals(clientId)).toBe(true);
    const [insertedDoc] = mockCollection.insertOne.mock.calls[0]!;
    expect(insertedDoc._id.equals(clientId)).toBe(true);
    expect(insertedDoc.slug).toBe('my-space');
    expect(insertedDoc.createdAt).toBeInstanceOf(Date);
    expect(insertedDoc.updatedAt).toBeInstanceOf(Date);
  });

  test('createSpace lets Mongo assign _id when none provided', async () => {
    const repo = new SpaceRepository();
    const created = await repo.createSpace({
      slug: 'auto-id',
      name: 'Auto',
      visibility: 'listed',
      e2ee: false,
      encryptIdentity: false,
      cipherRequired: false,
      createdBy: new ObjectId(),
      ownerIdentityId: new ObjectId(),
      allowFreeMembers: false,
      memberCount: 1,
    });
    expect(created._id).toBeInstanceOf(ObjectId);
    const [insertedDoc] = mockCollection.insertOne.mock.calls[0]!;
    expect(insertedDoc._id).toBeUndefined();
  });

  test('findBySlug queries by slug', async () => {
    const repo = new SpaceRepository();
    await repo.findBySlug('my-space');
    expect(mockCollection.findOne).toHaveBeenCalledWith({ slug: 'my-space' });
  });

  test('discover excludes hidden spaces', async () => {
    const repo = new SpaceRepository();
    await repo.discover();
    expect(lastFindFilter.visibility).toEqual({ $in: ['public', 'listed'] });
    expect(lastFindFilter.$or).toBeUndefined();
    expect(findResult.sort).toHaveBeenCalledWith({ _id: -1 });
  });

  test('discover applies a case-insensitive name/description/slug match', async () => {
    const repo = new SpaceRepository();
    await repo.discover({ q: 'game' });
    expect(Array.isArray(lastFindFilter.$or)).toBe(true);
    expect(lastFindFilter.$or).toHaveLength(3);
    expect(lastFindFilter.$or[0].name).toBeInstanceOf(RegExp);
    expect(lastFindFilter.$or[0].name.flags).toContain('i');
    expect(lastFindFilter.$or[0].encryptIdentity).toEqual({ $ne: true });
    expect(lastFindFilter.$or[2].slug).toBeInstanceOf(RegExp);
  });

  test('discover applies the cursor as an _id upper bound', async () => {
    const repo = new SpaceRepository();
    const cursor = new ObjectId();
    await repo.discover({ cursor });
    expect(lastFindFilter._id).toEqual({ $lt: cursor });
  });

  test('incrementMemberCount uses $inc with default delta of 1', async () => {
    const repo = new SpaceRepository();
    const spaceId = new ObjectId();
    await repo.incrementMemberCount(spaceId);
    const [filter, update] = mockCollection.updateOne.mock.calls[0]!;
    expect(filter).toEqual({ _id: spaceId });
    expect(update.$inc).toEqual({ memberCount: 1 });
  });

  test('incrementMemberCount respects a negative delta', async () => {
    const repo = new SpaceRepository();
    const spaceId = new ObjectId();
    await repo.incrementMemberCount(spaceId, -1);
    const [, update] = mockCollection.updateOne.mock.calls[0]!;
    expect(update.$inc).toEqual({ memberCount: -1 });
  });
});
