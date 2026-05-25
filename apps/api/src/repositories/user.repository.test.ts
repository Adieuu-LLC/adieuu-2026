import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

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
    USERS: 'users',
  },
}));

import { UserRepository } from './user.repository';

describe('user.repository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockCollection.findOne.mockReset();
    mockCollection.insertOne.mockReset();
    mockCollection.updateOne.mockReset();

    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  test('findByEmail lowercases email in query', async () => {
    const repo = new UserRepository();
    await repo.findByEmail('User@Example.COM');

    expect(mockCollection.findOne).toHaveBeenCalledWith({ email: 'user@example.com' });
  });

  test('findByPhone queries exact phone value', async () => {
    const repo = new UserRepository();
    await repo.findByPhone('+15551234567');

    expect(mockCollection.findOne).toHaveBeenCalledWith({ phone: '+15551234567' });
  });

  test('findByIdentifier routes email identifiers to findByEmail', async () => {
    const repo = new UserRepository();
    await repo.findByIdentifier('user@example.com');

    expect(mockCollection.findOne).toHaveBeenCalledWith({ email: 'user@example.com' });
  });

  test('findByIdentifier routes phone identifiers to findByPhone', async () => {
    const repo = new UserRepository();
    await repo.findByIdentifier('+15551234567');

    expect(mockCollection.findOne).toHaveBeenCalledWith({ phone: '+15551234567' });
  });

  test('incrementFailedAttempts increments counter', async () => {
    const repo = new UserRepository();
    const userId = new ObjectId();
    await repo.incrementFailedAttempts(userId);

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      expect.objectContaining({
        $inc: { failedAttempts: 1 },
      }),
    );
  });

  test('lockAccount sets lockedUntil timestamp', async () => {
    const repo = new UserRepository();
    const userId = new ObjectId();
    const until = new Date('2030-01-01T00:00:00Z');
    await repo.lockAccount(userId, until);

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      expect.objectContaining({
        $set: expect.objectContaining({ lockedUntil: until }),
      }),
    );
  });

  test('create stores normalized email and default counters', async () => {
    const repo = new UserRepository();
    mockCollection.insertOne.mockImplementation(async (doc: Record<string, unknown>) => ({
      insertedId: new ObjectId(),
      ...doc,
    }));

    const created = await repo.create({
      email: 'User@Example.COM',
      emailVerified: true,
    });

    expect(created.email).toBe('user@example.com');
    expect(created.failedAttempts).toBe(0);
  });
});
