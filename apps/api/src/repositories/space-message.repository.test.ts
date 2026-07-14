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
  Collections: { SPACE_MESSAGES: 'space_messages' },
}));

import { SpaceMessageRepository } from './space-message.repository';

describe('SpaceMessageRepository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockCollection.insertOne.mockClear();
    mockCollection.findOne.mockClear();
    mockCollection.find.mockClear();
    findResult.sort.mockClear();
    findResult.limit.mockClear();
    findResult.toArray.mockClear();
    findResult.toArray.mockResolvedValue([]);
    lastFindFilter = null;
  });

  test('createMessage persists plaintext content and clientMessageId', async () => {
    const repo = new SpaceMessageRepository();
    await repo.createMessage({
      spaceId: new ObjectId(),
      channelId: new ObjectId(),
      fromIdentityId: new ObjectId(),
      content: 'hello',
      clientMessageId: 'client-1',
    });
    const [doc] = mockCollection.insertOne.mock.calls[0]!;
    expect(doc.content).toBe('hello');
    expect(doc.clientMessageId).toBe('client-1');
  });

  test('findByClientMessageId scopes to the channel for dedup', async () => {
    const repo = new SpaceMessageRepository();
    const channelId = new ObjectId();
    await repo.findByClientMessageId(channelId, 'client-1');
    expect(mockCollection.findOne).toHaveBeenCalledWith({
      channelId,
      clientMessageId: 'client-1',
    });
  });

  test('findByChannel defaults to newer-than semantics with a cursor', async () => {
    const repo = new SpaceMessageRepository();
    const channelId = new ObjectId();
    const cursor = new ObjectId();
    await repo.findByChannel(channelId, 50, cursor);
    expect(lastFindFilter._id).toEqual({ $gt: cursor });
    expect(findResult.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  });

  test('findByChannel asc returns messages older than the cursor', async () => {
    const repo = new SpaceMessageRepository();
    const channelId = new ObjectId();
    const cursor = new ObjectId();
    await repo.findByChannel(channelId, 50, cursor, 'asc');
    expect(lastFindFilter._id).toEqual({ $lt: cursor });
  });
});
