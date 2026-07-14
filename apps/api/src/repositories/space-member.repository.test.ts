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
  insertOne: mock(() => Promise.resolve({ insertedId: new ObjectId() })) as AnyMock,
  findOne: mock(() => Promise.resolve(null)) as AnyMock,
  updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })) as AnyMock,
  deleteOne: mock(() => Promise.resolve({ deletedCount: 1 })) as AnyMock,
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
  Collections: { SPACE_MEMBERS: 'space_members' },
}));

import { SpaceMemberRepository } from './space-member.repository';

describe('SpaceMemberRepository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockCollection.insertOne.mockClear();
    mockCollection.findOne.mockClear();
    mockCollection.updateOne.mockClear();
    mockCollection.deleteOne.mockClear();
    mockCollection.find.mockClear();
    findResult.sort.mockClear();
    findResult.limit.mockClear();
    findResult.toArray.mockClear();
    findResult.toArray.mockResolvedValue([]);
    lastFindFilter = null;
  });

  test('createMember defaults status to active and stamps joinedAt', async () => {
    const repo = new SpaceMemberRepository();
    const member = await repo.createMember({
      spaceId: new ObjectId(),
      identityId: new ObjectId(),
      roleIds: [new ObjectId()],
    });
    expect(member.status).toBe('active');
    expect(member.joinedAt).toBeInstanceOf(Date);
    const [doc] = mockCollection.insertOne.mock.calls[0]!;
    expect(doc.status).toBe('active');
  });

  test('findMember scopes by space and identity', async () => {
    const repo = new SpaceMemberRepository();
    const spaceId = new ObjectId();
    const identityId = new ObjectId();
    await repo.findMember(spaceId, identityId);
    expect(mockCollection.findOne).toHaveBeenCalledWith({ spaceId, identityId });
  });

  test('listBySpace paginates ascending with a cursor lower bound', async () => {
    const repo = new SpaceMemberRepository();
    const spaceId = new ObjectId();
    const cursor = new ObjectId();
    await repo.listBySpace(spaceId, 25, cursor);
    expect(lastFindFilter.spaceId).toBe(spaceId);
    expect(lastFindFilter._id).toEqual({ $gt: cursor });
    expect(findResult.sort).toHaveBeenCalledWith({ _id: 1 });
    expect(findResult.limit).toHaveBeenCalledWith(25);
  });

  test('findForIdentity paginates descending with a cursor upper bound', async () => {
    const repo = new SpaceMemberRepository();
    const identityId = new ObjectId();
    const cursor = new ObjectId();
    await repo.findForIdentity(identityId, 50, cursor);
    expect(lastFindFilter.identityId).toBe(identityId);
    expect(lastFindFilter._id).toEqual({ $lt: cursor });
    expect(findResult.sort).toHaveBeenCalledWith({ _id: -1 });
  });

  test('addRole uses $addToSet on roleIds', async () => {
    const repo = new SpaceMemberRepository();
    const roleId = new ObjectId();
    await repo.addRole(new ObjectId(), new ObjectId(), roleId);
    const [, update] = mockCollection.updateOne.mock.calls[0]!;
    expect(update.$addToSet).toEqual({ roleIds: roleId });
  });

  test('removeMember deletes the membership row', async () => {
    const repo = new SpaceMemberRepository();
    const spaceId = new ObjectId();
    const identityId = new ObjectId();
    const removed = await repo.removeMember(spaceId, identityId);
    expect(removed).toBe(true);
    expect(mockCollection.deleteOne).toHaveBeenCalledWith({ spaceId, identityId });
  });
});
