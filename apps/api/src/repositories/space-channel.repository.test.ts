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
  Collections: { SPACE_CHANNELS: 'space_channels' },
}));

import { SpaceChannelRepository } from './space-channel.repository';

describe('SpaceChannelRepository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockCollection.insertOne.mockClear();
    mockCollection.findOne.mockClear();
    mockCollection.updateOne.mockClear();
    mockCollection.deleteMany.mockClear();
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });
    mockCollection.find.mockClear();
    findResult.sort.mockClear();
    findResult.limit.mockClear();
    findResult.toArray.mockClear();
    findResult.toArray.mockResolvedValue([]);
    lastFindFilter = null;
  });

  test('createChannel persists the input and stamps timestamps', async () => {
    const repo = new SpaceChannelRepository();
    const spaceId = new ObjectId();
    const channel = await repo.createChannel({
      spaceId,
      type: 'text',
      name: 'general',
      position: 0,
    });
    expect(channel.name).toBe('general');
    const [doc] = mockCollection.insertOne.mock.calls[0]!;
    expect(doc.spaceId).toBe(spaceId);
    expect(doc.type).toBe('text');
    expect(doc.position).toBe(0);
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });

  test('findBySpace orders by position then _id ascending', async () => {
    const repo = new SpaceChannelRepository();
    const spaceId = new ObjectId();
    await repo.findBySpace(spaceId);
    expect(lastFindFilter).toEqual({ spaceId });
    expect(findResult.sort).toHaveBeenCalledWith({ position: 1, _id: 1 });
  });

  test('findByIdInSpace scopes by channel and space', async () => {
    const repo = new SpaceChannelRepository();
    const spaceId = new ObjectId();
    const channelId = new ObjectId();
    await repo.findByIdInSpace(spaceId, channelId);
    expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: channelId, spaceId });
  });

  test('deleteBySpace removes all channels and returns the deleted count', async () => {
    const repo = new SpaceChannelRepository();
    const spaceId = new ObjectId();
    mockCollection.deleteMany.mockResolvedValueOnce({ deletedCount: 3 });
    const count = await repo.deleteBySpace(spaceId);
    expect(count).toBe(3);
    expect(mockCollection.deleteMany).toHaveBeenCalledWith({ spaceId });
  });
});
