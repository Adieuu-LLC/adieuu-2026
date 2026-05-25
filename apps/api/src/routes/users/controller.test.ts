import { afterAll, beforeEach, describe, expect, test, mock } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
const mockFindById = mock(() => Promise.resolve(null)) as AnyMock;

// Mock config to avoid loading env
mock.module('../../config', () => ({
  config: {
    env: 'test',
    security: {
      sessionSecret: 'test-secret',
      otpSecret: 'test-otp-secret',
    },
  },
}));

// Mock db submodules to prevent them from loading real config
mock.module('../../db/mongo', () => ({
  connectMongo: mock(() => Promise.resolve()),
  disconnectMongo: mock(() => Promise.resolve()),
  getDb: mock(() => ({})),
  getCollection: mock(() => ({
    findOne: mock(() => Promise.resolve(null)),
    insertOne: mock(() => Promise.resolve({ insertedId: 'test-id' })),
    updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })),
    deleteOne: mock(() => Promise.resolve({ deletedCount: 1 })),
  })),
  checkMongoHealth: mock(() => Promise.resolve({ status: 'up', latencyMs: 5 })),
  initializeCollections: mock(() => Promise.resolve([])),
  Collections: {
    USERS: 'users',
    SESSIONS: 'sessions',
    AUDIT_LOGS: 'audit_logs',
  },
}));

mock.module('../../db/redis', () => ({
  connectRedis: mock(() => Promise.resolve()),
  disconnectRedis: mock(() => Promise.resolve()),
  getRedis: mock(() => ({})),
  isRedisConnected: mock(() => true),
  checkRedisHealth: mock(() => Promise.resolve({ status: 'up', latencyMs: 2 })),
  RedisKeys: {
    otp: (id: string) => `otp:${id}`,
    rateLimit: (action: string, id: string) => `rate:${action}:${id}`,
    session: (id: string) => `session:${id}`,
  },
}));

mock.module('../../db', () => ({
  connectMongo: mock(() => Promise.resolve()),
  disconnectMongo: mock(() => Promise.resolve()),
  getDb: mock(() => ({})),
  getCollection: mock(() => ({
    findOne: mock(() => Promise.resolve(null)),
    insertOne: mock(() => Promise.resolve({ insertedId: 'test-id' })),
    updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })),
    deleteOne: mock(() => Promise.resolve({ deletedCount: 1 })),
  })),
  checkMongoHealth: mock(() => Promise.resolve({ status: 'up', latencyMs: 5 })),
  initializeCollections: mock(() => Promise.resolve([])),
  Collections: {
    USERS: 'users',
    SESSIONS: 'sessions',
    AUDIT_LOGS: 'audit_logs',
  },
  connectRedis: mock(() => Promise.resolve()),
  disconnectRedis: mock(() => Promise.resolve()),
  getRedis: mock(() => ({})),
  isRedisConnected: mock(() => true),
  checkRedisHealth: mock(() => Promise.resolve({ status: 'up', latencyMs: 2 })),
  RedisKeys: {
    otp: (id: string) => `otp:${id}`,
    rateLimit: (action: string, id: string) => `rate:${action}:${id}`,
    session: (id: string) => `session:${id}`,
  },
}));

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mockFindById,
  }),
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { getUserById, getCurrentUserProfile, type User, type GetUserResult } from './controller';

describe('users controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockFindById.mockReset();
    mockFindById.mockImplementation(() => Promise.resolve(null));
  });

  describe('getUserById', () => {
    describe('return structure', () => {
      test('returns a GetUserResult object', async () => {
        const result = await getUserById('550e8400-e29b-41d4-a716-446655440000');

        expect(result).toHaveProperty('success');
      });

      test('successful result includes user object', async () => {
        const result = await getUserById('550e8400-e29b-41d4-a716-446655440000');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result).toHaveProperty('user');
          expect(result.user).toHaveProperty('id');
          expect(result.user).toHaveProperty('email');
          expect(result.user).toHaveProperty('name');
          expect(result.user).toHaveProperty('createdAt');
          expect(result.user).toHaveProperty('updatedAt');
        }
      });
    });

    describe('user data', () => {
      test('returns user with provided id', async () => {
        const testId = '550e8400-e29b-41d4-a716-446655440000';
        const result = await getUserById(testId);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.user.id).toBe(testId);
        }
      });

      test('returns sanitized email', async () => {
        const result = await getUserById('test-id');

        expect(result.success).toBe(true);
        if (result.success) {
          // Email should be lowercase and valid format
          expect(result.user.email).toBe('user@example.com');
          expect(result.user.email).toMatch(/^[a-z0-9._%+-]+@[a-z0-9.-]+$/);
        }
      });

      test('returns ISO timestamp for createdAt', async () => {
        const result = await getUserById('test-id');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
          expect(() => new Date(result.user.createdAt)).not.toThrow();
        }
      });

      test('returns ISO timestamp for updatedAt', async () => {
        const result = await getUserById('test-id');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.user.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
          expect(() => new Date(result.user.updatedAt)).not.toThrow();
        }
      });

      test('returns a name string', async () => {
        const result = await getUserById('test-id');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(typeof result.user.name).toBe('string');
          expect(result.user.name.length).toBeGreaterThan(0);
        }
      });
    });

    describe('various id formats', () => {
      test('handles standard UUID', async () => {
        const result = await getUserById('550e8400-e29b-41d4-a716-446655440000');

        expect(result.success).toBe(true);
      });

      test('handles UUID without dashes', async () => {
        const result = await getUserById('550e8400e29b41d4a716446655440000');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.user.id).toBe('550e8400e29b41d4a716446655440000');
        }
      });

      test('handles short id', async () => {
        const result = await getUserById('abc123');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.user.id).toBe('abc123');
        }
      });

      test('handles empty id', async () => {
        const result = await getUserById('');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.user.id).toBe('');
        }
      });
    });

    describe('async behavior', () => {
      test('returns a Promise', () => {
        const result = getUserById('test-id');

        expect(result).toBeInstanceOf(Promise);
      });

      test('resolves to GetUserResult', async () => {
        const result = await getUserById('test-id');

        expect(typeof result).toBe('object');
        expect(result).toHaveProperty('success');
      });
    });
  });

  describe('getCurrentUserProfile', () => {
    test('returns null when user not found', async () => {
      const profile = await getCurrentUserProfile(new ObjectId().toHexString());
      expect(profile).toBeNull();
    });

    test('returns public user with avatar when user exists', async () => {
      const userId = new ObjectId();
      mockFindById.mockImplementation(() =>
        Promise.resolve({
          _id: userId,
          email: 'user@example.com',
          emailVerified: true,
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-02T00:00:00Z'),
        })
      );

      const profile = await getCurrentUserProfile(userId.toHexString());

      expect(profile).not.toBeNull();
      expect(profile?.id).toBe(userId.toHexString());
      expect(profile?.email).toBe('user@example.com');
      expect(profile?.avatar).toBeDefined();
    });

    test('uses phone as avatar seed when email absent', async () => {
      const userId = new ObjectId();
      mockFindById.mockImplementation(() =>
        Promise.resolve({
          _id: userId,
          phone: '+15551234567',
          phoneVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const profile = await getCurrentUserProfile(userId.toHexString());

      expect(profile?.phone).toBe('+15551234567');
      expect(profile?.avatar).toBeDefined();
    });
  });
});
