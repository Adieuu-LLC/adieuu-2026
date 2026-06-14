import { afterAll, afterEach, describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import { createRateLimitServiceMock } from '../../test-utils/rate-limit-service.mock';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

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

const mockRedisGet = mock(() => Promise.resolve(null)) as AnyMock;
const mockRedisSet = mock(() => Promise.resolve('OK')) as AnyMock;
const mockRedisDel = mock(() => Promise.resolve(1)) as AnyMock;
const mockIsRedisConnected = mock(() => true) as AnyMock;

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
  getRedis: mock(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  })),
  isRedisConnected: mockIsRedisConnected,
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
const testUserObjectId = new ObjectId('507f1f77bcf86cd799439011');

const mockUser = {
  _id: testUserObjectId,
  email: 'test@example.com',
  createdAt: new Date('2024-01-15T12:00:00Z'),
  maxIdentities: 2,
  failedAttempts: 0,
};

const mockFindByIdentifier = mock(() => Promise.resolve(null)) as AnyMock;
const mockFindById = mock(() => Promise.resolve(mockUser)) as AnyMock;
const mockCountBannedUsers = mock(() => Promise.resolve(1)) as AnyMock;
const mockCreateUser = mock(() => Promise.resolve(mockUser)) as AnyMock;
const mockIncrementFailedAttempts = mock(() => Promise.resolve()) as AnyMock;
const mockRecordLogin = mock(() => Promise.resolve()) as AnyMock;
const mockLockAccount = mock(() => Promise.resolve()) as AnyMock;

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: mock(() => ({
    findById: mockFindById,
    findOne: mock(() => Promise.resolve(null)),
    findByEmail: mock(() => Promise.resolve(null)),
    findByPhone: mock(() => Promise.resolve(null)),
    findByIdentifier: mockFindByIdentifier,
    create: mockCreateUser,
    updateById: mock(() => Promise.resolve(null)),
    recordLogin: mockRecordLogin,
    incrementFailedAttempts: mockIncrementFailedAttempts,
    resetFailedAttempts: mock(() => Promise.resolve()),
    lockAccount: mockLockAccount,
    unlockAccount: mock(() => Promise.resolve()),
    countBannedUsers: mockCountBannedUsers,
  })),
}));

const mockFindByUserId = mock(() => Promise.resolve([])) as AnyMock;
const mockFindBySessionId = mock(() => Promise.resolve(null)) as AnyMock;
const mockRevokeSession = mock(() => Promise.resolve(undefined)) as AnyMock;

mock.module('../../repositories/session.repository', () => ({
  getSessionRepository: mock(() => ({
    findById: mock(() => Promise.resolve(null)),
    findBySessionId: mockFindBySessionId,
    findByUserId: mockFindByUserId,
    create: mock(() => Promise.resolve({ _id: 'test-id', sessionId: 'test-session' })),
    updateById: mock(() => Promise.resolve(null)),
    deleteById: mock(() => Promise.resolve(true)),
    revokeSession: mockRevokeSession,
    revoke: mockRevokeSession,
    revokeAllUserSessions: mock(() => Promise.resolve(0)),
  })),
}));

// Mock session service
const mockAccountSession = {
  type: 'account' as const,
  userId: testUserObjectId.toHexString(),
  identifier: 'test@example.com',
  identifierType: 'email' as const,
  lastActivityAt: Date.now(),
  expiresAt: Date.now() + 86_400_000,
};

const mockDestroySession = mock(() => Promise.resolve()) as AnyMock;
const mockDestroyAllSessions = mock(() => Promise.resolve(0)) as AnyMock;
const mockCreateAccountSession = mock(() =>
  Promise.resolve({
    sessionId: 'new-session',
    cookie: 'adieuu_session=new-session; Path=/; HttpOnly',
    csrfCookie: 'adieuu_csrf=mock-csrf; Path=/',
  })
) as AnyMock;

mock.module('../../services/session.service', () => ({
  createAccountSession: mockCreateAccountSession,
  createSession: mockCreateAccountSession,
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
    if (cookie.includes('adieuu_session=identity-only')) {
      return Promise.resolve({
        type: 'identity' as const,
        identityId: testUserObjectId.toHexString(),
        maxVideoDurationSeconds: 300,
        subscriptions: [],
        entitlements: [],
        isLifetime: false,
        lastActivityAt: Date.now(),
        expiresAt: Date.now() + 86_400_000,
      });
    }
    return Promise.resolve(null);
  }),
  destroySession: mockDestroySession,
  destroyAllSessions: mockDestroyAllSessions,
  getSessionIdFromRequest: mock((request: Request) => {
    const cookie = request.headers.get('Cookie') ?? '';
    const match = cookie.match(/adieuu_session=([^;]+)/);
    if (!match?.[1]) return null;
    const raw = match[1];
    const dotIdx = raw.indexOf('.');
    return dotIdx === -1 ? raw : raw.substring(0, dotIdx);
  }),
  buildLogoutCookie: mock(() => 'adieuu_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax'),
  buildAuthClearCookies: mock(() => [
    'adieuu_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
    'adieuu_csrf=; Max-Age=0; Path=/; SameSite=Lax',
  ]),
  maybeBootstrapCsrfCookie: mock(() => {}),
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
const mockGetMfaStatus = mock(() =>
  Promise.resolve({ enabled: false, totpEnabled: false, webauthnEnabled: false, totpCount: 0, webauthnCount: 0 })
) as AnyMock;
const mockVerifyTotpCode = mock(() => Promise.resolve({ success: false })) as AnyMock;
const mockVerifyWebAuthnAuthentication = mock(() => Promise.resolve({ success: false })) as AnyMock;

mock.module('../../services/mfa.service', () => ({
  getMfaStatus: mockGetMfaStatus,
  verifyTotpCode: mockVerifyTotpCode,
  verifyWebAuthnAuthentication: mockVerifyWebAuthnAuthentication,
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
const mockVerifyOtp = mock(() => Promise.resolve({ valid: true })) as AnyMock;

mock.module('../../services/otp.service', () => ({
  createOtp: mockCreateOtp,
  // Match VerifyOtpResult ({ valid, error?, ... }); wrong shape breaks other suites when this mock wins globally.
  verifyOtp: mockVerifyOtp,
}));

mock.module('../../services/rate-limit.service', () =>
  createRateLimitServiceMock({
    checkRateLimit: mockCheckRateLimit,
  }),
);

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

mock.module('../../services/geo/geo.service', () => ({
  refreshUserGeoIfStale: mock(() => Promise.resolve()),
}));

const mockTryLiftOfacSanctionedBanIfExpired = mock(() => Promise.resolve(null)) as AnyMock;
const mockEvaluateComplianceOnAccess = mock((user: typeof mockUser) =>
  Promise.resolve({ action: 'none', user }),
) as AnyMock;

mock.module('../../services/compliance/compliance-enforcement.service', () => ({
  evaluateComplianceOnAccess: mockEvaluateComplianceOnAccess,
  tryLiftOfacSanctionedBanIfExpired: mockTryLiftOfacSanctionedBanIfExpired,
  listSanctionedCountriesForClient: mock(() => Promise.resolve([])),
  buildVpnAttestationSessionPayload: mock(() => undefined),
  hasPendingVpnAttestation: mock(() => false),
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import {
  requestOtp,
  getClientIp,
  verifyOtpHandler,
  logoutHandler,
  listSessionsHandler,
  revokeSessionHandler,
  revokeAllSessionsHandler,
  verifyMfaTotpHandler,
  verifyMfaWebAuthnHandler,
  type RequestOtpInput,
} from './controller';
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
    mockVerifyOtp.mockClear();
    mockFindByIdentifier.mockClear();
    mockFindById.mockClear();
    mockCountBannedUsers.mockClear();
    mockCountBannedUsers.mockImplementation(() => Promise.resolve(1));
    mockCreateUser.mockClear();
    mockIncrementFailedAttempts.mockClear();
    mockRecordLogin.mockClear();
    mockLockAccount.mockClear();
    mockGetMfaStatus.mockClear();
    mockVerifyTotpCode.mockClear();
    mockVerifyWebAuthnAuthentication.mockClear();
    mockCreateAccountSession.mockClear();
    mockDestroySession.mockClear();
    mockDestroyAllSessions.mockClear();
    mockFindByUserId.mockClear();
    mockFindBySessionId.mockClear();
    mockRevokeSession.mockClear();
    mockRedisGet.mockClear();
    mockRedisSet.mockClear();
    mockRedisDel.mockClear();
    mockEvaluateComplianceOnAccess.mockClear();
    mockTryLiftOfacSanctionedBanIfExpired.mockClear();

    mockIsAuthIdentifierAllowed.mockImplementation(() => Promise.resolve(true));
    mockFindByIdentifier.mockImplementation(() => Promise.resolve(null));
    mockFindById.mockImplementation(() => Promise.resolve(mockUser));
    mockCreateUser.mockImplementation(() => Promise.resolve(mockUser));
    mockVerifyOtp.mockImplementation(() => Promise.resolve({ valid: true }));
    mockGetMfaStatus.mockImplementation(() =>
      Promise.resolve({ enabled: false, totpEnabled: false, webauthnEnabled: false, totpCount: 0, webauthnCount: 0 })
    );
    mockVerifyTotpCode.mockImplementation(() => Promise.resolve({ success: false }));
    mockVerifyWebAuthnAuthentication.mockImplementation(() => Promise.resolve({ success: false }));
    mockIsRedisConnected.mockImplementation(() => true);
    mockRedisGet.mockImplementation(() => Promise.resolve(null));
    mockFindByUserId.mockImplementation(() => Promise.resolve([]));
    mockFindBySessionId.mockImplementation(() => Promise.resolve(null));
    mockDestroyAllSessions.mockImplementation(() => Promise.resolve(0));
    mockEvaluateComplianceOnAccess.mockImplementation((user: typeof mockUser) =>
      Promise.resolve({ action: 'none', user }),
    );
    mockTryLiftOfacSanctionedBanIfExpired.mockImplementation(() => Promise.resolve(null));

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

    describe('account lockout', () => {
      test('returns account_locked when user is locked', async () => {
        mockFindByIdentifier.mockImplementation(() => Promise.resolve({
          ...mockUser,
          lockedUntil: new Date(Date.now() + 60_000),
        }));

        const result = await requestOtp(
          { identifier: 'user@example.com', type: 'email' },
          '192.168.1.1'
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBe('account_locked');
          expect(result.retryAfterSeconds).toBeGreaterThan(0);
        }
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

    test('returns account_locked when user is locked before verification', async () => {
      mockFindByIdentifier.mockImplementation(() => Promise.resolve({
        ...mockUser,
        lockedUntil: new Date(Date.now() + 60_000),
      }));

      const result = await verifyOtpHandler(
        { identifier: 'user@example.com', code: '123456' },
        '192.168.1.1'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('account_locked');
      }
      expect(mockVerifyOtp).not.toHaveBeenCalled();
    });

    test('returns rate_limited when verify IP limit exceeded', async () => {
      mockCheckRateLimit.mockImplementation(() => Promise.resolve({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60000,
        limit: 10,
      }));

      const result = await verifyOtpHandler(
        { identifier: 'user@example.com', code: '123456' },
        '192.168.1.1'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('rate_limited');
      }
    });

    test('returns invalid on failed otp verification', async () => {
      mockVerifyOtp.mockImplementation(() => Promise.resolve({ valid: false, error: 'invalid' }));

      const result = await verifyOtpHandler(
        { identifier: 'user@example.com', code: '000000' },
        '192.168.1.1'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid');
      }
    });

    test('returns max_attempts when otp service reports max attempts', async () => {
      mockVerifyOtp.mockImplementation(() => Promise.resolve({ valid: false, error: 'max_attempts' }));

      const result = await verifyOtpHandler(
        { identifier: 'user@example.com', code: '000000' },
        '192.168.1.1'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('max_attempts');
      }
    });

    test('returns backoff when otp service reports backoff', async () => {
      mockVerifyOtp.mockImplementation(() =>
        Promise.resolve({ valid: false, error: 'backoff', retryAfterSeconds: 30 })
      );

      const result = await verifyOtpHandler(
        { identifier: 'user@example.com', code: '000000' },
        '192.168.1.1'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('backoff');
        expect(result.retryAfterSeconds).toBe(30);
      }
    });

    test('creates session cookie on successful verification without mfa', async () => {
      const result = await verifyOtpHandler(
        { identifier: 'user@example.com', code: '123456' },
        '192.168.1.1',
        'TestAgent/1.0'
      );

      expect(result.success).toBe(true);
      if (result.success && 'cookie' in result) {
        expect(result.cookie).toContain('adieuu_session=');
      }
      expect(mockCreateAccountSession).toHaveBeenCalled();
      expect(mockCreateUser).toHaveBeenCalled();
    });

    test('returns mfaRequired when user has mfa enabled', async () => {
      mockFindByIdentifier.mockImplementation(() => Promise.resolve(mockUser));
      mockGetMfaStatus.mockImplementation(() =>
        Promise.resolve({ enabled: true, totpEnabled: true, webauthnEnabled: false, totpCount: 1, webauthnCount: 0 })
      );

      const result = await verifyOtpHandler(
        { identifier: 'user@example.com', code: '123456' },
        '192.168.1.1'
      );

      expect(result.success).toBe(true);
      if (result.success && 'mfaRequired' in result) {
        expect(result.mfaRequired).toBe(true);
        expect(result.mfaToken).toBeTruthy();
        expect(result.mfaOptions.totpEnabled).toBe(true);
      }
      expect(mockCreateAccountSession).not.toHaveBeenCalled();
      expect(mockRedisSet).toHaveBeenCalled();
    });

    test('returns account_banned with moderationReason for banned user', async () => {
      mockTryLiftOfacSanctionedBanIfExpired.mockImplementationOnce(() => Promise.resolve(null));
      mockCountBannedUsers.mockImplementation(() => Promise.resolve(5));
      mockFindByIdentifier.mockImplementation(() => Promise.resolve({
        ...mockUser,
        isBanned: true,
        moderationReason: 'TOS violation',
        moderationCategory: 'tos_violation',
      }));

      const result = await verifyOtpHandler(
        { identifier: 'user@example.com', code: '123456' },
        '192.168.1.1'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('account_banned');
        expect(result.moderationReason).toBe('TOS violation');
        expect(result.moderationCategory).toBe('tos_violation');
        expect(result.bannedPeerCount).toBe(4);
      }
      expect(mockCountBannedUsers).toHaveBeenCalledWith('tos_violation');
      expect(mockCreateAccountSession).not.toHaveBeenCalled();
    });

    test('allows login when OFAC ban country is no longer sanctioned', async () => {
      mockTryLiftOfacSanctionedBanIfExpired.mockImplementationOnce(() =>
        Promise.resolve({
          ...mockUser,
          isBanned: undefined,
          moderationReason: undefined,
          moderationCategory: undefined,
          moderationCountryCode: undefined,
        }),
      );
      mockFindByIdentifier.mockImplementation(() => Promise.resolve({
        ...mockUser,
        isBanned: true,
        moderationCategory: 'ofac_sanctioned',
        moderationCountryCode: 'ML',
        moderationReason: 'You connected from an IP address associated with Mali, which is subject to US sanctions. We are unable to provide service. Appeals are not available.',
      }));

      const result = await verifyOtpHandler(
        { identifier: 'user@example.com', code: '123456' },
        '192.168.1.1'
      );

      expect(result.success).toBe(true);
      expect(mockTryLiftOfacSanctionedBanIfExpired).toHaveBeenCalled();
      expect(mockCreateAccountSession).toHaveBeenCalled();
    });

    test('returns account_suspended with suspendedUntil for suspended user', async () => {
      const futureDate = new Date(Date.now() + 86_400_000);
      mockFindByIdentifier.mockImplementation(() => Promise.resolve({
        ...mockUser,
        suspendedUntil: futureDate,
        moderationReason: 'Temporary cooldown',
      }));

      const result = await verifyOtpHandler(
        { identifier: 'user@example.com', code: '123456' },
        '192.168.1.1'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('account_suspended');
        expect(result.suspendedUntil).toBe(futureDate.toISOString());
        expect(result.moderationReason).toBe('Temporary cooldown');
      }
      expect(mockCreateAccountSession).not.toHaveBeenCalled();
    });

    test('allows login when suspendedUntil is in the past', async () => {
      const pastDate = new Date(Date.now() - 60_000);
      mockFindByIdentifier.mockImplementation(() => Promise.resolve({
        ...mockUser,
        suspendedUntil: pastDate,
        moderationReason: 'Expired suspension',
      }));

      const result = await verifyOtpHandler(
        { identifier: 'user@example.com', code: '123456' },
        '192.168.1.1'
      );

      expect(result.success).toBe(true);
      expect(mockCreateAccountSession).toHaveBeenCalled();
    });
  });

  describe('logoutHandler', () => {
    test('destroys session and returns clear cookies', async () => {
      const request = new Request('http://localhost', {
        headers: { Cookie: 'adieuu_session=test-session' },
      });

      const result = await logoutHandler(request);

      expect(result.clearCookies.length).toBeGreaterThan(0);
      expect(result.clearCookies[0]).toContain('Max-Age=0');
      expect(mockDestroySession).toHaveBeenCalledWith('test-session');
    });

    test('returns clear cookies even without session', async () => {
      const result = await logoutHandler(new Request('http://localhost'));
      expect(result.clearCookies[0]).toContain('Max-Age=0');
      expect(mockDestroySession).not.toHaveBeenCalled();
    });
  });

  describe('listSessionsHandler', () => {
    test('returns unauthorized without account session', async () => {
      const result = await listSessionsHandler(new Request('http://localhost'));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('unauthorized');
      }
    });

    test('returns sessions with current session marked', async () => {
      mockFindByUserId.mockImplementation(() => Promise.resolve([
        {
          sessionId: 'other-session',
          identifier: 'test@example.com',
          identifierType: 'email',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          lastActivityAt: new Date('2024-01-02T00:00:00Z'),
          userAgent: 'OtherAgent',
          ipAddress: '10.0.0.1',
        },
      ]));

      const request = new Request('http://localhost', {
        headers: { Cookie: 'adieuu_session=test-session' },
      });
      const result = await listSessionsHandler(request);

      expect(result.success).toBe(true);
      if (result.success) {
        const current = result.sessions.find((s) => s.isCurrent);
        expect(current?.id).toBe('test-session');
      }
    });
  });

  describe('revokeSessionHandler', () => {
    test('returns unauthorized without account session', async () => {
      const result = await revokeSessionHandler(new Request('http://localhost'), 'other-session');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('unauthorized');
      }
    });

    test('returns cannot_revoke_current for current session', async () => {
      const request = new Request('http://localhost', {
        headers: { Cookie: 'adieuu_session=test-session' },
      });
      const result = await revokeSessionHandler(request, 'test-session');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('cannot_revoke_current');
      }
    });

    test('returns not_found when session belongs to another user', async () => {
      mockFindBySessionId.mockImplementation(() => Promise.resolve({
        sessionId: 'other-session',
        userId: new ObjectId('507f1f77bcf86cd799439012'),
      }));

      const request = new Request('http://localhost', {
        headers: { Cookie: 'adieuu_session=test-session' },
      });
      const result = await revokeSessionHandler(request, 'other-session');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('not_found');
      }
    });

    test('revokes another session owned by the user', async () => {
      mockFindBySessionId.mockImplementation(() => Promise.resolve({
        sessionId: 'other-session',
        userId: testUserObjectId,
      }));

      const request = new Request('http://localhost', {
        headers: { Cookie: 'adieuu_session=test-session' },
      });
      const result = await revokeSessionHandler(request, 'other-session');

      expect(result.success).toBe(true);
      expect(mockRevokeSession).toHaveBeenCalledWith('other-session');
    });
  });

  describe('revokeAllSessionsHandler', () => {
    test('revokes other sessions but keeps current session cookie empty', async () => {
      mockFindByUserId.mockImplementation(() => Promise.resolve([
        { sessionId: 'test-session' },
        { sessionId: 'other-session' },
      ]));

      const request = new Request('http://localhost', {
        headers: { Cookie: 'adieuu_session=test-session' },
      });
      const result = await revokeAllSessionsHandler(request, false);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.count).toBe(1);
        expect(result.clearCookies).toEqual([]);
      }
    });

    test('includeCurrentSession destroys all sessions and clears cookie', async () => {
      mockDestroyAllSessions.mockImplementation(() => Promise.resolve(2));

      const request = new Request('http://localhost', {
        headers: { Cookie: 'adieuu_session=test-session' },
      });
      const result = await revokeAllSessionsHandler(request, true);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.count).toBe(2);
        expect(result.clearCookies[0]).toContain('Max-Age=0');
      }
    });
  });

  describe('verifyMfaTotpHandler', () => {
    const pendingLogin = {
      userId: testUserObjectId.toHexString(),
      identifier: 'user@example.com',
      identifierType: 'email' as const,
      ipAddress: '192.168.1.1',
      createdAt: Date.now(),
    };

    test('returns invalid_token when pending login missing', async () => {
      const result = await verifyMfaTotpHandler('missing-token', '123456');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_token');
      }
    });

    test('returns invalid_code when totp verification fails', async () => {
      mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(pendingLogin)));

      const result = await verifyMfaTotpHandler('valid-token', '000000');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_code');
      }
    });

    test('creates session cookie on successful totp verification', async () => {
      mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(pendingLogin)));
      mockVerifyTotpCode.mockImplementation(() => Promise.resolve({ success: true }));

      const result = await verifyMfaTotpHandler('valid-token', '123456');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.cookie).toContain('adieuu_session=');
      }
      expect(mockRedisDel).toHaveBeenCalled();
      expect(mockCreateAccountSession).toHaveBeenCalled();
    });

    test('returns user_not_found when account was deleted before session creation', async () => {
      mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(pendingLogin)));
      mockVerifyTotpCode.mockImplementation(() => Promise.resolve({ success: true }));
      mockFindById.mockImplementation(() => Promise.resolve(null));

      const result = await verifyMfaTotpHandler('valid-token', '123456');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('user_not_found');
      }
      expect(mockCreateAccountSession).not.toHaveBeenCalled();
    });
  });

  describe('verifyMfaWebAuthnHandler', () => {
    const pendingLogin = {
      userId: testUserObjectId.toHexString(),
      identifier: 'user@example.com',
      identifierType: 'email' as const,
      ipAddress: '192.168.1.1',
      createdAt: Date.now(),
    };

    test('returns invalid_token when pending login missing', async () => {
      const result = await verifyMfaWebAuthnHandler('missing-token', {} as never);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_token');
      }
    });

    test('creates session cookie on successful webauthn verification', async () => {
      mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(pendingLogin)));
      mockVerifyWebAuthnAuthentication.mockImplementation(() => Promise.resolve({ success: true }));

      const result = await verifyMfaWebAuthnHandler('valid-token', { id: 'cred' } as never);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.cookie).toContain('adieuu_session=');
      }
      expect(mockCreateAccountSession).toHaveBeenCalled();
    });

    test('returns user_not_found when account was deleted before session creation', async () => {
      mockRedisGet.mockImplementation(() => Promise.resolve(JSON.stringify(pendingLogin)));
      mockVerifyWebAuthnAuthentication.mockImplementation(() => Promise.resolve({ success: true }));
      mockFindById.mockImplementation(() => Promise.resolve(null));

      const result = await verifyMfaWebAuthnHandler('valid-token', { id: 'cred' } as never);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('user_not_found');
      }
      expect(mockCreateAccountSession).not.toHaveBeenCalled();
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

    test('returns identity session shape when only identity cookie present', async () => {
      const response = await makeRouteRequest('/auth/session', {
        cookies: 'adieuu_session=identity-only',
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { data: { sessionType: string } };
      expect(body.data.sessionType).toBe('identity');
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
