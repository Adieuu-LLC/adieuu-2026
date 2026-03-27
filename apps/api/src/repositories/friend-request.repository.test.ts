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
  insertOne: mock(() => Promise.resolve({ insertedId: new ObjectId() })) as AnyMock,
  findOneAndUpdate: mock(() => Promise.resolve(null)) as AnyMock,
  deleteOne: mock(() => Promise.resolve({ deletedCount: 1 })) as AnyMock,
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
    FRIEND_REQUESTS: 'friend_requests',
  },
}));

import { FriendRequestRepository } from './friend-request.repository';

function resetMocks() {
  mockCollection.findOne.mockReset();
  mockCollection.find.mockReset();
  mockCollection.insertOne.mockReset();
  mockCollection.findOneAndUpdate.mockReset();
  mockCollection.deleteOne.mockReset();
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
  mockCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
  mockCollection.findOneAndUpdate.mockResolvedValue(null);
  mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });
  mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });
  mockCollection.countDocuments.mockResolvedValue(0);
}

describe('friend-request.repository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(resetMocks);

  const identityA = new ObjectId();
  const identityB = new ObjectId();

  test('findPending queries with from/to/status=pending', async () => {
    const repo = new FriendRequestRepository();
    await repo.findPending(identityA, identityB);

    expect(mockCollection.findOne).toHaveBeenCalledWith({
      fromIdentityId: identityA,
      toIdentityId: identityB,
      status: 'pending',
    });
  });

  test('findIncoming filters by toIdentityId and status=pending', async () => {
    const repo = new FriendRequestRepository();
    const now = new Date();
    const docs = [
      { _id: new ObjectId(), fromIdentityId: identityB, toIdentityId: identityA, status: 'pending' as const, createdAt: now, updatedAt: now },
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

    const result = await repo.findIncoming(identityA, 10);
    expect(result).toEqual(docs);
    expect(mockCollection.find).toHaveBeenCalledWith({
      toIdentityId: identityA,
      status: 'pending',
    });
  });

  test('findIncoming applies cursor when provided', async () => {
    const repo = new FriendRequestRepository();
    const cursor = new ObjectId();
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

    await repo.findIncoming(identityA, 10, cursor);
    expect(mockCollection.find).toHaveBeenCalledWith({
      toIdentityId: identityA,
      status: 'pending',
      _id: { $lt: cursor },
    });
  });

  test('findOutgoing filters by fromIdentityId and status=pending', async () => {
    const repo = new FriendRequestRepository();
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

    await repo.findOutgoing(identityA);
    expect(mockCollection.find).toHaveBeenCalledWith({
      fromIdentityId: identityA,
      status: 'pending',
    });
  });

  test('findOutgoing applies cursor when provided', async () => {
    const repo = new FriendRequestRepository();
    const cursor = new ObjectId();
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

    await repo.findOutgoing(identityA, 10, cursor);
    expect(mockCollection.find).toHaveBeenCalledWith({
      fromIdentityId: identityA,
      status: 'pending',
      _id: { $lt: cursor },
    });
  });

  test('create inserts a doc with status pending', async () => {
    const repo = new FriendRequestRepository();
    const insertedId = new ObjectId();
    mockCollection.insertOne.mockResolvedValue({ insertedId });

    const result = await repo.create({
      fromIdentityId: identityA,
      toIdentityId: identityB,
    });

    expect(result.fromIdentityId).toEqual(identityA);
    expect(result.toIdentityId).toEqual(identityB);
    expect(result.status).toBe('pending');
    expect(mockCollection.insertOne).toHaveBeenCalledTimes(1);
  });

  test('countIncoming counts pending requests to an identity', async () => {
    const repo = new FriendRequestRepository();
    mockCollection.countDocuments.mockResolvedValue(3);

    const count = await repo.countIncoming(identityA);
    expect(count).toBe(3);
    expect(mockCollection.countDocuments).toHaveBeenCalledWith({
      toIdentityId: identityA,
      status: 'pending',
    });
  });

  test('deleteByPair deletes requests in both directions', async () => {
    const repo = new FriendRequestRepository();
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 2 });

    const count = await repo.deleteByPair(identityA, identityB);
    expect(count).toBe(2);
    expect(mockCollection.deleteMany).toHaveBeenCalledWith({
      $or: [
        { fromIdentityId: identityA, toIdentityId: identityB },
        { fromIdentityId: identityB, toIdentityId: identityA },
      ],
    });
  });

  test('findPendingBetween queries both directions with status=pending', async () => {
    const repo = new FriendRequestRepository();
    const now = new Date();
    const doc = { _id: new ObjectId(), fromIdentityId: identityB, toIdentityId: identityA, status: 'pending' as const, createdAt: now, updatedAt: now };
    mockCollection.findOne.mockResolvedValue(doc);

    const result = await repo.findPendingBetween(identityA, identityB);
    expect(result).toEqual(doc);
    expect(mockCollection.findOne).toHaveBeenCalledWith({
      $or: [
        { fromIdentityId: identityA, toIdentityId: identityB },
        { fromIdentityId: identityB, toIdentityId: identityA },
      ],
      status: 'pending',
    });
  });

  test('findPendingBetween returns null when no pending request exists', async () => {
    const repo = new FriendRequestRepository();
    mockCollection.findOne.mockResolvedValue(null);

    const result = await repo.findPendingBetween(identityA, identityB);
    expect(result).toBeNull();
  });
});
