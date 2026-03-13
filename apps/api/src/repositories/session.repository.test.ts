import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

let redisConnected = true;
let redisGetValue: string | null = null;

const redisSetMock = mock(async () => 'OK');
const redisGetMock = mock(async () => redisGetValue);
const redisDelMock = mock(async () => 1);

const mockCollection = {
  findOne: mock(() => Promise.resolve(null)) as AnyMock,
  find: mock(() => ({
    limit: mock(() => ({
      toArray: mock(() => Promise.resolve([])),
    })),
    toArray: mock(() => Promise.resolve([])),
  })) as AnyMock,
  insertOne: mock(() => Promise.resolve({ insertedId: new ObjectId() })) as AnyMock,
  updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })) as AnyMock,
  updateMany: mock(() => Promise.resolve({ modifiedCount: 0 })) as AnyMock,
  deleteMany: mock(() => Promise.resolve({ deletedCount: 0 })) as AnyMock,
};

mock.module('../db', () => ({
  getCollection: mock(() => mockCollection),
  Collections: {
    SESSIONS: 'sessions',
  },
  getRedis: () => ({
    set: redisSetMock,
    get: redisGetMock,
    del: redisDelMock,
  }),
  isRedisConnected: () => redisConnected,
  RedisKeys: {
    session: (sessionId: string) => `session:${sessionId}`,
  },
}));

mock.module('../utils/adieuuLogger', () => ({
  default: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  },
}));

import { SessionRepository } from './session.repository';

describe('session.repository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    redisConnected = true;
    redisGetValue = null;

    redisSetMock.mockClear();
    redisGetMock.mockClear();
    redisDelMock.mockClear();

    mockCollection.findOne.mockReset();
    mockCollection.find.mockReset();
    mockCollection.insertOne.mockReset();
    mockCollection.updateOne.mockReset();
    mockCollection.updateMany.mockReset();
    mockCollection.deleteMany.mockReset();

    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.find.mockImplementation(() => ({
      limit: () => ({
        toArray: async () => [],
      }),
      toArray: async () => [],
    }));
    mockCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mockCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });
  });

  test('getSession returns cached session when redis cache is valid', async () => {
    const expiresAt = Date.now() + 60_000;
    redisGetValue = JSON.stringify({
      userId: new ObjectId().toHexString(),
      identifier: 'user@example.com',
      identifierType: 'email',
      expiresAt,
      lastActivityAt: Date.now(),
    });

    const repo = new SessionRepository();
    const result = await repo.getSession('session-1');

    expect(result).not.toBeNull();
    expect(result?.identifier).toBe('user@example.com');
    expect(mockCollection.findOne).not.toHaveBeenCalled();
  });

  test('getSession returns null and invalidates expired cached session', async () => {
    redisGetValue = JSON.stringify({
      userId: new ObjectId().toHexString(),
      identifier: 'user@example.com',
      identifierType: 'email',
      expiresAt: Date.now() - 1,
      lastActivityAt: Date.now() - 10_000,
    });

    const repo = new SessionRepository();
    const result = await repo.getSession('session-1');

    expect(result).toBeNull();
    expect(redisDelMock).toHaveBeenCalledWith('session:session-1');
  });

  test('create stores session and caches with EX ttl', async () => {
    const now = Date.now();
    const insertedId = new ObjectId();
    mockCollection.insertOne.mockResolvedValue({ insertedId });
    mockCollection.findOne.mockResolvedValue({
      _id: insertedId,
      sessionId: 'session-1',
      userId: new ObjectId(),
      identifier: 'user@example.com',
      identifierType: 'email',
      expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
      lastActivityAt: new Date(now),
      revoked: false,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });

    const repo = new SessionRepository();
    await repo.create({
      sessionId: 'session-1',
      userId: new ObjectId(),
      identifier: 'user@example.com',
      identifierType: 'email',
      expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
    });

    expect(redisSetMock).toHaveBeenCalledWith(
      'session:session-1',
      expect.any(String),
      'EX',
      expect.any(Number)
    );
  });

  test('updateLastActivity updates mongo and refreshes cached timestamp with KEEPTTL', async () => {
    redisGetValue = JSON.stringify({
      userId: new ObjectId().toHexString(),
      identifier: 'user@example.com',
      identifierType: 'email',
      expiresAt: Date.now() + 60_000,
      lastActivityAt: Date.now() - 60_000,
    });

    const repo = new SessionRepository();
    await repo.updateLastActivity('session-1');

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { sessionId: 'session-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          lastActivityAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      })
    );
    expect(redisSetMock).toHaveBeenCalledWith(
      'session:session-1',
      expect.any(String),
      'KEEPTTL'
    );
  });

  test('revokeAllForUser invalidates each session cache and marks sessions revoked', async () => {
    const userId = new ObjectId();
    mockCollection.find.mockImplementation(() => ({
      limit: () => ({
        toArray: async () => ([
          { sessionId: 's1' },
          { sessionId: 's2' },
        ]),
      }),
      toArray: async () => ([
        { sessionId: 's1' },
        { sessionId: 's2' },
      ]),
    }));
    mockCollection.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const repo = new SessionRepository();
    const result = await repo.revokeAllForUser(userId);

    expect(result).toBe(2);
    expect(redisDelMock).toHaveBeenCalledWith('session:s1');
    expect(redisDelMock).toHaveBeenCalledWith('session:s2');
    expect(mockCollection.updateMany).toHaveBeenCalledWith(
      { userId, revoked: false },
      expect.objectContaining({
        $set: expect.objectContaining({
          revoked: true,
          updatedAt: expect.any(Date),
        }),
      })
    );
  });
});

