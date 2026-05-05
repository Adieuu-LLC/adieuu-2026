import { afterAll, afterEach, describe, expect, test, mock, beforeEach } from 'bun:test';

// Mock config to avoid loading env
mock.module('../../config', () => ({
  config: {
    env: 'test',
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test', minPoolSize: 1, maxPoolSize: 10 },
    redis: { url: 'redis://localhost:6379' },
    features: { requireDatabase: false, initializeCollections: false },
    app: { name: 'Adieuu' },
    session: { secret: 'test-secret', expiresIn: 3600 },
    security: {
      sessionSecret: 'test-secret',
      otpSecret: 'test-otp-secret',
    },
  },
}));

// Mock collection factory
const mockCollection = {
  findOne: mock(() => Promise.resolve(null)),
  find: mock(() => ({ limit: mock(() => ({ toArray: mock(() => Promise.resolve([])) })) })),
  insertOne: mock(() => Promise.resolve({ insertedId: 'test-id' })),
  updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })),
  findOneAndUpdate: mock(() => Promise.resolve(null)),
  deleteOne: mock(() => Promise.resolve({ deletedCount: 1 })),
  countDocuments: mock(() => Promise.resolve(0)),
};

// Mock db submodules to prevent them from loading real config
mock.module('../../db/mongo', () => ({
  connectMongo: mock(() => Promise.resolve()),
  disconnectMongo: mock(() => Promise.resolve()),
  getDb: mock(() => ({})),
  getCollection: mock(() => mockCollection),
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
  getCollection: mock(() => mockCollection),
  checkMongoHealth: mock(() => Promise.resolve({ status: 'up', latencyMs: 5 })),
  initializeCollections: mock(() => Promise.resolve([])),
  withTransaction: async (fn: (session: unknown) => Promise<unknown>) => fn({}),
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

// Mock base repository to avoid db dependency
mock.module('../../repositories/base.repository', () => ({
  BaseRepository: class MockBaseRepository {
    collection = mockCollection;
    constructor() { }
    findById = mock(() => Promise.resolve(null));
    findOne = mock(() => Promise.resolve(null));
    findMany = mock(() => Promise.resolve([]));
    create = mock(() => Promise.resolve({ _id: 'test-id' }));
    updateById = mock(() => Promise.resolve(null));
    deleteById = mock(() => Promise.resolve(true));
    count = mock(() => Promise.resolve(0));
  },
}));

// Mock repositories
const mockUser = {
  _id: 'test-user-id',
  email: 'test@example.com',
  createdAt: new Date('2024-01-15T12:00:00Z'),
  maxIdentities: 2,
  failedAttempts: 0,
};

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: mock(() => ({
    findById: mock(() => Promise.resolve(mockUser)),
    findOne: mock(() => Promise.resolve(null)),
    findByEmail: mock(() => Promise.resolve(null)),
    findByPhone: mock(() => Promise.resolve(null)),
    findByIdentifier: mock(() => Promise.resolve(null)),
    create: mock(() => Promise.resolve({ _id: 'test-id', createdAt: new Date() })),
    updateById: mock(() => Promise.resolve(null)),
    recordLogin: mock(() => Promise.resolve()),
    incrementFailedAttempts: mock(() => Promise.resolve()),
    resetFailedAttempts: mock(() => Promise.resolve()),
    lockAccount: mock(() => Promise.resolve()),
    unlockAccount: mock(() => Promise.resolve()),
  })),
}));

mock.module('../../repositories/session.repository', () => ({
  getSessionRepository: mock(() => ({
    findById: mock(() => Promise.resolve(null)),
    findBySessionId: mock(() => Promise.resolve(null)),
    findByUserId: mock(() => Promise.resolve([])),
    create: mock(() => Promise.resolve({ _id: 'test-id', sessionId: 'test-session' })),
    updateById: mock(() => Promise.resolve(null)),
    deleteById: mock(() => Promise.resolve(true)),
    revokeSession: mock(() => Promise.resolve(null)),
    revokeAllUserSessions: mock(() => Promise.resolve(0)),
  })),
}));

// Mock session service
const mockAccountSession = {
  type: 'account' as const,
  userId: 'test-user-id',
  identifier: 'test@example.com',
  identifierType: 'email' as const,
  lastActivityAt: Date.now(),
  expiresAt: Date.now() + 86_400_000,
};

mock.module('../../services/session.service', () => ({
  createAccountSession: mock(() => Promise.resolve({ sessionId: 'test-session', cookie: 'adieuu_session=test-session; Path=/; HttpOnly' })),
  createSession: mock(() => Promise.resolve({ sessionId: 'test-session', cookie: 'adieuu_session=test-session; Path=/; HttpOnly' })),
  requireAccountSession: mock((request: Request) => {
    const cookie = request.headers.get('Cookie') ?? '';
    if (cookie.includes('adieuu_session=test-session')) {
      return Promise.resolve(mockAccountSession);
    }
    return Promise.resolve(null);
  }),
  getSessionFromRequest: mock((request: Request) => {
    const cookie = request.headers.get('Cookie') ?? '';
    if (cookie.includes('adieuu_session=test-session')) {
      return Promise.resolve(mockAccountSession);
    }
    return Promise.resolve(null);
  }),
  destroySession: mock(() => Promise.resolve()),
  destroyAllSessions: mock(() => Promise.resolve(0)),
  getSessionIdFromRequest: mock((request: Request) => {
    const cookie = request.headers.get('Cookie') ?? '';
    const match = cookie.match(/adieuu_session=([^;]+)/);
    return match?.[1] ?? null;
  }),
  buildLogoutCookie: mock(() => 'adieuu_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax'),
}));

// Mock account token service
mock.module('../../services/account-token.service', () => ({
  generateAccountHash: mock(() => 'a'.repeat(64)),
  createSignedToken: mock(() => 'mock-signed-token'),
}));

// Mock identity count repository
mock.module('../../repositories/identity-count.repository', () => ({
  getIdentityCountRepository: mock(() => ({
    getCount: mock(() => Promise.resolve(1)),
  })),
}));

// Preserve full identity.service exports: a MAX-only mock replaces the entire module globally
// and breaks other route tests that share the same Bun process.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sync load after db mocks above
const identityServiceModule = require('../../services/identity.service') as typeof import('../../services/identity.service');

mock.module('../../services/identity.service', () => ({
  ...identityServiceModule,
  MAX_IDENTITIES_PER_USER: 2,
}));

// Mock platform capabilities service
mock.module('../../services/platform-capabilities.service', () => ({
  getPlatformCapabilities: mock(() => Promise.resolve({
    isPlatformAdmin: false,
    isPlatformModerator: false,
    permissions: [],
  })),
}));

// Mock MFA service
mock.module('../../services/mfa.service', () => ({
  getMfaStatus: mock(() => Promise.resolve({ enabled: false, totpEnabled: false, webauthnEnabled: false, totpCount: 0, webauthnCount: 0 })),
  verifyTotpCode: mock(() => Promise.resolve({ success: false })),
  verifyWebAuthnAuthentication: mock(() => Promise.resolve({ success: false })),
  generateWebAuthnAuthenticationOptions: mock(() => Promise.resolve(null)),
}));

// Now mock the services that depend on db
const mockCreateOtp = mock((): Promise<string | null> => Promise.resolve('123456'));
const mockCheckRateLimit = mock((_action: string, _id: string) => Promise.resolve({
  allowed: true,
  remaining: 5,
  resetAt: Date.now() + 60000,
  limit: 10,
}));
const mockSendEmail = mock(() => Promise.resolve());
const mockSendSms = mock(() => Promise.resolve());
const mockAddJitter = mock(() => Promise.resolve());

mock.module('../../services/otp.service', () => ({
  createOtp: mockCreateOtp,
  // Match VerifyOtpResult ({ valid, error?, ... }); wrong shape breaks other suites when this mock wins globally.
  verifyOtp: mock(() => Promise.resolve({ valid: true })),
}));

mock.module('../../services/rate-limit.service', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

mock.module('../../services/messaging', () => ({
  sendEmail: mockSendEmail,
  sendSms: mockSendSms,
}));

mock.module('../../utils/timing', () => ({
  addJitter: mockAddJitter,
}));

const mockIsAuthIdentifierAllowed = mock(() => Promise.resolve(true));

mock.module('../../services/platform-settings.service', () => ({
  isAuthIdentifierAllowed: mockIsAuthIdentifierAllowed,
  isPlatformAdmin: mock(() => Promise.resolve(false)),
  upsertPlatformSetting: mock(() => Promise.resolve()),
  coercePlatformSettingValue: mock(() => ({})),
}));

import { requestOtp, getClientIp, verifyOtpHandler, type RequestOtpInput } from './controller';
import { authRoutes } from './index';

describe('auth controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    // Reset all mocks before each test
    mockCreateOtp.mockClear();
    mockCheckRateLimit.mockClear();
    mockSendEmail.mockClear();
    mockSendSms.mockClear();
    mockAddJitter.mockClear();
    mockIsAuthIdentifierAllowed.mockClear();
    mockIsAuthIdentifierAllowed.mockImplementation(() => Promise.resolve(true));

    // Reset to default successful behavior
    mockCreateOtp.mockImplementation(() => Promise.resolve('123456'));
    mockCheckRateLimit.mockImplementation(() => Promise.resolve({
      allowed: true,
      remaining: 5,
      resetAt: Date.now() + 60000,
      limit: 10,
    }));
  });

  describe('requestOtp', () => {
    describe('successful requests', () => {
      test('returns success for valid email request', async () => {
        const input: RequestOtpInput = {
          identifier: 'user@example.com',
          type: 'email',
        };

        const result = await requestOtp(input, '192.168.1.1');

        expect(result.success).toBe(true);
      });

      test('returns success for valid SMS request', async () => {
        const input: RequestOtpInput = {
          identifier: '+15551234567',
          type: 'sms',
        };

        const result = await requestOtp(input, '192.168.1.1');

        expect(result.success).toBe(true);
      });

      test('calls createOtp with sanitized identifier', async () => {
        const input: RequestOtpInput = {
          identifier: 'USER@EXAMPLE.COM',
          type: 'email',
        };

        await requestOtp(input, '192.168.1.1');

        expect(mockCreateOtp).toHaveBeenCalledTimes(1);
        // Email should be lowercased
        expect(mockCreateOtp).toHaveBeenCalledWith('user@example.com', 'email');
      });

      test('calls checkRateLimit for both identifier and IP', async () => {
        const input: RequestOtpInput = {
          identifier: 'user@example.com',
          type: 'email',
        };

        await requestOtp(input, '192.168.1.1');

        expect(mockCheckRateLimit).toHaveBeenCalledTimes(2);
        // First call for identifier
        const calls = mockCheckRateLimit.mock.calls as [string, string][];
        expect(calls[0]?.[0]).toBe('auth:request:identifier');
        // Second call for IP
        expect(calls[1]?.[0]).toBe('auth:request:ip');
      });

      test('sends email for email type', async () => {
        const input: RequestOtpInput = {
          identifier: 'user@example.com',
          type: 'email',
        };

        await requestOtp(input, '192.168.1.1');

        // Give the fire-and-forget promise a tick to resolve
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockSendEmail).toHaveBeenCalledTimes(1);
        expect(mockSendSms).not.toHaveBeenCalled();
      });

      test('sends SMS for SMS type', async () => {
        const input: RequestOtpInput = {
          identifier: '+15551234567',
          type: 'sms',
        };

        await requestOtp(input, '192.168.1.1');

        // Give the fire-and-forget promise a tick to resolve
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockSendSms).toHaveBeenCalledTimes(1);
        expect(mockSendEmail).not.toHaveBeenCalled();
      });

      test('adds jitter to response', async () => {
        const input: RequestOtpInput = {
          identifier: 'user@example.com',
          type: 'email',
        };

        await requestOtp(input, '192.168.1.1');

        expect(mockAddJitter).toHaveBeenCalled();
      });

      test('returns not_allowed when platform auth allowlist rejects identifier', async () => {
        mockIsAuthIdentifierAllowed.mockImplementation(() => Promise.resolve(false));
        const input: RequestOtpInput = {
          identifier: 'user@example.com',
          type: 'email',
        };

        const result = await requestOtp(input, '192.168.1.1');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('not_allowed');
        }
        expect(mockCreateOtp).not.toHaveBeenCalled();
      });

      test('always returns success even when OTP creation fails (anti-enumeration)', async () => {
        mockCreateOtp.mockImplementation(() => Promise.resolve(null));

        const input: RequestOtpInput = {
          identifier: 'user@example.com',
          type: 'email',
        };

        const result = await requestOtp(input, '192.168.1.1');

        // Should still return success to prevent enumeration
        expect(result.success).toBe(true);
      });

      test('does not send email when OTP creation fails', async () => {
        mockCreateOtp.mockImplementation(() => Promise.resolve(null));

        const input: RequestOtpInput = {
          identifier: 'user@example.com',
          type: 'email',
        };

        await requestOtp(input, '192.168.1.1');
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(mockSendEmail).not.toHaveBeenCalled();
      });
    });

    describe('rate limiting', () => {
      test('returns rate_limited when identifier limit exceeded', async () => {
        mockCheckRateLimit.mockImplementationOnce(() => Promise.resolve({
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + 60000,
          limit: 3,
        }));

        const input: RequestOtpInput = {
          identifier: 'user@example.com',
          type: 'email',
        };

        const result = await requestOtp(input, '192.168.1.1');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('rate_limited');
          expect(result.rateLimitResult).toBeDefined();
        }
      });

      test('returns rate_limited when IP limit exceeded', async () => {
        // First call (identifier) succeeds, second (IP) fails
        mockCheckRateLimit
          .mockImplementationOnce(() => Promise.resolve({
            allowed: true,
            remaining: 5,
            resetAt: Date.now() + 60000,
            limit: 10,
          }))
          .mockImplementationOnce(() => Promise.resolve({
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60000,
            limit: 10,
          }));

        const input: RequestOtpInput = {
          identifier: 'user@example.com',
          type: 'email',
        };

        const result = await requestOtp(input, '192.168.1.1');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('rate_limited');
        }
      });

      test('adds jitter even when rate limited', async () => {
        mockCheckRateLimit.mockImplementation(() => Promise.resolve({
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + 60000,
          limit: 3,
        }));

        const input: RequestOtpInput = {
          identifier: 'user@example.com',
          type: 'email',
        };

        await requestOtp(input, '192.168.1.1');

        expect(mockAddJitter).toHaveBeenCalled();
      });

      test('does not create OTP when rate limited', async () => {
        mockCheckRateLimit.mockImplementation(() => Promise.resolve({
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + 60000,
          limit: 3,
        }));

        const input: RequestOtpInput = {
          identifier: 'user@example.com',
          type: 'email',
        };

        await requestOtp(input, '192.168.1.1');

        expect(mockCreateOtp).not.toHaveBeenCalled();
      });
    });

    describe('input sanitization', () => {
      test('sanitizes email to lowercase', async () => {
        const input: RequestOtpInput = {
          identifier: 'User@EXAMPLE.COM',
          type: 'email',
        };

        await requestOtp(input, '192.168.1.1');

        expect(mockCreateOtp).toHaveBeenCalledWith('user@example.com', 'email');
      });

      test('sanitizes phone number', async () => {
        const input: RequestOtpInput = {
          identifier: '+1 (555) 123-4567',
          type: 'sms',
        };

        await requestOtp(input, '192.168.1.1');

        // Phone sanitizer keeps digits, +, -, spaces, parens, x, periods
        expect(mockCreateOtp).toHaveBeenCalledTimes(1);
      });

      test('sanitizes IP address', async () => {
        const input: RequestOtpInput = {
          identifier: 'user@example.com',
          type: 'email',
        };

        // IP with potential injection attempt
        await requestOtp(input, '192.168.1.1<script>');

        // Should still work - IP is sanitized
        expect(mockCheckRateLimit).toHaveBeenCalled();
      });
    });
  });

  describe('getClientIp', () => {
    beforeEach(() => {
      delete process.env.DEV_CLIENT_IP;
    });

    afterEach(() => {
      delete process.env.DEV_CLIENT_IP;
    });

    test('returns X-Real-IP header when present', () => {
      const request = new Request('http://localhost', {
        headers: {
          'X-Real-IP': '203.0.113.1',
        },
      });

      const ip = getClientIp(request);
      expect(ip).toBe('203.0.113.1');
    });

    test('returns first IP from X-Forwarded-For when X-Real-IP is absent', () => {
      const request = new Request('http://localhost', {
        headers: {
          'X-Forwarded-For': '203.0.113.1, 10.0.0.1, 10.0.0.2',
        },
      });

      const ip = getClientIp(request);
      expect(ip).toBe('203.0.113.1');
    });

    test('trims whitespace from X-Forwarded-For', () => {
      const request = new Request('http://localhost', {
        headers: {
          'X-Forwarded-For': '  203.0.113.1  , 10.0.0.1',
        },
      });

      const ip = getClientIp(request);
      expect(ip).toBe('203.0.113.1');
    });

    test('prefers X-Real-IP over X-Forwarded-For', () => {
      const request = new Request('http://localhost', {
        headers: {
          'X-Real-IP': '203.0.113.1',
          'X-Forwarded-For': '10.0.0.1, 10.0.0.2',
        },
      });

      const ip = getClientIp(request);
      expect(ip).toBe('203.0.113.1');
    });

    test('returns 127.0.0.1 when no proxy headers present', () => {
      const request = new Request('http://localhost');

      const ip = getClientIp(request);
      expect(ip).toBe('127.0.0.1');
    });

    test('returns 127.0.0.1 for empty X-Forwarded-For', () => {
      const request = new Request('http://localhost', {
        headers: {
          'X-Forwarded-For': '',
        },
      });

      const ip = getClientIp(request);
      expect(ip).toBe('127.0.0.1');
    });

    test('handles IPv6 addresses', () => {
      const request = new Request('http://localhost', {
        headers: {
          'X-Real-IP': '2001:db8::1',
        },
      });

      const ip = getClientIp(request);
      expect(ip).toBe('2001:db8::1');
    });

    test('handles single IP in X-Forwarded-For without comma', () => {
      const request = new Request('http://localhost', {
        headers: {
          'X-Forwarded-For': '203.0.113.1',
        },
      });

      const ip = getClientIp(request);
      expect(ip).toBe('203.0.113.1');
    });

    test('DEV_CLIENT_IP overrides proxy headers in non-production', () => {
      process.env.DEV_CLIENT_IP = '203.0.113.99';
      const request = new Request('http://localhost', {
        headers: {
          'X-Real-IP': '10.0.0.1',
          'X-Forwarded-For': '10.0.0.2',
        },
      });

      expect(getClientIp(request)).toBe('203.0.113.99');
    });

    test('ignores invalid DEV_CLIENT_IP and uses headers', () => {
      process.env.DEV_CLIENT_IP = 'evil\n10.0.0.3';
      const request = new Request('http://localhost', {
        headers: { 'X-Real-IP': '10.0.0.1' },
      });

      expect(getClientIp(request)).toBe('10.0.0.1');
    });
  });

  describe('verifyOtpHandler', () => {
    test('returns not_allowed when platform auth allowlist rejects identifier', async () => {
      mockIsAuthIdentifierAllowed.mockImplementation(() => Promise.resolve(false));

      const result = await verifyOtpHandler(
        { identifier: 'user@example.com', code: '123456' },
        '192.168.1.1'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('not_allowed');
      }
    });
  });

  // ==========================================================================
  // Route-level tests
  // ==========================================================================

  describe('GET /auth/session', () => {
    const makeRouteRequest = async (
      path: string,
      options: { method?: string; cookies?: string } = {}
    ) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options.cookies) {
        headers['Cookie'] = options.cookies;
      }
      const request = new Request(`http://localhost${path}`, {
        method: options.method ?? 'GET',
        headers,
      });
      const handler = authRoutes.handler();
      return handler(request);
    };

    test('returns session data with signedToken and identityCount', async () => {
      const response = await makeRouteRequest('/auth/session', {
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(200);
      const body = await response.json() as {
        data: { signedToken: string; identityCount: number; identifier: string };
      };
      expect(body.data.signedToken).toBe('mock-signed-token');
      expect(body.data.identityCount).toBe(1);
      expect(body.data.identifier).toBe('test@example.com');
    });

    test('returns 401 without session', async () => {
      const response = await makeRouteRequest('/auth/session');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/clear-session', () => {
    const makeRouteRequest = async (
      path: string,
      options: { method?: string; cookies?: string; body?: object } = {}
    ) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (options.cookies) {
        headers['Cookie'] = options.cookies;
      }
      const request = new Request(`http://localhost${path}`, {
        method: options.method ?? 'POST',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const handler = authRoutes.handler();
      return handler(request);
    };

    test('clears session and returns logout cookie', async () => {
      const response = await makeRouteRequest('/auth/clear-session', {
        method: 'POST',
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(200);
      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).toContain('adieuu_session=');
      expect(setCookie).toContain('Max-Age=0');
    });

    test('succeeds even without session', async () => {
      const response = await makeRouteRequest('/auth/clear-session', {
        method: 'POST',
      });

      expect(response.status).toBe(200);
    });
  });
});
