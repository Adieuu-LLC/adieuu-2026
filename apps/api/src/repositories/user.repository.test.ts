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
    mockCollection.find.mockReset();
    mockCollection.insertOne.mockReset();
    mockCollection.updateOne.mockReset();

    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
    mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mockCollection.find.mockImplementation(() => ({
      sort: mock(() => ({
        limit: mock(() => ({
          toArray: mock(() => Promise.resolve([])),
        })),
      })),
      limit: mock(() => ({
        toArray: mock(() => Promise.resolve([])),
      })),
      toArray: mock(() => Promise.resolve([])),
    }));
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

  test('searchByIdentifier uses literal substring match via $indexOfCP for email queries', async () => {
    const repo = new UserRepository();
    const mockToArray = mock(() => Promise.resolve([]));
    mockCollection.find.mockImplementationOnce(() => ({
      sort: mock(() => ({
        limit: mock(() => ({
          toArray: mockToArray,
        })),
      })),
    }));

    await repo.searchByIdentifier('User@Example.COM');

    expect(mockCollection.find).toHaveBeenCalledWith({
      email: { $exists: true, $type: 'string' },
      $expr: {
        $gte: [{ $indexOfCP: [{ $toLower: '$email' }, 'user@example.com'] }, 0],
      },
    });
    expect(mockToArray).toHaveBeenCalled();
  });

  test('searchByIdentifier does not pass user input as $regex operator', async () => {
    const repo = new UserRepository();
    const maliciousQuery = 'user+(a)@example.com';
    const mockToArray = mock(() => Promise.resolve([]));
    mockCollection.find.mockImplementationOnce(() => ({
      sort: mock(() => ({
        limit: mock(() => ({
          toArray: mockToArray,
        })),
      })),
    }));

    await repo.searchByIdentifier(maliciousQuery);

    expect(mockCollection.find).toHaveBeenCalledTimes(1);
    const filter = mockCollection.find.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(filter).not.toHaveProperty('$regex');
    expect(JSON.stringify(filter)).not.toContain('$regex');
    const expr = filter.$expr as {
      $gte: [{ $indexOfCP: [{ $toLower: string }, string] }, number];
    };
    expect(expr.$gte[0].$indexOfCP[0]).toEqual({ $toLower: '$email' });
    expect(expr.$gte[0].$indexOfCP[1]).toBe('user+a@example.com');
  });

  test('updateCompliance merges fields with dot-notation instead of replacing compliance object', async () => {
    const repo = new UserRepository();
    const userId = new ObjectId();
    const completedAt = new Date('2024-06-01T00:00:00Z');

    await repo.updateCompliance(userId, {
      attestedUtahResidency: true,
      vpnAttestationPending: undefined,
      lastVpnAttestation: {
        ipHash: 'abc123',
        completedAt,
        sanctionedMembership: false,
        utahResidency: true,
      },
    });

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      expect.objectContaining({
        $set: expect.objectContaining({
          'compliance.attestedUtahResidency': true,
          'compliance.lastVpnAttestation': {
            ipHash: 'abc123',
            completedAt,
            sanctionedMembership: false,
            utahResidency: true,
          },
          updatedAt: expect.any(Date),
        }),
        $unset: { 'compliance.vpnAttestationPending': '' },
      }),
    );
    const updateArg = mockCollection.updateOne.mock.calls.at(-1)?.[1] as {
      $set?: Record<string, unknown>;
    };
    expect(updateArg.$set).not.toHaveProperty('compliance');
  });

  test('searchByIdentifier returns empty array for blank query', async () => {
    const repo = new UserRepository();
    const results = await repo.searchByIdentifier('   ');
    expect(results).toEqual([]);
    expect(mockCollection.find).not.toHaveBeenCalled();
  });

  test('banAccount stores moderationCountryCode for OFAC bans', async () => {
    const repo = new UserRepository();
    const userId = new ObjectId();

    await repo.banAccount(userId, {
      reason: 'You connected from an IP address associated with Mali, which is subject to US sanctions. We are unable to provide service. Appeals are not available.',
      moderatedBy: 'system:compliance',
      category: 'ofac_sanctioned',
      countryCode: 'ml',
    });

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      expect.objectContaining({
        $set: expect.objectContaining({
          isBanned: true,
          moderationCategory: 'ofac_sanctioned',
          moderationCountryCode: 'ML',
        }),
      }),
    );
  });

  test('unbanAccount clears moderationCountryCode', async () => {
    const repo = new UserRepository();
    const userId = new ObjectId();

    await repo.unbanAccount(userId);

    expect(mockCollection.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      expect.objectContaining({
        $unset: expect.objectContaining({
          moderationCountryCode: '',
        }),
      }),
    );
  });
});
