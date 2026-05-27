import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

// Mock config
mock.module('../config', () => ({
  config: {
    env: 'test',
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
  },
}));

// Mock collection - use 'any' for test flexibility with dynamic mock implementations
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
  bulkWrite: mock(() => Promise.resolve({ modifiedCount: 0 })) as AnyMock,
  findOneAndUpdate: mock(() => Promise.resolve({ value: null })) as AnyMock,
  deleteOne: mock(() => Promise.resolve({ deletedCount: 1 })) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../db', () => ({
  getCollection: mock(() => mockCollection),
  Collections: {
    IDENTITIES: 'identities',
  },
}));

// Import after mocking
import { IdentityRepository, getIdentityRepository } from './identity.repository';
import { DELETED_IDENT_PREFIX } from '../models/identity';

describe('IdentityRepository', () => {
  afterAll(() => {
    mock.restore();
  });

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
    mockCollection.bulkWrite.mockReset();

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
    mockCollection.bulkWrite.mockImplementation(() =>
      Promise.resolve({ matchedCount: 0, modifiedCount: 0, upsertedCount: 0 } as never)
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
      const deletedIdent = `${DELETED_IDENT_PREFIX}${mockIdentity._id.toHexString()}`;
      const deletedIdentity = { ...mockIdentity, ident: deletedIdent };
      mockCollection.findOne.mockImplementation(({ ident }) =>
        Promise.resolve(ident === deletedIdent ? null : deletedIdentity)
      );

      const result = await repo.findActiveByIdent(deletedIdent);

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
    test('sets ident to deleted prefix with objectId', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ modifiedCount: 1 })
      );

      const result = await repo.softDelete(mockIdentity._id);

      expect(result).toBe(true);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(ObjectId) },
        expect.objectContaining({
          $set: expect.objectContaining({
            ident: expect.stringMatching(new RegExp(`^${DELETED_IDENT_PREFIX}`)),
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

  describe('updateDeviceActivity', () => {
    test('updates lastActiveAt for device', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ modifiedCount: 1 })
      );

      const result = await repo.updateDeviceActivity(mockIdentity._id, 'device-123');

      expect(result).toBe(true);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(ObjectId), 'devices.deviceId': 'device-123' },
        expect.objectContaining({
          $set: expect.objectContaining({
            'devices.$.lastActiveAt': expect.any(Date),
          }),
        })
      );
    });

    test('returns false when device not found', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ modifiedCount: 0 })
      );

      const result = await repo.updateDeviceActivity(mockIdentity._id, 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('updateDeviceName', () => {
    test('updates name for device', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
      );

      const result = await repo.updateDeviceName(mockIdentity._id, 'device-123', 'New Name');

      expect(result).toBe(true);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(ObjectId), 'devices.deviceId': 'device-123' },
        expect.objectContaining({
          $set: expect.objectContaining({
            'devices.$.name': 'New Name',
          }),
        })
      );
    });

    test('returns false when device not found', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ matchedCount: 0, modifiedCount: 0 })
      );

      const result = await repo.updateDeviceName(mockIdentity._id, 'nonexistent', 'New Name');

      expect(result).toBe(false);
    });
  });

  describe('setDeviceStaticKeyAttestation', () => {
    test('sets attestation on matching device', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ matchedCount: 1, modifiedCount: 1 })
      );

      const result = await repo.setDeviceStaticKeyAttestation(
        mockIdentity._id,
        'device-123',
        'YmFzZTY0LXNpZw'
      );

      expect(result).toBe(true);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: expect.any(ObjectId), 'devices.deviceId': 'device-123' },
        expect.objectContaining({
          $set: expect.objectContaining({
            'devices.$.staticKeyAttestation': 'YmFzZTY0LXNpZw',
          }),
        })
      );
    });

    test('returns false when device not found', async () => {
      mockCollection.updateOne.mockImplementation(() =>
        Promise.resolve({ matchedCount: 0, modifiedCount: 0 })
      );

      const result = await repo.setDeviceStaticKeyAttestation(
        mockIdentity._id,
        'nonexistent',
        'YmFzZTY0LXNpZw'
      );

      expect(result).toBe(false);
    });
  });

  describe('getDevices', () => {
    test('returns empty array when no devices', async () => {
      mockCollection.findOne.mockImplementation(() =>
        Promise.resolve({ ...mockIdentity, devices: [] })
      );

      const result = await repo.getDevices(mockIdentity._id);

      expect(result).toEqual([]);
    });

    test('returns devices when present', async () => {
      const devices = [
        {
          deviceId: 'device-1',
          name: 'Device 1',
          ecdhPublicKey: 'key1',
          registeredAt: new Date(),
          lastActiveAt: new Date(),
        },
        {
          deviceId: 'device-2',
          name: 'Device 2',
          ecdhPublicKey: 'key2',
          registeredAt: new Date(),
          lastActiveAt: new Date(),
        },
      ];

      mockCollection.findOne.mockImplementation(() =>
        Promise.resolve({ ...mockIdentity, devices })
      );

      const result = await repo.getDevices(mockIdentity._id);

      expect(result).toEqual(devices);
    });

    test('returns empty array when identity not found', async () => {
      mockCollection.findOne.mockImplementation(() => Promise.resolve(null));

      const result = await repo.getDevices(new ObjectId());

      expect(result).toEqual([]);
    });
  });

  describe('activity stat counters', () => {
    test('incrementMessagesSentCount issues $inc on messagesSentCount', async () => {
      await repo.incrementMessagesSentCount(mockIdentity._id);
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: mockIdentity._id },
        { $inc: { messagesSentCount: 1 } },
        { session: undefined },
      );
    });

    test('incrementConversationsJoinedCounts uses bulkWrite when multiple ids', async () => {
      const id2 = new ObjectId();
      await repo.incrementConversationsJoinedCounts([mockIdentity._id, id2]);

      expect(mockCollection.bulkWrite).toHaveBeenCalledTimes(1);
      const [ops, opts] = mockCollection.bulkWrite.mock.calls[0]!;
      expect(opts).toMatchObject({ ordered: false });
      expect(ops).toHaveLength(2);
      expect(ops![0]).toMatchObject({
        updateOne: {
          filter: { _id: mockIdentity._id },
          update: { $inc: { conversationsJoinedCount: 1 } },
        },
      });
    });

    test('incrementConversationsJoinedCounts no-ops empty array without bulkWrite', async () => {
      await repo.incrementConversationsJoinedCounts([]);
      expect(mockCollection.bulkWrite).not.toHaveBeenCalled();
    });

    test('incrementFriendCounts bumps both identities', async () => {
      const idb = new ObjectId();
      await repo.incrementFriendCounts(mockIdentity._id, idb);
      expect(mockCollection.updateOne).toHaveBeenCalledTimes(2);
      expect(mockCollection.updateOne.mock.calls[0]![1]).toEqual({ $inc: { friendCount: 1 } });
    });

    test('decrementFriendCounts uses aggregation pipeline clamped at zero', async () => {
      const idb = new ObjectId();
      await repo.decrementFriendCounts(mockIdentity._id, idb);
      expect(mockCollection.updateOne).toHaveBeenCalledTimes(2);
      expect(Array.isArray(mockCollection.updateOne.mock.calls[0]![1])).toBe(true);
    });

    test('findActivityStatsProjection returns partial doc', async () => {
      mockCollection.findOne.mockImplementationOnce(() =>
        Promise.resolve({
          messagesSentCount: 2,
          conversationsJoinedCount: 3,
          friendCount: 4,
          achievementsEarnedCount: 5,
        }),
      );
      const row = await repo.findActivityStatsProjection(mockIdentity._id);
      expect(row?.messagesSentCount).toBe(2);
      expect(row?.conversationsJoinedCount).toBe(3);
      expect(row?.friendCount).toBe(4);
      expect(row?.achievementsEarnedCount).toBe(5);
    });
  });

  describe('searchForAdmin', () => {
    test('uses literal substring match via $indexOfCP for text queries', async () => {
      const mockToArray = mock(() => Promise.resolve([]));
      mockCollection.find.mockImplementationOnce(() => ({
        sort: mock(() => ({
          limit: mock(() => ({
            toArray: mockToArray,
          })),
        })),
      }));

      await repo.searchForAdmin('Test User');

      expect(mockCollection.find).toHaveBeenCalledWith({
        ident: { $not: { $regex: `^${DELETED_IDENT_PREFIX}` } },
        $expr: {
          $or: [
            { $gte: [{ $indexOfCP: [{ $toLower: '$username' }, 'test user'] }, 0] },
            { $gte: [{ $indexOfCP: [{ $toLower: '$displayName' }, 'test user'] }, 0] },
          ],
        },
      });
      expect(mockToArray).toHaveBeenCalled();
    });

    test('does not pass user input as $regex on username or displayName', async () => {
      mockCollection.find.mockImplementationOnce(() => ({
        sort: mock(() => ({
          limit: mock(() => ({
            toArray: mock(() => Promise.resolve([])),
          })),
        })),
      }));

      await repo.searchForAdmin('(a+)+$');

      const filter = mockCollection.find.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(JSON.stringify(filter)).not.toMatch(/\$regex":"\(\?i\)/);
      expect((filter.$expr as { $or: unknown[] }).$or).toEqual([
        { $gte: [{ $indexOfCP: [{ $toLower: '$username' }, '(a+)+$'] }, 0] },
        { $gte: [{ $indexOfCP: [{ $toLower: '$displayName' }, '(a+)+$'] }, 0] },
      ]);
    });

    test('returns empty array for blank query', async () => {
      const results = await repo.searchForAdmin('   ');
      expect(results).toEqual([]);
      expect(mockCollection.find).not.toHaveBeenCalled();
    });

    test('looks up by ObjectId when query is a valid id', async () => {
      const objectId = new ObjectId();
      mockCollection.findOne.mockImplementationOnce(() => Promise.resolve(mockIdentity));

      const results = await repo.searchForAdmin(objectId.toHexString());

      expect(results).toHaveLength(1);
      expect(mockCollection.find).not.toHaveBeenCalled();
    });
  });
});
