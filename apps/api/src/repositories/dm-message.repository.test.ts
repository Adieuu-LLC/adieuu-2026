import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

mock.module('../config', () => ({
  config: {
    env: 'test',
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
  },
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const mockCollection = {
  findOne: mock(() => Promise.resolve(null)) as AnyMock,
  find: mock(() => ({
    sort: mock(() => ({
      limit: mock(() => ({
        toArray: mock(() => Promise.resolve([])),
      })),
    })),
    toArray: mock(() => Promise.resolve([])),
  })) as AnyMock,
  insertOne: mock(() => Promise.resolve({ insertedId: new ObjectId() })) as AnyMock,
  updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })) as AnyMock,
  distinct: mock(() => Promise.resolve([])) as AnyMock,
  aggregate: mock(() => ({
    toArray: mock(() => Promise.resolve([])),
  })) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../db', () => ({
  getCollection: mock(() => mockCollection),
  Collections: {
    DM_MESSAGES: 'dm_messages',
  },
}));

import { DmMessageRepository } from './dm-message.repository';

describe('DmMessageRepository', () => {
  let repo: DmMessageRepository;

  const mockMessageId = new ObjectId();
  const mockConversationId = 'a'.repeat(64);
  const mockIdentityId = new ObjectId();

  const mockMessage = {
    _id: mockMessageId,
    conversationId: mockConversationId,
    toIdentityId: mockIdentityId,
    encryptedSenderId: 'encrypted-sender-base64',
    ciphertext: 'encrypted-content-base64',
    nonce: 'nonce-base64',
    wrappedKeys: [],
    signature: 'signature-base64',
    cryptoProfile: 'default' as const,
    clientMessageId: 'client-msg-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedForEveryone: false,
    deletedFor: [],
  };

  beforeEach(() => {
    repo = new DmMessageRepository();

    mockCollection.findOne.mockReset();
    mockCollection.find.mockReset();
    mockCollection.insertOne.mockReset();
    mockCollection.updateOne.mockReset();
    mockCollection.distinct.mockReset();
    mockCollection.aggregate.mockReset();

    mockCollection.findOne.mockImplementation(() => Promise.resolve(null));
    mockCollection.insertOne.mockImplementation(() =>
      Promise.resolve({ insertedId: mockMessageId })
    );
    mockCollection.updateOne.mockImplementation(() =>
      Promise.resolve({ modifiedCount: 1 })
    );
  });

  describe('findById', () => {
    test('returns null when message not found', async () => {
      mockCollection.findOne.mockImplementation(() => Promise.resolve(null));

      const result = await repo.findById(new ObjectId());

      expect(result).toBeNull();
    });

    test('returns message when found', async () => {
      mockCollection.findOne.mockImplementation(() => Promise.resolve(mockMessage));

      const result = await repo.findById(mockMessageId);

      expect(result).toEqual(mockMessage);
    });
  });

  describe('deleteForEveryone', () => {
    test('sets deletedForEveryone to true', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ modifiedCount: 1 })
      );

      const result = await repo.deleteForEveryone(mockMessageId, mockIdentityId);

      expect(result).toBe(true);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: mockMessageId },
        expect.objectContaining({
          $set: expect.objectContaining({
            deletedForEveryone: true,
          }),
        })
      );
    });

    test('returns false when message not found', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ modifiedCount: 0 })
      );

      const result = await repo.deleteForEveryone(new ObjectId(), mockIdentityId);

      expect(result).toBe(false);
    });
  });

  describe('deleteForSelf', () => {
    test('adds identity to deletedFor array', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ modifiedCount: 1 })
      );

      const result = await repo.deleteForSelf(mockMessageId, mockIdentityId);

      expect(result).toBe(true);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: mockMessageId,
          deletedFor: { $ne: mockIdentityId },
        }),
        expect.objectContaining({
          $addToSet: { deletedFor: mockIdentityId },
        })
      );
    });

    test('returns false when already deleted for self', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ modifiedCount: 0 })
      );

      const result = await repo.deleteForSelf(mockMessageId, mockIdentityId);

      expect(result).toBe(false);
    });
  });
});
