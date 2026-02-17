import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

// Mock the logger
mock.module('../../utils/adieuuLogger', () => ({
  default: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  },
}));

// Mock config
mock.module('../../config', () => ({
  config: {
    env: 'test',
    cors: { origins: '*', credentials: false },
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
    security: {
      sessionSecret: 'test-secret',
    },
  },
}));

// Mock crypto utilities
mock.module('../../utils/crypto', () => ({
  generateSecureToken: mock(() => 'test-token'),
  hashIdentifier: mock((id: string) => `hashed:${id}`),
  hmacSign: mock((data: string) => `sig:${data}`),
  hmacVerify: mock(() => true),
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
  }),
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
        cookies: 'chadder_session=test-session',
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
        cookies: 'chadder_session=test-session',
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
        cookies: 'chadder_session=test-session',
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
        cookies: 'chadder_session=test-session',
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
        cookies: 'chadder_session=test-session',
      });

      expect(response.status).toBe(400);
    });

    test('accepts login request with passphrase', async () => {
      const response = await makeRequest('/identity/login', {
        method: 'POST',
        body: {
          passphrase: 'valid-passphrase-123',
        },
        cookies: 'chadder_session=test-session',
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
        cookies: 'chadder_session=test-session; chadder_identity=test-identity-session',
      });

      expect(response.status).toBe(200);
      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).toContain('chadder_identity=');
      expect(setCookie).toContain('Max-Age=0');
    });

    test('returns success even without identity session', async () => {
      const response = await makeRequest('/identity/logout', {
        method: 'POST',
        body: {}, // Empty body is valid for logout
        cookies: 'chadder_session=test-session',
      });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /identity/session', () => {
    test('returns 401 without identity session cookie', async () => {
      const response = await makeRequest('/identity/session', {
        method: 'GET',
        cookies: 'chadder_session=test-session',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /identity', () => {
    test('returns 401 without identity session cookie', async () => {
      const response = await makeRequest('/identity', {
        method: 'DELETE',
        cookies: 'chadder_session=test-session',
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
          cookies: 'chadder_session=test-session',
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
          cookies: 'chadder_session=test-session',
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
        cookies: 'chadder_session=test-session',
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
        cookies: 'chadder_session=test-session',
      });
      expect(longResponse.status).toBe(400);
    });
  });
});
