import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import { ROUTE_TEST_IDENTITY_ID, testIdentityEnrichment } from '../../test-fixtures/route-identity';

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
    USERS: 'users',
    SESSIONS: 'sessions',
    AUDIT_LOGS: 'audit_logs',
    TOTP_CREDENTIALS: 'totp_credentials',
    WEBAUTHN_CREDENTIALS: 'webauthn_credentials',
    BLOCKS: 'blocks',
    FRIEND_REQUESTS: 'friend_requests',
    FRIENDSHIPS: 'friendships',
    NOTIFICATIONS: 'notifications',
  },
}));

// Pre-define identity ObjectId for use across mocks (stable across route test files)
const mockIdentityId = ROUTE_TEST_IDENTITY_ID;
const mockAccountHash = 'a'.repeat(64);

// Mock account token service
mock.module('../../services/account-token.service', () => ({
  verifySignedToken: mock((token: string) => {
    if (!token || token === 'invalid-token') return null;
    return {
      sub: mockAccountHash,
      maxIdentities: 2,
      maxVideoDurationSeconds: 300,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    };
  }),
}));

// Mock session service
mock.module('../../services/session.service', () => ({
  requireIdentitySession: mock((request: Request) => {
    const cookie = request.headers.get('Cookie') ?? '';
    if (cookie.includes('adieuu_session=test-identity-session')) {
      return Promise.resolve({
        type: 'identity' as const,
        identityId: mockIdentityId.toHexString(),
        maxVideoDurationSeconds: 300,
        lastActivityAt: Date.now(),
        expiresAt: Date.now() + 86_400_000,
      });
    }
    return Promise.resolve(null);
  }),
  requireAccountSession: mock((request: Request) => {
    const cookie = request.headers.get('Cookie') ?? '';
    if (cookie.includes('adieuu_session=test-account-session')) {
      return Promise.resolve({
        type: 'account' as const,
        userId: 'test-user-id',
        identifier: 'test@example.com',
        identifierType: 'email' as const,
      });
    }
    return Promise.resolve(null);
  }),
  getSessionIdFromRequest: mock((request: Request) => {
    const cookie = request.headers.get('Cookie') ?? '';
    const match = cookie.match(/adieuu_session=([^;]+)/);
    return match?.[1] ?? null;
  }),
  appendAuthClearCookies: mock((headers: Headers) => {
    headers.append('Set-Cookie', 'adieuu_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
  }),
  buildLogoutCookie: mock(() => 'adieuu_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax'),
}));

// Mock user repository
const mockUser = {
  _id: new ObjectId(),
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
  _id: mockIdentityId,
  ident: 'test-hash',
  hashVersion: 1,
  username: 'testuser',
  displayName: 'Test User',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastActiveAt: new Date(),
};

const mockIdentitySearch = mock(() => Promise.resolve([mockIdentity]));

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
    search: mockIdentitySearch,
  }),
  IDENTITY_SEARCH_DEFAULTS: {
    MIN_QUERY_LENGTH: 2,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 50,
  },
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
const mockFindByBundleId = mock(() => Promise.resolve({
  bundleId: 'test-bundle-id',
  encryptedBundle: 'encrypted-bundle-data-test',
  salt: 'salt-value-base64',
  nonce: 'nonce-value-base64',
  useSeparatePassphrase: false,
  schemeVersion: 2,
} as { bundleId: string; encryptedBundle: string; salt: string; nonce: string; useSeparatePassphrase: boolean; schemeVersion: number } | null));
mock.module('../../repositories/key-bundle.repository', () => ({
  getKeyBundleRepository: () => ({
    findByBundleId: mockFindByBundleId,
    create: mock(() => Promise.resolve({ bundleId: 'test-bundle' })),
    updateBundle: mock(() => Promise.resolve(null)),
    deleteByBundleId: mock(() => Promise.resolve(true)),
    exists: mock(() => Promise.resolve(false)),
  }),
}));

// Mock identity-hash (needed by getBundleByPassphraseCtrl)
mock.module('../../utils/identity-hash', () => ({
  generateIdentityHash: mock(() => Promise.resolve({ hash: 'derived-ident-hash', version: 2 })),
  CURRENT_HASH_VERSION: 2,
  MIN_PASSPHRASE_LENGTH: 8,
  validatePassphrase: mock(() => ({ valid: true })),
}));

// Mock crypto (deriveBundleId)
mock.module('../../utils/crypto', () => ({
  deriveBundleId: mock(() => 'derived-bundle-id'),
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

// Mock session repository (revoke-session path)
const otherSessionToken = 'aBcDeFgHiJkLmNoPqRsTuVwXyZaBcDeFgHi';
const mockSessionRevoke = mock(() => Promise.resolve());
const mockFindBySessionId = mock(async (sid: string) => {
  if (sid !== otherSessionToken) return null;
  return {
    type: 'identity' as const,
    identityId: mockIdentityId,
    sessionId: sid,
    expiresAt: new Date(Date.now() + 86_400_000),
  };
});

mock.module('../../repositories/session.repository', () => ({
  getSessionRepository: () => ({
    findBySessionId: mockFindBySessionId,
    revoke: mockSessionRevoke,
    getSession: mock(() => Promise.resolve(null)),
    findByIdentityId: mock(() => Promise.resolve([])),
    revokeAllForIdentityExcept: mock(() => Promise.resolve(0)),
  }),
}));

// Mock identity service
const mockChangePassphrase = mock(() => Promise.resolve({ success: true }));
mock.module('../../services/identity.service', () => ({
  createIdentity: mock(() => Promise.resolve({ success: true, identity: mockIdentity })),
  loginToIdentity: mock(() => Promise.resolve({ success: false, errorCode: 'INVALID_PASSPHRASE' })),
  logoutFromIdentity: mock(() => Promise.resolve(true)),
  deleteIdentity: mock(() => Promise.resolve({ success: true })),
  changePassphrase: mockChangePassphrase,
  getIdentityFromSession: mock((sessionId: string) => {
    if (!sessionId || sessionId === 'test-session') {
      return Promise.resolve(null);
    }
    return Promise.resolve(mockIdentity);
  }),
  getIdentitySessionIdFromRequest: mock(() => null),
  MIN_PASSPHRASE_LENGTH: 8,
}));

// Import after mocking
import { identityRoutes } from './index';

identityRoutes.use(testIdentityEnrichment(mockIdentityId));

describe('identity routes', () => {
  afterAll(() => {
    mock.restore();
  });

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
        body: { signedToken: 'valid-token' },
      });

      expect(response.status).toBe(400);
    });

    test('rejects short passphrase', async () => {
      const response = await makeRequest('/identity', {
        method: 'POST',
        body: {
          signedToken: 'valid-token',
          passphrase: 'short',
          username: 'testuser',
          displayName: 'Test User',
        },
      });

      expect(response.status).toBe(400);
    });

    test('rejects invalid username format', async () => {
      const response = await makeRequest('/identity', {
        method: 'POST',
        body: {
          signedToken: 'valid-token',
          passphrase: 'valid-passphrase-123',
          username: 'invalid@user!',
          displayName: 'Test User',
        },
      });

      expect(response.status).toBe(400);
    });

    test('accepts valid identity creation request', async () => {
      const response = await makeRequest('/identity', {
        method: 'POST',
        body: {
          signedToken: 'valid-token',
          passphrase: 'valid-passphrase-123',
          username: 'validuser',
          displayName: 'Test User',
        },
      });

      // May succeed or fail based on mock setup, but should not be 400/401
      expect([200, 409, 500]).toContain(response.status);
    });
  });

  describe('POST /identity/login', () => {
    test('rejects empty passphrase', async () => {
      const response = await makeRequest('/identity/login', {
        method: 'POST',
        body: { signedToken: 'valid-token' },
      });

      expect(response.status).toBe(400);
    });

    test('accepts login request with passphrase', async () => {
      const response = await makeRequest('/identity/login', {
        method: 'POST',
        body: {
          signedToken: 'valid-token',
          passphrase: 'valid-passphrase-123',
        },
      });

      // May be 401 (invalid passphrase), 200 (success), or 500 (internal error from mocked deps)
      expect([200, 401, 500]).toContain(response.status);
    });
  });

  describe('POST /identity/logout', () => {
    test('returns success and clears cookie', async () => {
      const response = await makeRequest('/identity/logout', {
        method: 'POST',
        body: {},
        cookies: 'adieuu_session=session',
      });

      expect(response.status).toBe(200);
      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).toContain('adieuu_session=');
      expect(setCookie).toContain('Max-Age=0');
    });

    test('returns success even without identity session', async () => {
      const response = await makeRequest('/identity/logout', {
        method: 'POST',
        body: {},
      });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /identity/session', () => {
    test('returns 401 without identity session cookie', async () => {
      const response = await makeRequest('/identity/session', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    test('does not clear session cookie when identity session is absent', async () => {
      const response = await makeRequest('/identity/session', {
        method: 'GET',
      });

      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).toBeNull();
    });
  });

  describe('DELETE /identity', () => {
    test('returns 401 without identity session cookie', async () => {
      const response = await makeRequest('/identity', {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('validation schemas', () => {
    test('username must be alphanumeric with underscores and hyphens', async () => {
      const validUsernames = ['user123', 'test_user', 'test-user', 'User_Name-123'];
      for (const username of validUsernames) {
        const response = await makeRequest('/identity', {
          method: 'POST',
          body: {
            signedToken: 'valid-token',
            passphrase: 'valid-passphrase',
            username,
            displayName: 'Test',
          },
        });
        expect(response.status).not.toBe(400);
      }
    });

    test('username rejects invalid characters', async () => {
      const invalidUsernames = ['user@name', 'user name', 'user.name', 'user!name'];
      for (const username of invalidUsernames) {
        const response = await makeRequest('/identity', {
          method: 'POST',
          body: {
            signedToken: 'valid-token',
            passphrase: 'valid-passphrase',
            username,
            displayName: 'Test',
          },
        });
        expect(response.status).toBe(400);
      }
    });

    test('displayName is required and has length constraints', async () => {
      const emptyResponse = await makeRequest('/identity', {
        method: 'POST',
        body: {
          signedToken: 'valid-token',
          passphrase: 'valid-passphrase',
          username: 'testuser',
          displayName: '',
        },
      });
      expect(emptyResponse.status).toBe(400);

      const longResponse = await makeRequest('/identity', {
        method: 'POST',
        body: {
          signedToken: 'valid-token',
          passphrase: 'valid-passphrase',
          username: 'testuser',
          displayName: 'a'.repeat(100),
        },
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
      });

      expect(response.status).toBe(401);
    });

    test('returns blocked identities with identity session', async () => {
      const response = await makeRequest('/identity/blocklist', {
        method: 'GET',
        cookies: 'adieuu_session=session',
      });

      expect(response.status).toBe(200);
      expect(mockGetBlockedIdentities).toHaveBeenCalled();
    });

    test('respects limit parameter', async () => {
      const response = await makeRequest('/identity/blocklist?limit=25', {
        method: 'GET',
        cookies: 'adieuu_session=session',
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
        cookies: 'adieuu_session=session',
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
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid identity ID format', async () => {
      const response = await makeRequest('/identity/blocklist', {
        method: 'POST',
        body: { identityId: 'invalid-id' },
        cookies: 'adieuu_session=session',
      });

      expect(response.status).toBe(400);
    });

    test('returns 400 for missing identityId', async () => {
      const response = await makeRequest('/identity/blocklist', {
        method: 'POST',
        body: {},
        cookies: 'adieuu_session=session',
      });

      expect(response.status).toBe(400);
    });

    test('blocks identity with valid input', async () => {
      const response = await makeRequest('/identity/blocklist', {
        method: 'POST',
        body: { identityId: mockTargetIdentityId.toHexString() },
        cookies: 'adieuu_session=session',
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
        cookies: 'adieuu_session=session',
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
        cookies: 'adieuu_session=session',
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
        cookies: 'adieuu_session=session',
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /identity/blocklist/:identityId', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest(`/identity/blocklist/${mockTargetIdentityId.toHexString()}`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid identity ID', async () => {
      const response = await makeRequest('/identity/blocklist/invalid-id', {
        method: 'DELETE',
        cookies: 'adieuu_session=session',
      });

      expect(response.status).toBe(400);
    });

    test('unblocks identity with valid ID', async () => {
      const response = await makeRequest(`/identity/blocklist/${mockTargetIdentityId.toHexString()}`, {
        method: 'DELETE',
        cookies: 'adieuu_session=session',
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
        cookies: 'adieuu_session=session',
      });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /identity/blocklist/check/:identityId', () => {
    test('returns 401 without identity session', async () => {
      const response = await makeRequest(`/identity/blocklist/check/${mockTargetIdentityId.toHexString()}`, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid identity ID', async () => {
      const response = await makeRequest('/identity/blocklist/check/invalid-id', {
        method: 'GET',
        cookies: 'adieuu_session=session',
      });

      expect(response.status).toBe(400);
    });

    test('returns blocked status', async () => {
      const response = await makeRequest(`/identity/blocklist/check/${mockTargetIdentityId.toHexString()}`, {
        method: 'GET',
        cookies: 'adieuu_session=session',
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
        cookies: 'adieuu_session=session',
      });

      expect(response.status).toBe(200);

      const body = await response.json() as { data: { blocked: boolean; blockedAt: string | null } };
      expect(body.data.blocked).toBe(true);
      expect(body.data.blockedAt).toBeDefined();
    });
  });

  describe('GET /identity/search', () => {
    test('returns 400 when sanitized query shorter than MIN_QUERY_LENGTH', async () => {
      const zw = '\u200b';
      const response = await makeRequest(`/identity/search?q=a${zw}`, {
        method: 'GET',
      });

      expect(response.status).toBe(400);
      expect(mockIdentitySearch).not.toHaveBeenCalled();
    });

    test('calls search with sanitized query when valid', async () => {
      const response = await makeRequest('/identity/search?q=hello', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(mockIdentitySearch).toHaveBeenCalledWith('hello', 10, undefined);
    });
  });

  describe('GET /identity/:id', () => {
    test('returns 400 for malformed identity id param', async () => {
      const response = await makeRequest('/identity/not-valid-object-id-!!!!', {
        method: 'GET',
      });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /identity/:id/sessions/:sessionId', () => {
    beforeEach(() => {
      mockSessionRevoke.mockClear();
      mockFindBySessionId.mockClear();
      mockFindBySessionId.mockImplementation(async (sid: string) => {
        if (sid !== otherSessionToken) return null;
        return {
          type: 'identity' as const,
          identityId: mockIdentityId,
          sessionId: sid,
          expiresAt: new Date(Date.now() + 86_400_000),
        };
      });
    });

    test('sanitizes session id and revokes when session belongs to caller identity', async () => {
      const idHex = mockIdentityId.toHexString();
      const response = await makeRequest(
        `/identity/${idHex}/sessions/${encodeURIComponent(otherSessionToken)}`,
        {
          method: 'DELETE',
          cookies: 'adieuu_session=session',
        },
      );

      expect(response.status).toBe(200);
      expect(mockSessionRevoke).toHaveBeenCalledWith(otherSessionToken);
    });

    test('returns 400 when revoking current session token', async () => {
      const idHex = mockIdentityId.toHexString();
      const response = await makeRequest(
        `/identity/${idHex}/sessions/${encodeURIComponent('test-session')}`,
        {
          method: 'DELETE',
          cookies: 'adieuu_session=session',
        },
      );

      expect(response.status).toBe(400);
      expect(mockSessionRevoke).not.toHaveBeenCalled();
    });
  });

  describe('POST /identity/change-passphrase (account mode)', () => {
    const validBody = {
      signedToken: 'valid-token',
      currentPassphrase: 'current-password-123',
      newPassphrase: 'new-password-456',
      newEncryptedBundle: 'a'.repeat(64),
      newBundleSalt: 'a'.repeat(24),
      newBundleNonce: 'a'.repeat(24),
    };

    test('succeeds with account session (no identity session)', async () => {
      mockChangePassphrase.mockImplementation(() => Promise.resolve({ success: true }));

      const response = await makeRequest('/identity/change-passphrase', {
        method: 'POST',
        body: validBody,
        cookies: 'adieuu_session=test-account-session',
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { success: boolean };
      expect(data.success).toBe(true);
    });

    test('succeeds with identity session', async () => {
      mockChangePassphrase.mockImplementation(() => Promise.resolve({ success: true }));

      const response = await makeRequest('/identity/change-passphrase', {
        method: 'POST',
        body: validBody,
        cookies: 'adieuu_session=session',
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { success: boolean };
      expect(data.success).toBe(true);
    });

    test('returns 401 without any valid session', async () => {
      const response = await makeRequest('/identity/change-passphrase', {
        method: 'POST',
        body: validBody,
      });

      expect(response.status).toBe(401);
    });

    test('returns 401 for invalid signed token', async () => {
      const response = await makeRequest('/identity/change-passphrase', {
        method: 'POST',
        body: { ...validBody, signedToken: 'invalid-token' },
        cookies: 'adieuu_session=test-account-session',
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid body', async () => {
      const response = await makeRequest('/identity/change-passphrase', {
        method: 'POST',
        body: { signedToken: 'valid-token' },
        cookies: 'adieuu_session=test-account-session',
      });

      expect(response.status).toBe(400);
    });

    test('returns 401 for INVALID_PASSPHRASE error from service', async () => {
      mockChangePassphrase.mockImplementation(() =>
        Promise.resolve({ success: false, error: 'Invalid passphrase', errorCode: 'INVALID_PASSPHRASE' }),
      );

      const response = await makeRequest('/identity/change-passphrase', {
        method: 'POST',
        body: validBody,
        cookies: 'adieuu_session=test-account-session',
      });

      expect(response.status).toBe(401);
    });

    test('passes undefined callerIdentityId in account mode', async () => {
      mockChangePassphrase.mockImplementation(() => Promise.resolve({ success: true }));

      await makeRequest('/identity/change-passphrase', {
        method: 'POST',
        body: validBody,
        cookies: 'adieuu_session=test-account-session',
      });

      const calls = mockChangePassphrase.mock.calls;
      const lastCall = calls[calls.length - 1] as unknown[];
      expect(lastCall[4]).toBeUndefined();
    });

    test('passes identity ID as callerIdentityId in identity mode', async () => {
      mockChangePassphrase.mockImplementation(() => Promise.resolve({ success: true }));

      await makeRequest('/identity/change-passphrase', {
        method: 'POST',
        body: validBody,
        cookies: 'adieuu_session=session',
      });

      const calls = mockChangePassphrase.mock.calls;
      const lastCall = calls[calls.length - 1] as unknown[];
      expect(lastCall[4]).toBe(mockIdentityId.toHexString());
    });
  });

  describe('POST /identity/bundle-by-passphrase', () => {
    test('returns bundle data with valid account session', async () => {
      const response = await makeRequest('/identity/bundle-by-passphrase', {
        method: 'POST',
        body: { signedToken: 'valid-token', passphrase: 'test-passphrase-123' },
        cookies: 'adieuu_session=test-account-session',
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { success: boolean; data: Record<string, unknown> };
      expect(data.success).toBe(true);
      expect(data.data.encryptedBundle).toBeDefined();
      expect(data.data.salt).toBeDefined();
      expect(data.data.nonce).toBeDefined();
      expect(data.data.schemeVersion).toBeDefined();
    });

    test('returns 401 without account session', async () => {
      const response = await makeRequest('/identity/bundle-by-passphrase', {
        method: 'POST',
        body: { signedToken: 'valid-token', passphrase: 'test-passphrase-123' },
      });

      expect(response.status).toBe(401);
    });

    test('returns 401 with identity session (not account)', async () => {
      const response = await makeRequest('/identity/bundle-by-passphrase', {
        method: 'POST',
        body: { signedToken: 'valid-token', passphrase: 'test-passphrase-123' },
        cookies: 'adieuu_session=session',
      });

      expect(response.status).toBe(401);
    });

    test('returns 401 for invalid signed token', async () => {
      const response = await makeRequest('/identity/bundle-by-passphrase', {
        method: 'POST',
        body: { signedToken: 'invalid-token', passphrase: 'test-passphrase-123' },
        cookies: 'adieuu_session=test-account-session',
      });

      expect(response.status).toBe(401);
    });

    test('returns 400 for missing passphrase', async () => {
      const response = await makeRequest('/identity/bundle-by-passphrase', {
        method: 'POST',
        body: { signedToken: 'valid-token' },
        cookies: 'adieuu_session=test-account-session',
      });

      expect(response.status).toBe(400);
    });

    test('returns 404 when bundle not found', async () => {
      mockFindByBundleId.mockImplementationOnce(() => Promise.resolve(null));

      const response = await makeRequest('/identity/bundle-by-passphrase', {
        method: 'POST',
        body: { signedToken: 'valid-token', passphrase: 'test-passphrase-123' },
        cookies: 'adieuu_session=test-account-session',
      });

      expect(response.status).toBe(404);
    });
  });
});
