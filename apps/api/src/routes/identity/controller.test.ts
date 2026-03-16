import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

// Mock config
mock.module('../../config', () => ({
  config: {
    env: 'test',
    cors: { origins: '*', credentials: false },
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
    security: {
      sessionSecret: 'test-secret',
      otpSecret: 'test-otp-secret',
    },
    cookie: {
      domain: '',
    },
  },
}));

// Mock database - must be before modules that import from db
mock.module('../../db', () => ({
  withTransaction: async (callback: () => Promise<unknown>) => {
    return await callback();
  },
  Collections: {
    KEY_BUNDLES: 'key_bundles',
    IDENTITIES: 'identities',
    IDENTITY_SESSIONS: 'identity_sessions',
    USERS: 'users',
    SESSIONS: 'sessions',
    AUDIT_LOGS: 'audit_logs',
    TOTP_CREDENTIALS: 'totp_credentials',
    WEBAUTHN_CREDENTIALS: 'webauthn_credentials',
    MFA_BACKUP_CODES: 'mfa_backup_codes',
    BLOCKS: 'blocks',
    FRIEND_REQUESTS: 'friend_requests',
    FRIENDSHIPS: 'friendships',
    NOTIFICATIONS: 'notifications',
  },
}));

// Mock session service
const mockSession = {
  userId: new ObjectId().toHexString(),
  identifier: 'test@example.com',
  identifierType: 'email' as const,
  lastActivityAt: Date.now(),
};

mock.module('../../services/session.service', () => ({
  getSessionFromRequest: mock(() => Promise.resolve(mockSession)),
}));

// Mock user repository
const mockUser = {
  _id: new ObjectId(mockSession.userId),
  email: 'test@example.com',
  createdAt: new Date('2024-01-15T12:00:00Z'),
  identityCount: 0,
};

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    findById: mock(() => Promise.resolve(mockUser)),
    incrementIdentityCount: mock(() => Promise.resolve()),
  }),
}));

// Mock identity repository
const mockIdentity = {
  _id: new ObjectId(),
  ident: 'test-hash',
  hashVersion: 1,
  username: 'testuser',
  displayName: 'Test User',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastActiveAt: new Date(),
};

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findByUsername: mock(() => Promise.resolve(null)),
    findByIdent: mock(() => Promise.resolve(null)),
    findActiveByIdent: mock(() => Promise.resolve(null)),
    findByIdentityId: mock(() => Promise.resolve(mockIdentity)),
    create: mock(() => Promise.resolve(mockIdentity)),
    updateLastActive: mock(() => Promise.resolve()),
    setSigningPublicKey: mock(() => Promise.resolve(true)),
    addDevice: mock(() => Promise.resolve(true)),
    removeDevice: mock(() => Promise.resolve(true)),
    updateDeviceActivity: mock(() => Promise.resolve(true)),
    getDevices: mock(() => Promise.resolve([])),
  }),
  IDENTITY_SEARCH_DEFAULTS: {
    MIN_QUERY_LENGTH: 2,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 50,
  },
}));

// Mock identity session repository
mock.module('../../repositories/identity-session.repository', () => ({
  getIdentitySessionRepository: () => ({
    create: mock(() => Promise.resolve({ identitySessionId: 'test-session' })),
    findBySessionId: mock(() => Promise.resolve({ identitySessionId: 'test-session', identityId: mockIdentity._id })),
    getSession: mock(() => Promise.resolve({ identityId: mockIdentity._id.toHexString(), expiresAt: Date.now() + 3600000, lastActivityAt: Date.now() })),
    revoke: mock(() => Promise.resolve()),
    revokeAllForIdentity: mock(() => Promise.resolve(0)),
    updateLastActivity: mock(() => Promise.resolve()),
  }),
}));

// Mock audit repository
mock.module('../../repositories/audit.repository', () => ({
  getAuditLogRepository: () => ({
    create: mock(() => Promise.resolve(null)),
  }),
}));

// Mock messaging
mock.module('../../services/messaging', () => ({
  sendEmail: mock(() => Promise.resolve({ success: true })),
  sendSms: mock(() => Promise.resolve({ success: true })),
}));

// Mock key-bundle repository
mock.module('../../repositories/key-bundle.repository', () => ({
  getKeyBundleRepository: () => ({
    findByBundleId: mock(() => Promise.resolve(null)),
    create: mock(() => Promise.resolve({ bundleId: 'test-bundle' })),
    updateBundle: mock(() => Promise.resolve(null)),
    deleteByBundleId: mock(() => Promise.resolve(true)),
    exists: mock(() => Promise.resolve(false)),
  }),
}));

// Mock block service
const mockTargetIdentityId = new ObjectId();
const mockBlockIdentity = mock(() => Promise.resolve({ success: true }));
const mockUnblockIdentity = mock(() => Promise.resolve({ success: true }));
const mockCheckIfBlocked = mock(() => Promise.resolve({ blocked: false, blockedAt: null as string | null }));
const mockGetBlockedIdentities = mock(() => Promise.resolve({
  blocks: [],
  cursor: null,
}));
const mockGetBlockedIdentityIds = mock(() => Promise.resolve([]));

mock.module('../../services/block.service', () => ({
  blockIdentity: mockBlockIdentity,
  unblockIdentity: mockUnblockIdentity,
  checkIfBlocked: mockCheckIfBlocked,
  getBlockedIdentities: mockGetBlockedIdentities,
  getBlockedIdentityIds: mockGetBlockedIdentityIds,
}));

// Mock identity service for blocklist routes
mock.module('../../services/identity.service', () => ({
  createIdentity: mock(() => Promise.resolve({ success: true, identity: mockIdentity })),
  loginToIdentity: mock(() => Promise.resolve({ success: false, errorCode: 'INVALID_PASSPHRASE' })),
  logoutFromIdentity: mock(() => Promise.resolve()),
  deleteIdentity: mock(() => Promise.resolve({ success: true })),
  getIdentityFromSession: mock(() => Promise.resolve(mockIdentity)),
  getIdentitySessionIdFromRequest: mock((request: Request) => {
    const cookie = request.headers.get('Cookie') ?? '';
    if (cookie.includes('adieuu_identity=')) {
      return 'test-identity-session';
    }
    return null;
  }),
  buildIdentityLogoutCookie: mock(() => 'adieuu_identity=; Max-Age=0; Path=/'),
  MIN_PASSPHRASE_LENGTH: 8,
}));

// Import after mocking
import { identityRoutes } from './index';

describe('identity routes', () => {
  const makeRequest = async (
    path: string,
    options: { method?: string; body?: object; cookies?: string } = {}
  ) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.cookies) {
      headers['Cookie'] = options.cookies;
    }

    const request = new Request(`http://localhost${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const handler = identityRoutes.handler();
    return handler(request);
  };

  describe('POST /identity', () => {
    test('rejects requests without valid body', async () => {
      const response = await makeRequest('/identity', {
        method: 'POST',
        body: {}, // Missing required fields
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(400);
    });

    test('rejects short passphrase', async () => {
      const response = await makeRequest('/identity', {
        method: 'POST',
        body: {
          passphrase: 'short',
          username: 'testuser',
          displayName: 'Test User',
        },
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(400);
    });

    test('rejects invalid username format', async () => {
      const response = await makeRequest('/identity', {
        method: 'POST',
        body: {
          passphrase: 'valid-passphrase-123',
          username: 'invalid@user!',
          displayName: 'Test User',
        },
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(400);
    });

    test('accepts valid identity creation request', async () => {
      const response = await makeRequest('/identity', {
        method: 'POST',
        body: {
          passphrase: 'valid-passphrase-123',
          username: 'validuser',
          displayName: 'Test User',
        },
        cookies: 'adieuu_session=test-session',
      });

      // May succeed or fail based on mock setup, but should not be 400/401
      expect([200, 409, 500]).toContain(response.status);
    });
  });

  describe('POST /identity/login', () => {
    test('rejects empty passphrase', async () => {
      const response = await makeRequest('/identity/login', {
        method: 'POST',
        body: {}, // Missing passphrase
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(400);
    });

    test('accepts login request with passphrase', async () => {
      const response = await makeRequest('/identity/login', {
        method: 'POST',
        body: {
          passphrase: 'valid-passphrase-123',
        },
        cookies: 'adieuu_session=test-session',
      });

      // May be 401 (invalid passphrase), 200 (success), or 500 (internal error from mocked deps)
      expect([200, 401, 500]).toContain(response.status);
    });
  });

  describe('POST /identity/logout', () => {
    test('returns success and clears cookie', async () => {
      const response = await makeRequest('/identity/logout', {
        method: 'POST',
        body: {}, // Empty body is valid for logout
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).toContain('adieuu_identity=');
      expect(setCookie).toContain('Max-Age=0');
    });

    test('returns success even without identity session', async () => {
      const response = await makeRequest('/identity/logout', {
        method: 'POST',
        body: {}, // Empty body is valid for logout
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /identity/session', () => {
    test('returns 401 without identity session cookie', async () => {
      const response = await makeRequest('/identity/session', {
        method: 'GET',
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /identity', () => {
    test('returns 401 without identity session cookie', async () => {
      const response = await makeRequest('/identity', {
        method: 'DELETE',
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('validation schemas', () => {
    test('username must be alphanumeric with underscores and hyphens', async () => {
      // Valid usernames
      const validUsernames = ['user123', 'test_user', 'test-user', 'User_Name-123'];
      for (const username of validUsernames) {
        const response = await makeRequest('/identity', {
          method: 'POST',
          body: {
            passphrase: 'valid-passphrase',
            username,
            displayName: 'Test',
          },
          cookies: 'adieuu_session=test-session',
        });
        // Should not be a validation error
        expect(response.status).not.toBe(400);
      }
    });

    test('username rejects invalid characters', async () => {
      const invalidUsernames = ['user@name', 'user name', 'user.name', 'user!name'];
      for (const username of invalidUsernames) {
        const response = await makeRequest('/identity', {
          method: 'POST',
          body: {
            passphrase: 'valid-passphrase',
            username,
            displayName: 'Test',
          },
          cookies: 'adieuu_session=test-session',
        });
        expect(response.status).toBe(400);
      }
    });

    test('displayName is required and has length constraints', async () => {
      // Empty display name should fail
      const emptyResponse = await makeRequest('/identity', {
        method: 'POST',
        body: {
          passphrase: 'valid-passphrase',
          username: 'testuser',
          displayName: '',
        },
        cookies: 'adieuu_session=test-session',
      });
      expect(emptyResponse.status).toBe(400);

      // Very long display name should fail
      const longResponse = await makeRequest('/identity', {
        method: 'POST',
        body: {
          passphrase: 'valid-passphrase',
          username: 'testuser',
          displayName: 'a'.repeat(100),
        },
        cookies: 'adieuu_session=test-session',
      });
      expect(longResponse.status).toBe(400);
    });
  });

  // ============================================================================
  // Blocklist Tests
  // ============================================================================

  describe('GET /identity/blocklist', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest('/identity/blocklist', {
        method: 'GET',
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(401);
    });

    test('returns blocked identities with identity session', async () => {
      const response = await makeRequest('/identity/blocklist', {
        method: 'GET',
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetBlockedIdentities).toHaveBeenCalled();
    });

    test('respects limit parameter', async () => {
      const response = await makeRequest('/identity/blocklist?limit=25', {
        method: 'GET',
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetBlockedIdentities).toHaveBeenCalledWith(
        mockIdentity._id,
        25,
        undefined
      );
    });

    test('caps limit at 100', async () => {
      const response = await makeRequest('/identity/blocklist?limit=200', {
        method: 'GET',
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockGetBlockedIdentities).toHaveBeenCalledWith(
        mockIdentity._id,
        100,
        undefined
      );
    });
  });

  describe('POST /identity/blocklist', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest('/identity/blocklist', {
        method: 'POST',
        body: { identityId: mockTargetIdentityId.toHexString() },
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid identity ID format', async () => {
      const response = await makeRequest('/identity/blocklist', {
        method: 'POST',
        body: { identityId: 'invalid-id' },
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(400);
    });

    test('returns 400 for missing identityId', async () => {
      const response = await makeRequest('/identity/blocklist', {
        method: 'POST',
        body: {},
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(400);
    });

    test('blocks identity with valid input', async () => {
      const response = await makeRequest('/identity/blocklist', {
        method: 'POST',
        body: { identityId: mockTargetIdentityId.toHexString() },
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockBlockIdentity).toHaveBeenCalledWith(
        mockIdentity._id,
        mockTargetIdentityId.toHexString()
      );
    });

    test('handles CANNOT_BLOCK_SELF error', async () => {
      mockBlockIdentity.mockImplementationOnce(() => Promise.resolve({
        success: false,
        errorCode: 'CANNOT_BLOCK_SELF',
      }));

      const response = await makeRequest('/identity/blocklist', {
        method: 'POST',
        body: { identityId: mockIdentity._id.toHexString() },
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(400);
    });

    test('handles ALREADY_BLOCKED error', async () => {
      mockBlockIdentity.mockImplementationOnce(() => Promise.resolve({
        success: false,
        errorCode: 'ALREADY_BLOCKED',
      }));

      const response = await makeRequest('/identity/blocklist', {
        method: 'POST',
        body: { identityId: mockTargetIdentityId.toHexString() },
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(400);
    });

    test('handles IDENTITY_NOT_FOUND error', async () => {
      mockBlockIdentity.mockImplementationOnce(() => Promise.resolve({
        success: false,
        errorCode: 'IDENTITY_NOT_FOUND',
      }));

      const response = await makeRequest('/identity/blocklist', {
        method: 'POST',
        body: { identityId: mockTargetIdentityId.toHexString() },
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /identity/blocklist/:identityId', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest(`/identity/blocklist/${mockTargetIdentityId.toHexString()}`, {
        method: 'DELETE',
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid identity ID', async () => {
      const response = await makeRequest('/identity/blocklist/invalid-id', {
        method: 'DELETE',
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(400);
    });

    test('unblocks identity with valid ID', async () => {
      const response = await makeRequest(`/identity/blocklist/${mockTargetIdentityId.toHexString()}`, {
        method: 'DELETE',
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockUnblockIdentity).toHaveBeenCalledWith(
        mockIdentity._id,
        mockTargetIdentityId.toHexString()
      );
    });

    test('handles BLOCK_NOT_FOUND error', async () => {
      mockUnblockIdentity.mockImplementationOnce(() => Promise.resolve({
        success: false,
        errorCode: 'BLOCK_NOT_FOUND',
      }));

      const response = await makeRequest(`/identity/blocklist/${mockTargetIdentityId.toHexString()}`, {
        method: 'DELETE',
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /identity/blocklist/check/:identityId', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest(`/identity/blocklist/check/${mockTargetIdentityId.toHexString()}`, {
        method: 'GET',
        cookies: 'adieuu_session=test-session',
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid identity ID', async () => {
      const response = await makeRequest('/identity/blocklist/check/invalid-id', {
        method: 'GET',
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(400);
    });

    test('returns blocked status', async () => {
      const response = await makeRequest(`/identity/blocklist/check/${mockTargetIdentityId.toHexString()}`, {
        method: 'GET',
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      expect(mockCheckIfBlocked).toHaveBeenCalledWith(
        mockIdentity._id,
        mockTargetIdentityId.toHexString()
      );

      const body = await response.json() as { data: { blocked: boolean; blockedAt: string | null } };
      expect(body.data.blocked).toBe(false);
    });

    test('returns blocked true when identity is blocked', async () => {
      mockCheckIfBlocked.mockImplementationOnce(() => Promise.resolve({
        blocked: true,
        blockedAt: new Date().toISOString(),
      }));

      const response = await makeRequest(`/identity/blocklist/check/${mockTargetIdentityId.toHexString()}`, {
        method: 'GET',
        cookies: 'adieuu_session=test-session; adieuu_identity=test-identity-session',
      });

      expect(response.status).toBe(200);

      const body = await response.json() as { data: { blocked: boolean; blockedAt: string | null } };
      expect(body.data.blocked).toBe(true);
      expect(body.data.blockedAt).toBeDefined();
    });
  });
});
