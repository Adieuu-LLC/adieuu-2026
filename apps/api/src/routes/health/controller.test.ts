import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';
import type { Locale } from '../../i18n';
import type { RouteContext } from '../../router/types';
import { createStripeClientMock } from '../../test-utils/stripe-client.mock';
import { sanitizeString } from '../../utils/sanitize';

mock.module('../../utils/adieuuLogger', () => ({
  default: {
    warn: mock(() => {}),
    info: mock(() => {}),
    error: mock(() => {}),
  },
}));

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

const mockCheckStripeHealth = mock((): Promise<HealthCheckResult> => Promise.resolve({
  status: 'up',
  latencyMs: 3,
}));

/** Shared config object so tests can toggle `stripe.enabled` without reloading modules. */
const testConfig = { stripe: { enabled: false } };

mock.module('../../config', () => ({
  config: testConfig,
}));

mock.module('../../services/billing/stripe.client', () =>
  createStripeClientMock({
    checkStripeServiceHealth: mockCheckStripeHealth,
  }),
);

// Mock db submodules to prevent loading real config
mock.module('../../db/mongo', () => ({
  checkMongoHealth: mockCheckMongoHealth,
  connectMongo: mock(() => Promise.resolve()),
  disconnectMongo: mock(() => Promise.resolve()),
  getMongoClient: mock(() => null),
  Collections: {
    USERS: 'users',
    SESSIONS: 'sessions',
    AUDIT_LOGS: 'audit_logs',
  },
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

import {
  getHealthCtrl,
  getHealthStatus,
  getLivenessCtrl,
  getLivenessStatus,
} from './controller';
import { healthRoutes } from './index';

function makeRouteContext(request: Request): RouteContext {
  const url = new URL(request.url);
  return {
    request,
    url,
    params: {},
    query: url.searchParams,
    requestId: 'test-req',
    locale: 'en' as Locale,
    errors: {
      badRequest: () => new Response(null, { status: 400 }),
      unauthorized: () => new Response(null, { status: 401 }),
      forbidden: () => new Response(null, { status: 403 }),
      notFound: () => new Response(null, { status: 404 }),
      methodNotAllowed: () => new Response(null, { status: 405 }),
      rateLimited: () => new Response(null, { status: 429 }),
      conflict: () => new Response(null, { status: 409 }),
      internal: () => new Response(null, { status: 500 }),
      validationFailed: () => new Response(JSON.stringify({ code: 'VALIDATION_FAILED' }), { status: 400 }),
      invalidEmail: () => new Response(null, { status: 400 }),
      invalidPhone: () => new Response(null, { status: 400 }),
      verificationFailed: () => new Response(null, { status: 400 }),
      invalidOtp: () => new Response(null, { status: 400 }),
      otpExpired: () => new Response(null, { status: 400 }),
      tooManyAttempts: () => new Response(null, { status: 400 }),
      accountLocked: () => new Response(null, { status: 403 }),
      sessionExpired: () => new Response(null, { status: 401 }),
      sessionExpiredWithClearCookie: () => new Response(null, { status: 401 }),
      payloadTooLarge: () => new Response(null, { status: 413 }),
      alreadyOwned: () => new Response(null, { status: 409 }),
      signInRestricted: () => new Response(null, { status: 403 }),
    },
  };
}

describe('health controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    testConfig.stripe.enabled = false;

    mockCheckMongoHealth.mockClear();
    mockCheckRedisHealth.mockClear();
    mockCheckStripeHealth.mockClear();

    mockCheckMongoHealth.mockImplementation(() => Promise.resolve({
      status: 'up' as const,
      latencyMs: 5,
    }));
    mockCheckRedisHealth.mockImplementation(() => Promise.resolve({
      status: 'up' as const,
      latencyMs: 2,
    }));
    mockCheckStripeHealth.mockImplementation(() => Promise.resolve({
      status: 'up' as const,
      latencyMs: 3,
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

      test('does not call Stripe health when billing is disabled', async () => {
        const status = await getHealthStatus();

        expect(mockCheckStripeHealth).not.toHaveBeenCalled();
        expect(status.checks).not.toHaveProperty('stripe');
      });

      test('performs health checks in parallel', async () => {
        let mongoStarted = false;
        let redisStarted = false;
        let mongoFinished = false;
        let redisFinished = false;

        mockCheckMongoHealth.mockImplementation(async () => {
          mongoStarted = true;
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

        await new Promise(resolve => setTimeout(resolve, 5));

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

      test('sanitizes dependency error strings from external sources', async () => {
        const dirty = 'fail\u200B\uFEFF\u202E msg';
        const { value: expected } = sanitizeString(dirty, 'general');

        mockCheckMongoHealth.mockImplementation(() => Promise.resolve({
          status: 'down' as const,
          error: dirty,
        }));

        const status = await getHealthStatus();

        expect(status.checks.mongodb.error).toBe(expected);
        expect(status.checks.mongodb.error).not.toBe(dirty);
      });
    });

    describe('Stripe billing enabled', () => {
      beforeEach(() => {
        testConfig.stripe.enabled = true;
      });

      test('returns healthy when Mongo, Redis, and Stripe are up', async () => {
        const status = await getHealthStatus();

        expect(status.status).toBe('healthy');
        expect(status.checks.stripe).toBeDefined();
        expect(status.checks.stripe?.status).toBe('up');
        expect(mockCheckStripeHealth).toHaveBeenCalledTimes(1);
      });

      test('returns degraded when Stripe is down but Mongo and Redis are up', async () => {
        mockCheckStripeHealth.mockImplementation(() => Promise.resolve({
          status: 'down' as const,
          error: 'timeout',
        }));

        const status = await getHealthStatus();

        expect(status.status).toBe('degraded');
        expect(status.checks.mongodb.status).toBe('up');
        expect(status.checks.redis.status).toBe('up');
        expect(status.checks.stripe?.status).toBe('down');
        expect(status.checks.stripe?.error).toBe('timeout');
      });

      test('sanitizes Stripe error messages', async () => {
        const dirty = 'stripe\u200Bdown';
        const { value: expected } = sanitizeString(dirty, 'general');

        mockCheckStripeHealth.mockImplementation(() => Promise.resolve({
          status: 'down' as const,
          error: dirty,
        }));

        const status = await getHealthStatus();

        expect(status.checks.stripe?.error).toBe(expected);
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

  describe('getHealthCtrl', () => {
    test('returns 200 and success payload when healthy', async () => {
      const ctx = makeRouteContext(new Request('http://localhost/health'));
      const res = await getHealthCtrl(ctx);

      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; data: { status: string } };
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('healthy');
    });

    test('returns 200 when degraded', async () => {
      mockCheckRedisHealth.mockImplementation(() => Promise.resolve({
        status: 'down' as const,
        error: 'down',
      }));

      const ctx = makeRouteContext(new Request('http://localhost/health'));
      const res = await getHealthCtrl(ctx);

      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; data: { status: string } };
      expect(json.data.status).toBe('degraded');
    });

    test('returns 503 when unhealthy', async () => {
      mockCheckMongoHealth.mockImplementation(() => Promise.resolve({
        status: 'down' as const,
        error: 'a',
      }));
      mockCheckRedisHealth.mockImplementation(() => Promise.resolve({
        status: 'down' as const,
        error: 'b',
      }));

      const ctx = makeRouteContext(new Request('http://localhost/health'));
      const res = await getHealthCtrl(ctx);

      expect(res.status).toBe(503);
      const json = (await res.json()) as { success: boolean; data: { status: string } };
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('unhealthy');
    });
  });

  describe('getLivenessCtrl', () => {
    test('returns 200 and alive payload', async () => {
      const ctx = makeRouteContext(new Request('http://localhost/health/live'));
      const res = getLivenessCtrl(ctx);

      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; data: { alive: boolean } };
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ alive: true });
    });
  });

  describe('healthRoutes handler smoke', () => {
    test('GET /health returns 200 when dependencies are up', async () => {
      const handler = healthRoutes.handler();
      const response = await handler(new Request('http://localhost/health'));

      expect(response.status).toBe(200);
      const json = (await response.json()) as { success: boolean; data: { checks: Record<string, unknown> } };
      expect(json.success).toBe(true);
      expect(json.data.checks.mongodb).toBeDefined();
      expect(json.data.checks.redis).toBeDefined();
    });

    test('GET /health returns 503 when all dependencies are down', async () => {
      mockCheckMongoHealth.mockImplementation(() => Promise.resolve({
        status: 'down' as const,
        error: 'x',
      }));
      mockCheckRedisHealth.mockImplementation(() => Promise.resolve({
        status: 'down' as const,
        error: 'y',
      }));

      const handler = healthRoutes.handler();
      const response = await handler(new Request('http://localhost/health'));

      expect(response.status).toBe(503);
    });

    test('GET /health/live returns 200 with alive true', async () => {
      const handler = healthRoutes.handler();
      const response = await handler(new Request('http://localhost/health/live'));

      expect(response.status).toBe(200);
      const json = (await response.json()) as { success: boolean; data: { alive: boolean } };
      expect(json.data.alive).toBe(true);
    });
  });
});
