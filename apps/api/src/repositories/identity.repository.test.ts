import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

// Mock config
mock.module('../config', () => ({
  config: {
    env: 'test',
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
  },
}));

// Mock collection
const mockCollection = {
  findOne: mock(() => Promise.resolve(null)),
  find: mock(() => ({
    toArray: mock(() => Promise.resolve([])),
  })),
  insertOne: mock(() => Promise.resolve({ insertedId: new ObjectId() })),
  updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })),
  findOneAndUpdate: mock(() => Promise.resolve({ value: null })),
  deleteOne: mock(() => Promise.resolve({ deletedCount: 1 })),
};

mock.module('../db', () => ({
  getCollection: mock(() => mockCollection),
  Collections: {
    IDENTITIES: 'identities',
  },
}));

// Import after mocking
import { IdentityRepository, getIdentityRepository } from './identity.repository';
import { DELETED_IDENT } from '../models/identity';

describe('IdentityRepository', () => {
  let repo: IdentityRepository;

  const mockIdentity = {
    _id: new ObjectId(),
    ident: 'test-hash-123',
    hashVersion: 1,
    username: 'testuser',
    displayName: 'Test User',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActiveAt: new Date(),
  };

  beforeEach(() => {
    repo = new IdentityRepository();

    // Reset mocks
    mockCollection.findOne.mockReset();
    mockCollection.find.mockReset();
    mockCollection.insertOne.mockReset();
    mockCollection.updateOne.mockReset();
    mockCollection.findOneAndUpdate.mockReset();
    mockCollection.deleteOne.mockReset();

    // Set default implementations
    mockCollection.findOne.mockImplementation(() => Promise.resolve(null));
    mockCollection.find.mockImplementation(() => ({
      toArray: () => Promise.resolve([]),
    }));
    mockCollection.insertOne.mockImplementation(() =>
      Promise.resolve({ insertedId: mockIdentity._id })
    );
    mockCollection.updateOne.mockImplementation(() =>
      Promise.resolve({ modifiedCount: 1 })
    );
  });

  describe('findByIdent', () => {
    test('returns null when identity not found', async () => {
      mockCollection.findOne.mockImplementation(() => Promise.resolve(null));

      const result = await repo.findByIdent('nonexistent-hash');

      expect(result).toBeNull();
      expect(mockCollection.findOne).toHaveBeenCalledWith({ ident: 'nonexistent-hash' });
    });

    test('returns identity when found', async () => {
      mockCollection.findOne.mockImplementation(() => Promise.resolve(mockIdentity));

      const result = await repo.findByIdent('test-hash-123');

      expect(result).toEqual(mockIdentity);
    });
  });

  describe('findActiveByIdent', () => {
    test('returns null when identity is deleted', async () => {
      const deletedIdentity = { ...mockIdentity, ident: DELETED_IDENT };
      mockCollection.findOne.mockImplementation(({ ident }) =>
        Promise.resolve(ident === DELETED_IDENT ? null : deletedIdentity)
      );

      const result = await repo.findActiveByIdent(DELETED_IDENT);

      expect(result).toBeNull();
    });

    test('returns identity when active', async () => {
      mockCollection.findOne.mockImplementation(() => Promise.resolve(mockIdentity));

      const result = await repo.findActiveByIdent('test-hash-123');

      expect(result).toEqual(mockIdentity);
    });
  });

  describe('findByUsername', () => {
    test('returns null when username not found', async () => {
      mockCollection.findOne.mockImplementation(() => Promise.resolve(null));

      const result = await repo.findByUsername('nonexistent');

      expect(result).toBeNull();
      expect(mockCollection.findOne).toHaveBeenCalledWith({ username: 'nonexistent' });
    });

    test('returns identity when found', async () => {
      mockCollection.findOne.mockImplementation(() => Promise.resolve(mockIdentity));

      const result = await repo.findByUsername('testuser');

      expect(result).toEqual(mockIdentity);
    });
  });

  describe('findByIdentityId', () => {
    test('returns null when identity not found', async () => {
      mockCollection.findOne.mockImplementation(() => Promise.resolve(null));

      const result = await repo.findByIdentityId(new ObjectId().toHexString());

      expect(result).toBeNull();
    });

    test('returns identity when found', async () => {
      mockCollection.findOne.mockImplementation(() => Promise.resolve(mockIdentity));

      const result = await repo.findByIdentityId(mockIdentity._id.toHexString());

      expect(result).toEqual(mockIdentity);
    });

    test('handles ObjectId input', async () => {
      mockCollection.findOne.mockImplementation(() => Promise.resolve(mockIdentity));

      const result = await repo.findByIdentityId(mockIdentity._id);

      expect(result).toEqual(mockIdentity);
    });
  });

  describe('create', () => {
    test('creates identity with required fields', async () => {
      const input = {
        ident: 'new-hash',
        hashVersion: 1,
        username: 'newuser',
        displayName: 'New User',
      };

      mockCollection.insertOne.mockImplementation(() =>
        Promise.resolve({ insertedId: new ObjectId() })
      );
      mockCollection.findOne.mockImplementation(() =>
        Promise.resolve({ ...input, _id: new ObjectId(), createdAt: new Date(), updatedAt: new Date(), lastActiveAt: new Date() })
      );

      const result = await repo.create(input);

      expect(result).toBeDefined();
      expect(mockCollection.insertOne).toHaveBeenCalled();
    });
  });

  describe('updateLastActive', () => {
    test('updates lastActiveAt field', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ modifiedCount: 1 })
      );

      await repo.updateLastActive(mockIdentity._id);

      expect(mockCollection.updateOne).toHaveBeenCalled();
    });

    test('handles string ID', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ modifiedCount: 1 })
      );

      await repo.updateLastActive(mockIdentity._id.toHexString());

      expect(mockCollection.updateOne).toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    test('sets ident to DELETED_IDENT', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ modifiedCount: 1 })
      );

      const result = await repo.softDelete(mockIdentity._id);

      expect(result).toBe(true);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(ObjectId) },
        expect.objectContaining({
          $set: expect.objectContaining({
            ident: DELETED_IDENT,
          }),
        })
      );
    });

    test('returns false when identity not found', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ modifiedCount: 0 })
      );

      const result = await repo.softDelete(new ObjectId());

      expect(result).toBe(false);
    });
  });

  describe('upgradeHashVersion', () => {
    test('updates ident and hashVersion', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ modifiedCount: 1 })
      );

      const result = await repo.upgradeHashVersion(
        mockIdentity._id,
        'new-hash',
        2
      );

      expect(result).toBe(true);
      expect(mockCollection.updateOne).toHaveBeenCalled();
    });

    test('returns false when identity not found', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ modifiedCount: 0 })
      );

      const result = await repo.upgradeHashVersion(
        new ObjectId(),
        'new-hash',
        2
      );

      expect(result).toBe(false);
    });
  });

  describe('getIdentityRepository', () => {
    test('returns singleton instance', () => {
      const repo1 = getIdentityRepository();
      const repo2 = getIdentityRepository();

      expect(repo1).toBe(repo2);
    });
  });
});
