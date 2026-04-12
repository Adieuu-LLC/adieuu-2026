import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockToArray = mock(() => Promise.resolve([])) as AnyMock;
const mockLimit = mock(() => ({ toArray: mockToArray })) as AnyMock;
const mockSort = mock(() => ({ limit: mockLimit })) as AnyMock;
const mockFind = mock(() => ({ sort: mockSort })) as AnyMock;

const mockCollection = {
  find: mockFind as AnyMock,
  findOne: mock(() => Promise.resolve(null)) as AnyMock,
  insertOne: mock(() => Promise.resolve({ insertedId: new ObjectId() })) as AnyMock,
  updateOne: mock(() => Promise.resolve({ modifiedCount: 0 })) as AnyMock,
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
    MESSAGES: 'messages',
  },
}));

import { MessageRepository } from './message.repository';

function resetMocks() {
  mockFind.mockReset();
  mockSort.mockReset();
  mockLimit.mockReset();
  mockToArray.mockReset();

  mockToArray.mockResolvedValue([]);
  mockLimit.mockReturnValue({ toArray: mockToArray });
  mockSort.mockReturnValue({ limit: mockLimit });
  mockFind.mockReturnValue({ sort: mockSort });
}

describe('MessageRepository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(resetMocks);

  const conversationId = new ObjectId();

  test('findByConversation filters by conversation only when no cursor', async () => {
    const repo = new MessageRepository();
    await repo.findByConversation(conversationId, 25);

    expect(mockFind).toHaveBeenCalledWith({ conversationId });
    expect(mockSort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(mockLimit).toHaveBeenCalledWith(25);
  });

  test('findByConversation with cursor defaults to $gt (desc pagination)', async () => {
    const repo = new MessageRepository();
    const cursor = new ObjectId();
    await repo.findByConversation(conversationId, 50, cursor);

    expect(mockFind).toHaveBeenCalledWith({
      conversationId,
      _id: { $gt: cursor },
    });
  });

  test('findByConversation with cursor and direction asc uses $lt', async () => {
    const repo = new MessageRepository();
    const cursor = new ObjectId();
    await repo.findByConversation(conversationId, 50, cursor, 'asc');

    expect(mockFind).toHaveBeenCalledWith({
      conversationId,
      _id: { $lt: cursor },
    });
  });

  test('findByConversation with cursor and direction desc uses $gt', async () => {
    const repo = new MessageRepository();
    const cursor = new ObjectId();
    await repo.findByConversation(conversationId, 50, cursor, 'desc');

    expect(mockFind).toHaveBeenCalledWith({
      conversationId,
      _id: { $gt: cursor },
    });
  });
});
