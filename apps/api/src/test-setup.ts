/**
 * Test setup file for Bun tests.
 *
 * This file is preloaded before any tests run to ensure database modules
 * are mocked globally, preventing actual database connections and config
 * loading during tests.
 */
import { mock } from 'bun:test';

// Mock the config module with test values
mock.module('./config', () => ({
  config: {
    env: 'test',
    webAppUrl: 'https://app.example.com',
    security: {
      otpSecret: 'test-otp-secret-32-bytes-long!!',
      sessionSecret: 'test-session-secret-that-is-long-enough-for-keys',
      accountHashSecret: 'test-account-hash-secret-32bytes!',
      tokenSigningKey: 'test-token-signing-key-32-bytes!',
    },
    cookie: {
      domain: undefined,
    },
    mongodb: {
      uri: 'mongodb://localhost:27017/test',
      minPoolSize: 1,
      maxPoolSize: 10,
    },
    redis: {
      host: 'localhost',
      port: 6379,
    },
    /** Present so any early import of messaging/email does not see undefined config.email */
    email: {
      provider: 'console',
      fromAddress: 'noreply@test.example.com',
      awsRegion: 'us-east-1',
      awsAccessKeyId: undefined,
      awsSecretAccessKey: undefined,
    },
  },
}));

// Mock collection factory - shared by all db mocks
const mockCollection = {
  findOne: mock(() => Promise.resolve(null)),
  find: mock(() => ({ limit: mock(() => ({ toArray: mock(() => Promise.resolve([])) })) })),
  insertOne: mock(() => Promise.resolve({ insertedId: 'test-id' })),
  updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })),
  findOneAndUpdate: mock(() => Promise.resolve(null)),
  deleteOne: mock(() => Promise.resolve({ deletedCount: 1 })),
  countDocuments: mock(() => Promise.resolve(0)),
  createIndex: mock(() => Promise.resolve('index_name')),
};

// Collection name constants
const Collections = {
  USERS: 'users',
  SESSIONS: 'sessions',
  AUDIT_LOGS: 'audit_logs',
  IDENTITY_COUNTS: 'identity_counts',
  IDENTITIES: 'identities',
};

// Mock db/mongo to prevent real MongoDB connections
mock.module('./db/mongo', () => ({
  connectMongo: mock(() => Promise.resolve()),
  disconnectMongo: mock(() => Promise.resolve()),
  getDb: mock(() => ({
    collection: mock(() => mockCollection),
    command: mock(() => Promise.resolve({ ok: 1 })),
    listCollections: mock(() => ({ toArray: mock(() => Promise.resolve([])) })),
    createCollection: mock(() => Promise.resolve()),
  })),
  getCollection: mock(() => mockCollection),
  checkMongoHealth: mock(() => Promise.resolve({ status: 'up', latencyMs: 5 })),
  initializeCollections: mock(() => Promise.resolve([])),
  Collections,
}));

// Mock db/redis to prevent real Redis connections
mock.module('./db/redis', () => ({
  connectRedis: mock(() => Promise.resolve()),
  disconnectRedis: mock(() => Promise.resolve()),
  getRedis: mock(() => ({
    get: mock(() => Promise.resolve(null)),
    set: mock(() => Promise.resolve('OK')),
    del: mock(() => Promise.resolve(1)),
    expire: mock(() => Promise.resolve(1)),
    ttl: mock(() => Promise.resolve(-1)),
  })),
  isRedisConnected: mock(() => true),
  checkRedisHealth: mock(() => Promise.resolve({ status: 'up', latencyMs: 2 })),
  RedisKeys: {
    otp: (id: string) => `otp:${id}`,
    rateLimit: (action: string, id: string) => `rate:${action}:${id}`,
    session: (id: string) => `session:${id}`,
    identityLoginAttempts: (accountHash: string) => `ratelimit:identity_login:${accountHash}`,
    lockoutPending: (accountHash: string) => `lockout_pending:${accountHash}`,
  },
}));

// Mock the main db export - must include ALL exports from db/index.ts
mock.module('./db', () => ({
  // MongoDB exports
  connectMongo: mock(() => Promise.resolve()),
  disconnectMongo: mock(() => Promise.resolve()),
  getDb: mock(() => ({
    collection: mock(() => mockCollection),
    command: mock(() => Promise.resolve({ ok: 1 })),
    listCollections: mock(() => ({ toArray: mock(() => Promise.resolve([])) })),
    createCollection: mock(() => Promise.resolve()),
  })),
  getCollection: mock(() => mockCollection),
  checkMongoHealth: mock(() => Promise.resolve({ status: 'up', latencyMs: 5 })),
  initializeCollections: mock(() => Promise.resolve([])),
  Collections,
  // Redis exports
  connectRedis: mock(() => Promise.resolve()),
  disconnectRedis: mock(() => Promise.resolve()),
  getRedis: mock(() => ({
    get: mock(() => Promise.resolve(null)),
    set: mock(() => Promise.resolve('OK')),
    del: mock(() => Promise.resolve(1)),
    expire: mock(() => Promise.resolve(1)),
    ttl: mock(() => Promise.resolve(-1)),
  })),
  isRedisConnected: mock(() => true),
  checkRedisHealth: mock(() => Promise.resolve({ status: 'up', latencyMs: 2 })),
  RedisKeys: {
    otp: (id: string) => `otp:${id}`,
    rateLimit: (action: string, id: string) => `rate:${action}:${id}`,
    session: (id: string) => `session:${id}`,
    identityLoginAttempts: (accountHash: string) => `ratelimit:identity_login:${accountHash}`,
    lockoutPending: (accountHash: string) => `lockout_pending:${accountHash}`,
  },
  // Initialization helpers
  initializeDatabases: mock(() => Promise.resolve()),
  closeDatabases: mock(() => Promise.resolve()),
}));
