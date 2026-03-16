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
  deleteOne: mock(() => Promise.resolve({ deletedCount: 1 })) as AnyMock,
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
    BLOCKS: 'blocks',
  },
}));

import { BlockRepository } from './block.repository';

describe('block.repository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockCollection.findOne.mockReset();
    mockCollection.find.mockReset();
    mockCollection.insertOne.mockReset();
    mockCollection.deleteOne.mockReset();
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
    mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });
    mockCollection.countDocuments.mockResolvedValue(0);
  });

  test('isBlockedByEither queries both directional pairs', async () => {
    const repo = new BlockRepository();
    const a = new ObjectId();
    const b = new ObjectId();
    mockCollection.findOne.mockResolvedValue({ _id: new ObjectId() });

    const result = await repo.isBlockedByEither(a, b);

    expect(result).toBe(true);
    expect(mockCollection.findOne).toHaveBeenCalledWith({
      $or: [
        { blockerIdentityId: a, blockedIdentityId: b },
        { blockerIdentityId: b, blockedIdentityId: a },
      ],
    });
  });

  test('getBlockedByIdentity applies cursor, descending sort, and limit', async () => {
    const repo = new BlockRepository();
    const identityId = new ObjectId();
    const cursor = new ObjectId();
    const docs = [
      {
        _id: new ObjectId(),
        blockerIdentityId: identityId,
        blockedIdentityId: new ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
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

    const result = await repo.getBlockedByIdentity(identityId, 20, cursor);
    expect(result).toEqual(docs);
    expect(mockCollection.find).toHaveBeenCalledWith({
      blockerIdentityId: identityId,
      _id: { $lt: cursor },
    });
  });

  test('getBlockedIdentityIds returns projected blocked IDs only', async () => {
    const repo = new BlockRepository();
    const identityId = new ObjectId();
    const blockedA = new ObjectId();
    const blockedB = new ObjectId();
    mockCollection.find.mockImplementation(() => ({
      sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
      project: () => ({
        toArray: async () => [
          { blockedIdentityId: blockedA },
          { blockedIdentityId: blockedB },
        ],
      }),
      limit: () => ({ toArray: async () => [] }),
      toArray: async () => [],
    }));

    const ids = await repo.getBlockedIdentityIds(identityId);
    expect(ids).toEqual([blockedA, blockedB]);
  });

  test('remove returns false when no block deleted', async () => {
    const repo = new BlockRepository();
    mockCollection.deleteOne.mockResolvedValue({ deletedCount: 0 });

    const result = await repo.remove(new ObjectId(), new ObjectId());
    expect(result).toBe(false);
  });

  test('countBlockedByIdentity delegates to countDocuments filter', async () => {
    const repo = new BlockRepository();
    const identityId = new ObjectId();
    mockCollection.countDocuments.mockResolvedValue(5);

    const count = await repo.countBlockedByIdentity(identityId);
    expect(count).toBe(5);
    expect(mockCollection.countDocuments).toHaveBeenCalledWith({
      blockerIdentityId: identityId,
    });
  });
});

