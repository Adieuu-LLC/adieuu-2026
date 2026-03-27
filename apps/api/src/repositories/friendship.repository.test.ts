import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockCollection = {
  findOne: mock(() => Promise.resolve(null)) as AnyMock,
  find: mock(() => ({
    sort: mock(() => ({
      limit: mock(() => ({
        toArray: mock(() => Promise.resolve([])),
      })),
    })),
    project: mock(() => ({
      toArray: mock(() => Promise.resolve([])),
    })),
    limit: mock(() => ({
      toArray: mock(() => Promise.resolve([])),
    })),
    toArray: mock(() => Promise.resolve([])),
  })) as AnyMock,
  insertMany: mock(() => Promise.resolve({ insertedCount: 2 })) as AnyMock,
  deleteMany: mock(() => Promise.resolve({ deletedCount: 0 })) as AnyMock,
  countDocuments: mock(() => Promise.resolve(0)) as AnyMock,
};

mock.module('../config', () => ({
  config: {
    env: 'test',
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
  },
}));

mock.module('../db', () => ({
  getCollection: mock(() => mockCollection),
  Collections: {
    FRIENDSHIPS: 'friendships',
  },
}));

import { FriendshipRepository } from './friendship.repository';

function resetMocks() {
  mockCollection.findOne.mockReset();
  mockCollection.find.mockReset();
  mockCollection.insertMany.mockReset();
  mockCollection.deleteMany.mockReset();
  mockCollection.countDocuments.mockReset();

  mockCollection.findOne.mockResolvedValue(null);
  mockCollection.find.mockImplementation(() => ({
    sort: () => ({
      limit: () => ({
        toArray: async () => [],
      }),
    }),
    project: () => ({
      toArray: async () => [],
    }),
    limit: () => ({
      toArray: async () => [],
    }),
    toArray: async () => [],
  }));
  mockCollection.insertMany.mockResolvedValue({ insertedCount: 2 });
  mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });
  mockCollection.countDocuments.mockResolvedValue(0);
}

describe('friendship.repository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(resetMocks);

  const identityA = new ObjectId();
  const identityB = new ObjectId();

  test('areFriends returns true when a friendship doc exists', async () => {
    const repo = new FriendshipRepository();
    mockCollection.findOne.mockResolvedValue({ _id: new ObjectId() });

    const result = await repo.areFriends(identityA, identityB);
    expect(result).toBe(true);
    expect(mockCollection.findOne).toHaveBeenCalledWith({
      identityId: identityA,
      friendIdentityId: identityB,
    });
  });

  test('areFriends returns false when no friendship exists', async () => {
    const repo = new FriendshipRepository();
    mockCollection.findOne.mockResolvedValue(null);

    const result = await repo.areFriends(identityA, identityB);
    expect(result).toBe(false);
  });

  test('createMutual inserts two documents (one per direction)', async () => {
    const repo = new FriendshipRepository();
    await repo.createMutual(identityA, identityB);

    expect(mockCollection.insertMany).toHaveBeenCalledTimes(1);
    const insertedDocs = mockCollection.insertMany.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(insertedDocs.length).toBe(2);

    expect(insertedDocs[0]!.identityId).toEqual(identityA);
    expect(insertedDocs[0]!.friendIdentityId).toEqual(identityB);
    expect(insertedDocs[1]!.identityId).toEqual(identityB);
    expect(insertedDocs[1]!.friendIdentityId).toEqual(identityA);

    // Timestamps should be set
    expect(insertedDocs[0]!.createdAt).toBeInstanceOf(Date);
    expect(insertedDocs[0]!.updatedAt).toBeInstanceOf(Date);
  });

  test('remove deletes both direction docs and returns true', async () => {
    const repo = new FriendshipRepository();
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 2 });

    const result = await repo.remove(identityA, identityB);
    expect(result).toBe(true);
    expect(mockCollection.deleteMany).toHaveBeenCalledWith({
      $or: [
        { identityId: identityA, friendIdentityId: identityB },
        { identityId: identityB, friendIdentityId: identityA },
      ],
    });
  });

  test('remove returns false when no docs were deleted', async () => {
    const repo = new FriendshipRepository();
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });

    const result = await repo.remove(identityA, identityB);
    expect(result).toBe(false);
  });

  test('getFriends filters by identityId with cursor-based pagination', async () => {
    const repo = new FriendshipRepository();
    const cursor = new ObjectId();
    const now = new Date();
    const docs = [
      { _id: new ObjectId(), identityId: identityA, friendIdentityId: identityB, createdAt: now, updatedAt: now },
    ];
    mockCollection.find.mockImplementation(() => ({
      sort: () => ({
        limit: () => ({
          toArray: async () => docs,
        }),
      }),
      project: () => ({ toArray: async () => [] }),
      limit: () => ({ toArray: async () => docs }),
      toArray: async () => docs,
    }));

    const result = await repo.getFriends(identityA, 20, cursor);
    expect(result).toEqual(docs);
    expect(mockCollection.find).toHaveBeenCalledWith({
      identityId: identityA,
      _id: { $lt: cursor },
    });
  });

  test('getFriends omits cursor from filter when not provided', async () => {
    const repo = new FriendshipRepository();
    mockCollection.find.mockImplementation(() => ({
      sort: () => ({
        limit: () => ({
          toArray: async () => [],
        }),
      }),
      project: () => ({ toArray: async () => [] }),
      limit: () => ({ toArray: async () => [] }),
      toArray: async () => [],
    }));

    await repo.getFriends(identityA, 10);
    expect(mockCollection.find).toHaveBeenCalledWith({
      identityId: identityA,
    });
  });

  test('searchFriends returns empty array for empty friendIdentityIds', async () => {
    const repo = new FriendshipRepository();
    const result = await repo.searchFriends(identityA, []);
    expect(result).toEqual([]);
    expect(mockCollection.find).not.toHaveBeenCalled();
  });

  test('searchFriends queries with $in filter', async () => {
    const repo = new FriendshipRepository();
    const friendId1 = new ObjectId();
    const friendId2 = new ObjectId();
    const friendIds = [friendId1, friendId2];
    const now = new Date();
    const docs = [
      { _id: new ObjectId(), identityId: identityA, friendIdentityId: friendId1, createdAt: now, updatedAt: now },
    ];
    mockCollection.find.mockImplementation(() => ({
      sort: () => ({ limit: () => ({ toArray: async () => docs }) }),
      project: () => ({ toArray: async () => [] }),
      limit: () => ({ toArray: async () => docs }),
      toArray: async () => docs,
    }));

    const result = await repo.searchFriends(identityA, friendIds);
    expect(result).toEqual(docs);
    expect(mockCollection.find).toHaveBeenCalledWith({
      identityId: identityA,
      friendIdentityId: { $in: friendIds },
    });
  });

  test('countFriends delegates to countDocuments with identityId filter', async () => {
    const repo = new FriendshipRepository();
    mockCollection.countDocuments.mockResolvedValue(7);

    const count = await repo.countFriends(identityA);
    expect(count).toBe(7);
    expect(mockCollection.countDocuments).toHaveBeenCalledWith({
      identityId: identityA,
    });
  });
});
