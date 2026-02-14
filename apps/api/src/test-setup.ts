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
    webAppUrl: 'https://app.example.com',
    security: {
      otpSecret: 'test-otp-secret-32-bytes-long!!',
      sessionSecret: 'test-session-secret-that-is-long-enough-for-keys',
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
  },
}));

// Mock db/mongo to prevent real MongoDB connections
mock.module('./db/mongo', () => ({
  connectMongo: mock(() => Promise.resolve()),
  disconnectMongo: mock(() => Promise.resolve()),
  getMongoClient: mock(() => null),
  checkMongoHealth: mock(() => Promise.resolve({ status: 'up', latencyMs: 5 })),
}));

// Mock db/redis to prevent real Redis connections
mock.module('./db/redis', () => ({
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

// Mock the main db export
mock.module('./db', () => ({
  connectMongo: mock(() => Promise.resolve()),
  disconnectMongo: mock(() => Promise.resolve()),
  getMongoClient: mock(() => null),
  checkMongoHealth: mock(() => Promise.resolve({ status: 'up', latencyMs: 5 })),
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
