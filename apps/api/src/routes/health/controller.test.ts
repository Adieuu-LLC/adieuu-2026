import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';

// Define the HealthCheck type for mocks
type HealthCheckResult = { status: 'up'; latencyMs: number } | { status: 'down'; error: string };

// Mock dependencies before importing the controller
const mockCheckMongoHealth = mock((): Promise<HealthCheckResult> => Promise.resolve({
  status: 'up',
  latencyMs: 5,
}));

const mockCheckRedisHealth = mock((): Promise<HealthCheckResult> => Promise.resolve({
  status: 'up',
  latencyMs: 2,
}));

mock.module('../../config', () => ({
  config: { stripe: { enabled: false } },
}));

mock.module('../../services/billing/stripe.client', () => ({
  checkStripeServiceHealth: mock(() =>
    Promise.resolve({ status: 'up' as const, latencyMs: 1 }),
  ),
}));

// Mock db submodules to prevent loading real config
mock.module('../../db/mongo', () => ({
  checkMongoHealth: mockCheckMongoHealth,
  connectMongo: mock(() => Promise.resolve()),
  disconnectMongo: mock(() => Promise.resolve()),
  getMongoClient: mock(() => null),
}));

mock.module('../../db/redis', () => ({
  checkRedisHealth: mockCheckRedisHealth,
  connectRedis: mock(() => Promise.resolve()),
  disconnectRedis: mock(() => Promise.resolve()),
  getRedis: mock(() => ({})),
  isRedisConnected: mock(() => true),
}));

mock.module('../../db', () => ({
  checkMongoHealth: mockCheckMongoHealth,
  checkRedisHealth: mockCheckRedisHealth,
}));

import { getHealthStatus, getLivenessStatus, type HealthStatus, type HealthCheck } from './controller';

describe('health controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    // Reset all mocks before each test
    mockCheckMongoHealth.mockClear();
    mockCheckRedisHealth.mockClear();

    // Reset to default successful behavior
    mockCheckMongoHealth.mockImplementation(() => Promise.resolve({
      status: 'up' as const,
      latencyMs: 5,
    }));
    mockCheckRedisHealth.mockImplementation(() => Promise.resolve({
      status: 'up' as const,
      latencyMs: 2,
    }));
  });

  describe('getHealthStatus', () => {
    describe('return structure', () => {
      test('returns a HealthStatus object', async () => {
        const status = await getHealthStatus();

        expect(status).toHaveProperty('status');
        expect(status).toHaveProperty('timestamp');
        expect(status).toHaveProperty('version');
        expect(status).toHaveProperty('checks');
        expect(status.checks).toHaveProperty('mongodb');
        expect(status.checks).toHaveProperty('redis');
      });

      test('timestamp is a valid ISO string', async () => {
        const status = await getHealthStatus();

        expect(status.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        expect(() => new Date(status.timestamp)).not.toThrow();
      });

      test('version is a string', async () => {
        const status = await getHealthStatus();

        expect(typeof status.version).toBe('string');
      });
    });

    describe('status determination', () => {
      test('returns healthy when all dependencies are up', async () => {
        const status = await getHealthStatus();

        expect(status.status).toBe('healthy');
        expect(status.checks.mongodb.status).toBe('up');
        expect(status.checks.redis.status).toBe('up');
      });

      test('returns unhealthy when all dependencies are down', async () => {
        mockCheckMongoHealth.mockImplementation(() => Promise.resolve({
          status: 'down' as const,
          error: 'Connection failed',
        }));
        mockCheckRedisHealth.mockImplementation(() => Promise.resolve({
          status: 'down' as const,
          error: 'Connection failed',
        }));

        const status = await getHealthStatus();

        expect(status.status).toBe('unhealthy');
        expect(status.checks.mongodb.status).toBe('down');
        expect(status.checks.redis.status).toBe('down');
      });

      test('returns degraded when MongoDB is up but Redis is down', async () => {
        mockCheckRedisHealth.mockImplementation(() => Promise.resolve({
          status: 'down' as const,
          error: 'Connection refused',
        }));

        const status = await getHealthStatus();

        expect(status.status).toBe('degraded');
        expect(status.checks.mongodb.status).toBe('up');
        expect(status.checks.redis.status).toBe('down');
      });

      test('returns degraded when Redis is up but MongoDB is down', async () => {
        mockCheckMongoHealth.mockImplementation(() => Promise.resolve({
          status: 'down' as const,
          error: 'Connection timeout',
        }));

        const status = await getHealthStatus();

        expect(status.status).toBe('degraded');
        expect(status.checks.mongodb.status).toBe('down');
        expect(status.checks.redis.status).toBe('up');
      });
    });

    describe('dependency checks', () => {
      test('calls checkMongoHealth', async () => {
        await getHealthStatus();

        expect(mockCheckMongoHealth).toHaveBeenCalledTimes(1);
      });

      test('calls checkRedisHealth', async () => {
        await getHealthStatus();

        expect(mockCheckRedisHealth).toHaveBeenCalledTimes(1);
      });

      test('performs health checks in parallel', async () => {
        let mongoStarted = false;
        let redisStarted = false;
        let mongoFinished = false;
        let redisFinished = false;

        mockCheckMongoHealth.mockImplementation(async () => {
          mongoStarted = true;
          // Both should be started before either finishes
          await new Promise(resolve => setTimeout(resolve, 10));
          mongoFinished = true;
          return { status: 'up' as const, latencyMs: 10 };
        });

        mockCheckRedisHealth.mockImplementation(async () => {
          redisStarted = true;
          await new Promise(resolve => setTimeout(resolve, 10));
          redisFinished = true;
          return { status: 'up' as const, latencyMs: 10 };
        });

        const statusPromise = getHealthStatus();

        // Give time for both to start
        await new Promise(resolve => setTimeout(resolve, 5));

        // Both should have started (parallel execution)
        expect(mongoStarted).toBe(true);
        expect(redisStarted).toBe(true);

        await statusPromise;

        expect(mongoFinished).toBe(true);
        expect(redisFinished).toBe(true);
      });

      test('includes latencyMs when dependency is up', async () => {
        mockCheckMongoHealth.mockImplementation(() => Promise.resolve({
          status: 'up' as const,
          latencyMs: 15,
        }));

        const status = await getHealthStatus();

        expect(status.checks.mongodb.latencyMs).toBe(15);
      });

      test('includes error message when dependency is down', async () => {
        mockCheckMongoHealth.mockImplementation(() => Promise.resolve({
          status: 'down' as const,
          error: 'ECONNREFUSED',
        }));

        const status = await getHealthStatus();

        expect(status.checks.mongodb.error).toBe('ECONNREFUSED');
      });
    });
  });

  describe('getLivenessStatus', () => {
    test('returns object with alive: true', () => {
      const status = getLivenessStatus();

      expect(status).toEqual({ alive: true });
    });

    test('returns synchronously', () => {
      const result = getLivenessStatus();

      // Should not be a Promise
      expect(result).not.toBeInstanceOf(Promise);
      expect(result.alive).toBe(true);
    });

    test('always returns the same structure', () => {
      const status1 = getLivenessStatus();
      const status2 = getLivenessStatus();

      expect(status1).toEqual(status2);
      expect(status1.alive).toBe(true);
      expect(status2.alive).toBe(true);
    });
  });
});
