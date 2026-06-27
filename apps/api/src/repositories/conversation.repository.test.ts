import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockCollection = {
  updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })) as AnyMock,
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
    CONVERSATIONS: 'conversations',
  },
}));

import { ConversationRepository } from './conversation.repository';

describe('ConversationRepository', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockCollection.updateOne.mockReset();
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  const conversationId = new ObjectId();

  test('incrementMessageCount uses $inc with default delta of 1', async () => {
    const repo = new ConversationRepository();
    await repo.incrementMessageCount(conversationId);

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { _id: conversationId },
      { $inc: { messageCount: 1 } },
    );
  });

  test('incrementMessageCount respects custom delta', async () => {
    const repo = new ConversationRepository();
    await repo.incrementMessageCount(conversationId, 5);

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { _id: conversationId },
      { $inc: { messageCount: 5 } },
    );
  });

  test('setMessageCount uses $set with exact value', async () => {
    const repo = new ConversationRepository();
    await repo.setMessageCount(conversationId, 42);

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { _id: conversationId },
      { $set: { messageCount: 42 } },
    );
  });
});
