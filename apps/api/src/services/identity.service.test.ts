import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const testAccountHash = 'a'.repeat(64);

// --- Mock identity-hash ---

const mockGenerateIdentityHash = mock(() =>
  Promise.resolve({ hash: 'v2:mock-hash', version: 2 }),
) as AnyMock;

const mockValidatePassphrase = mock((passphrase: string) => {
  if (!passphrase || passphrase.length < 8) {
    return { valid: false, error: 'Passphrase must be at least 8 characters' };
  }
  return { valid: true };
}) as AnyMock;

mock.module('../utils/identity-hash', () => ({
  generateIdentityHash: mockGenerateIdentityHash,
  verifyIdentityHash: mock(() =>
    Promise.resolve({ match: true, needsUpgrade: false }),
  ),
  validatePassphrase: mockValidatePassphrase,
  CURRENT_HASH_VERSION: 2,
  MIN_PASSPHRASE_LENGTH: 8,
}));

// --- Mock identity repository ---

const mockIdentityRepo = {
  findByUsername: mock(() => Promise.resolve(null)) as AnyMock,
  findByIdent: mock(() => Promise.resolve(null)) as AnyMock,
  findActiveByIdent: mock(() => Promise.resolve(null)) as AnyMock,
  findByIdentityId: mock(() => Promise.resolve(null)) as AnyMock,
  create: mock(() => Promise.resolve(null)) as AnyMock,
  softDelete: mock(() => Promise.resolve(true)) as AnyMock,
  updateLastActive: mock(() => Promise.resolve()) as AnyMock,
  upgradeHashVersion: mock(() => Promise.resolve(true)) as AnyMock,
  clearModerationFields: mock(() => Promise.resolve()) as AnyMock,
};

mock.module('../repositories/identity.repository', () => ({
  getIdentityRepository: () => mockIdentityRepo,
}));

// --- Mock identity count repository ---

const mockIdentityCountRepo = {
  getCount: mock(() => Promise.resolve(0)) as AnyMock,
  increment: mock(() => Promise.resolve(1)) as AnyMock,
};

mock.module('../repositories/identity-count.repository', () => ({
  getIdentityCountRepository: () => mockIdentityCountRepo,
}));

// --- Mock session repository ---

const mockSessionRepo = {
  findBySessionId: mock(() => Promise.resolve(null)) as AnyMock,
  getSession: mock(() => Promise.resolve(null)) as AnyMock,
  revoke: mock(() => Promise.resolve()) as AnyMock,
  revokeAllForIdentity: mock(() => Promise.resolve(0)) as AnyMock,
  updateLastActivity: mock(() => Promise.resolve()) as AnyMock,
};

mock.module('../repositories/session.repository', () => ({
  getSessionRepository: () => mockSessionRepo,
}));

// --- Mock session service ---

const mockCreateIdentitySession = mock(() =>
  Promise.resolve({ sessionId: 'mock-session-id', cookie: 'mock-cookie' }),
) as AnyMock;
const mockDestroySession = mock(() => Promise.resolve()) as AnyMock;
const mockDestroyAllIdentitySessions = mock(() =>
  Promise.resolve(1),
) as AnyMock;
const mockBuildLogoutCookie = mock(() => 'mock-logout-cookie') as AnyMock;
const mockGetSession = mock(() => Promise.resolve(null)) as AnyMock;

mock.module('./session.service', () => ({
  createIdentitySession: mockCreateIdentitySession,
  destroySession: mockDestroySession,
  destroyAllIdentitySessions: mockDestroyAllIdentitySessions,
  requireIdentitySession: mock(() => Promise.resolve(null)),
  buildLogoutCookie: mockBuildLogoutCookie,
  getSessionIdFromRequest: mock(() => 'mock-session-id'),
  getSession: mockGetSession,
}));

// --- Mock Redis (rate limiting) ---

const mockRedis = {
  get: mock(() => Promise.resolve(null)) as AnyMock,
  set: mock(() => Promise.resolve('OK')) as AnyMock,
  incr: mock(() => Promise.resolve(1)) as AnyMock,
  expire: mock(() => Promise.resolve(1)) as AnyMock,
  del: mock(() => Promise.resolve(1)) as AnyMock,
  ttl: mock(() => Promise.resolve(-1)) as AnyMock,
  rpush: mock(() => Promise.resolve(1)) as AnyMock,
};

mock.module('../db', () => ({
  getRedis: () => mockRedis,
  isRedisConnected: () => true,
  withTransaction: async (fn: (session: unknown) => Promise<unknown>) => fn({}),
  RedisKeys: {
    identityLoginAttempts: (hash: string) =>
      `ratelimit:identity_login:${hash}`,
    lockoutPending: (hash: string) => `lockout_pending:${hash}`,
    session: (id: string) => `session:${id}`,
  },
}));

// Import after mocking
import {
  createIdentity,
  loginToIdentity,
  logoutFromIdentity,
  deleteIdentity,
  getIdentityFromSession,
  buildIdentityLogoutCookie,
  getIdentitySessionIdFromRequest,
  MIN_PASSPHRASE_LENGTH,
  MAX_IDENTITIES_PER_USER,
} from './identity.service';

describe('identity.service', () => {
  afterAll(() => {
    mock.restore();
  });

  const validPassphrase = 'my-secure-passphrase-123';
  const testUsername = 'testuser';
  const testDisplayName = 'Test User';

  function makeMockIdentity(overrides?: Record<string, unknown>) {
    return {
      _id: new ObjectId(),
      ident: 'v2:mock-hash',
      hashVersion: 2,
      username: testUsername,
      displayName: testDisplayName,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastActiveAt: new Date(),
      ...overrides,
    };
  }

  beforeEach(() => {
    mockGenerateIdentityHash.mockReset();
    mockGenerateIdentityHash.mockImplementation(() =>
      Promise.resolve({ hash: 'v2:mock-hash', version: 2 }),
    );
    mockValidatePassphrase.mockReset();
    mockValidatePassphrase.mockImplementation((passphrase: string) => {
      if (!passphrase || passphrase.length < 8) {
        return {
          valid: false,
          error: 'Passphrase must be at least 8 characters',
        };
      }
      return { valid: true };
    });

    mockIdentityRepo.findByUsername.mockReset();
    mockIdentityRepo.findByIdent.mockReset();
    mockIdentityRepo.findActiveByIdent.mockReset();
    mockIdentityRepo.findByIdentityId.mockReset();
    mockIdentityRepo.create.mockReset();
    mockIdentityRepo.softDelete.mockReset();
    mockIdentityRepo.updateLastActive.mockReset();
    mockIdentityRepo.upgradeHashVersion.mockReset();
    mockIdentityRepo.clearModerationFields.mockReset();

    mockIdentityCountRepo.getCount.mockReset();
    mockIdentityCountRepo.getCount.mockImplementation(() => Promise.resolve(0));
    mockIdentityCountRepo.increment.mockReset();
    mockIdentityCountRepo.increment.mockImplementation(() =>
      Promise.resolve(1),
    );

    mockSessionRepo.findBySessionId.mockReset();
    mockSessionRepo.getSession.mockReset();
    mockSessionRepo.revoke.mockReset();
    mockSessionRepo.revokeAllForIdentity.mockReset();
    mockSessionRepo.updateLastActivity.mockReset();

    mockCreateIdentitySession.mockReset();
    mockCreateIdentitySession.mockImplementation(() =>
      Promise.resolve({ sessionId: 'mock-session-id', cookie: 'mock-cookie' }),
    );
    mockDestroySession.mockReset();
    mockDestroyAllIdentitySessions.mockReset();
    mockDestroyAllIdentitySessions.mockImplementation(() =>
      Promise.resolve(1),
    );
    mockBuildLogoutCookie.mockReset();
    mockBuildLogoutCookie.mockImplementation(() => 'mock-logout-cookie');

    mockGetSession.mockReset();
    mockGetSession.mockImplementation(() => Promise.resolve(null));

    mockRedis.get.mockReset();
    mockRedis.get.mockImplementation(() => Promise.resolve(null));
    mockRedis.set.mockReset();
    mockRedis.incr.mockReset();
    mockRedis.incr.mockImplementation(() => Promise.resolve(1));
    mockRedis.expire.mockReset();
    mockRedis.del.mockReset();
    mockRedis.ttl.mockReset();
    mockRedis.ttl.mockImplementation(() => Promise.resolve(-1));
    mockRedis.rpush.mockReset();
  });

  describe('createIdentity', () => {
    test('creates identity and returns session on auto-login', async () => {
      const identity = makeMockIdentity();
      mockIdentityRepo.create.mockImplementation(() =>
        Promise.resolve(identity),
      );

      const result = await createIdentity(
        testAccountHash,
        MAX_IDENTITIES_PER_USER,
        validPassphrase,
        testUsername,
        testDisplayName,
      );

      expect(result.success).toBe(true);
      expect(result.identity?.username).toBe(testUsername);
      expect(result.sessionId).toBe('mock-session-id');
      expect(result.cookie).toBe('mock-cookie');

      expect(mockIdentityCountRepo.getCount).toHaveBeenCalledWith(
        testAccountHash,
      );
      expect(mockIdentityCountRepo.increment).toHaveBeenCalledWith(
        testAccountHash,
      );
      expect(mockIdentityRepo.create).toHaveBeenCalledWith({
        ident: 'v2:mock-hash',
        hashVersion: 2,
        username: testUsername,
        displayName: testDisplayName,
      });
      expect(mockCreateIdentitySession).toHaveBeenCalledWith(
        identity._id,
        testAccountHash,
        undefined,
      );
    });

    test('returns VALIDATION_ERROR for short passphrase', async () => {
      const result = await createIdentity(
        testAccountHash,
        MAX_IDENTITIES_PER_USER,
        'short',
        testUsername,
        testDisplayName,
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
      expect(mockIdentityRepo.create).not.toHaveBeenCalled();
    });

    test('returns MAX_IDENTITIES when count exceeds limit', async () => {
      mockIdentityCountRepo.getCount.mockImplementation(() =>
        Promise.resolve(MAX_IDENTITIES_PER_USER),
      );

      const result = await createIdentity(
        testAccountHash,
        MAX_IDENTITIES_PER_USER,
        validPassphrase,
        testUsername,
        testDisplayName,
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MAX_IDENTITIES');
      expect(mockIdentityRepo.create).not.toHaveBeenCalled();
    });

    test('returns USERNAME_TAKEN when username exists', async () => {
      mockIdentityRepo.findByUsername.mockImplementation(() =>
        Promise.resolve({ _id: new ObjectId(), username: testUsername }),
      );

      const result = await createIdentity(
        testAccountHash,
        MAX_IDENTITIES_PER_USER,
        validPassphrase,
        testUsername,
        testDisplayName,
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('USERNAME_TAKEN');
    });

    test('returns VALIDATION_ERROR for duplicate ident hash', async () => {
      mockIdentityRepo.findByIdent.mockImplementation(() =>
        Promise.resolve({ _id: new ObjectId(), ident: 'v2:mock-hash' }),
      );

      const result = await createIdentity(
        testAccountHash,
        MAX_IDENTITIES_PER_USER,
        validPassphrase,
        testUsername,
        testDisplayName,
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });
  });

  describe('loginToIdentity', () => {
    test('logs in successfully and creates session', async () => {
      const identity = makeMockIdentity();
      mockIdentityRepo.findActiveByIdent.mockImplementation(() =>
        Promise.resolve(identity),
      );

      const result = await loginToIdentity(testAccountHash, validPassphrase);

      expect(result.success).toBe(true);
      expect(result.identity).toBeDefined();
      expect(result.sessionId).toBe('mock-session-id');
      expect(result.cookie).toBe('mock-cookie');
      expect(mockRedis.del).toHaveBeenCalled();
      expect(mockIdentityRepo.updateLastActive).toHaveBeenCalledWith(
        identity._id,
      );
      expect(mockCreateIdentitySession).toHaveBeenCalledWith(
        identity._id,
        testAccountHash,
        undefined,
      );
    });

    test('returns INVALID_PASSPHRASE when identity not found', async () => {
      mockIdentityRepo.findActiveByIdent.mockImplementation(() =>
        Promise.resolve(null),
      );

      const result = await loginToIdentity(testAccountHash, validPassphrase);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_PASSPHRASE');
      expect(mockRedis.incr).toHaveBeenCalled();
    });

    test('returns LOCKED_OUT when attempts exceed threshold', async () => {
      mockRedis.get.mockImplementation(() => Promise.resolve('6'));
      mockRedis.ttl.mockImplementation(() => Promise.resolve(3200));

      const result = await loginToIdentity(testAccountHash, validPassphrase);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LOCKED_OUT');
      expect(result.retryAfter).toBe(3200);
    });

    test('returns VALIDATION_ERROR for short passphrase', async () => {
      const result = await loginToIdentity(testAccountHash, 'short');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });

    test('triggers lockout after max failed attempts', async () => {
      mockIdentityRepo.findActiveByIdent.mockImplementation(() =>
        Promise.resolve(null),
      );
      mockRedis.incr.mockImplementation(() => Promise.resolve(6));

      const result = await loginToIdentity(testAccountHash, validPassphrase);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LOCKED_OUT');
      expect(mockRedis.rpush).toHaveBeenCalled();
    });

    test('upgrades hash version when outdated', async () => {
      const identity = makeMockIdentity({ hashVersion: 1 });
      mockIdentityRepo.findActiveByIdent.mockImplementation(() =>
        Promise.resolve(identity),
      );

      const result = await loginToIdentity(testAccountHash, validPassphrase);

      expect(result.success).toBe(true);
      expect(mockIdentityRepo.upgradeHashVersion).toHaveBeenCalled();
    });

    test('returns IDENTITY_BANNED for banned identity', async () => {
      const identity = makeMockIdentity({
        isBanned: true,
        moderationReason: 'spam',
      });
      mockIdentityRepo.findActiveByIdent.mockImplementation(() =>
        Promise.resolve(identity),
      );

      const result = await loginToIdentity(testAccountHash, validPassphrase);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('IDENTITY_BANNED');
      expect(result.moderationReason).toBe('spam');
    });
  });

  describe('logoutFromIdentity', () => {
    test('calls destroySession with session ID', async () => {
      await logoutFromIdentity('test-session-id');
      expect(mockDestroySession).toHaveBeenCalledWith('test-session-id');
    });

    test('does nothing for empty session ID', async () => {
      await logoutFromIdentity('');
      expect(mockDestroySession).not.toHaveBeenCalled();
    });
  });

  describe('deleteIdentity', () => {
    const testIdentityId = new ObjectId();
    const testSessionId = 'test-session-id';

    test('deletes identity successfully', async () => {
      mockSessionRepo.findBySessionId.mockImplementation(() =>
        Promise.resolve({
          sessionId: testSessionId,
          type: 'identity',
          identityId: testIdentityId,
        }),
      );
      mockIdentityRepo.softDelete.mockImplementation(() =>
        Promise.resolve(true),
      );

      const result = await deleteIdentity(testIdentityId, testSessionId);

      expect(result.success).toBe(true);
      expect(mockDestroyAllIdentitySessions).toHaveBeenCalledWith(
        testIdentityId,
      );
      expect(mockIdentityRepo.softDelete).toHaveBeenCalledWith(
        testIdentityId,
      );
    });

    test('returns error for invalid session', async () => {
      mockSessionRepo.findBySessionId.mockImplementation(() =>
        Promise.resolve(null),
      );

      const result = await deleteIdentity(testIdentityId, testSessionId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid session');
    });

    test('returns error when session type is not identity', async () => {
      mockSessionRepo.findBySessionId.mockImplementation(() =>
        Promise.resolve({ sessionId: testSessionId, type: 'account' }),
      );

      const result = await deleteIdentity(testIdentityId, testSessionId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid session');
    });

    test('returns error when session identity does not match', async () => {
      mockSessionRepo.findBySessionId.mockImplementation(() =>
        Promise.resolve({
          sessionId: testSessionId,
          type: 'identity',
          identityId: new ObjectId(),
        }),
      );

      const result = await deleteIdentity(testIdentityId, testSessionId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not match');
    });

    test('returns error when soft delete fails', async () => {
      mockSessionRepo.findBySessionId.mockImplementation(() =>
        Promise.resolve({
          sessionId: testSessionId,
          type: 'identity',
          identityId: testIdentityId,
        }),
      );
      mockIdentityRepo.softDelete.mockImplementation(() =>
        Promise.resolve(false),
      );

      const result = await deleteIdentity(testIdentityId, testSessionId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to delete');
    });
  });

  describe('getIdentityFromSession', () => {
    test('returns identity when session is valid', async () => {
      const identity = makeMockIdentity();
      mockGetSession.mockImplementation(() =>
        Promise.resolve({
          type: 'identity',
          identityId: identity._id.toHexString(),
          accountHash: testAccountHash,
          expiresAt: Date.now() + 86_400_000,
          lastActivityAt: Date.now(),
        }),
      );
      mockIdentityRepo.findByIdentityId.mockImplementation(() =>
        Promise.resolve(identity),
      );

      const result = await getIdentityFromSession('valid-session-id');

      expect(result).toHaveProperty('username', testUsername);
    });

    test('returns null for empty session ID', async () => {
      expect(await getIdentityFromSession('')).toBeNull();
    });

    test('returns null when session not found', async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      expect(await getIdentityFromSession('nonexistent')).toBeNull();
    });

    test('returns null when session type is not identity', async () => {
      mockGetSession.mockImplementation(() =>
        Promise.resolve({
          type: 'account',
          userId: '507f1f77bcf86cd799439011',
          identifier: 'u@example.com',
          identifierType: 'email',
          expiresAt: Date.now() + 86_400_000,
          lastActivityAt: Date.now(),
        }),
      );

      expect(await getIdentityFromSession('account-session')).toBeNull();
    });

    test('returns null for banned identity without block details', async () => {
      const identity = makeMockIdentity({ isBanned: true });
      mockGetSession.mockImplementation(() =>
        Promise.resolve({
          type: 'identity',
          identityId: identity._id.toHexString(),
          accountHash: testAccountHash,
          expiresAt: Date.now() + 86_400_000,
          lastActivityAt: Date.now(),
        }),
      );
      mockIdentityRepo.findByIdentityId.mockImplementation(() =>
        Promise.resolve(identity),
      );

      expect(await getIdentityFromSession('banned-session')).toBeNull();
    });

    test('returns block details for banned identity when requested', async () => {
      const identity = makeMockIdentity({
        isBanned: true,
        moderationReason: 'violation',
      });
      mockGetSession.mockImplementation(() =>
        Promise.resolve({
          type: 'identity',
          identityId: identity._id.toHexString(),
          accountHash: testAccountHash,
          expiresAt: Date.now() + 86_400_000,
          lastActivityAt: Date.now(),
        }),
      );
      mockIdentityRepo.findByIdentityId.mockImplementation(() =>
        Promise.resolve(identity),
      );

      const result = await getIdentityFromSession('banned-session', {
        returnBlockDetails: true,
      });

      expect(result).toHaveProperty('blocked');
      expect((result as { blocked: { type: string } }).blocked.type).toBe(
        'banned',
      );
    });
  });

  describe('buildIdentityLogoutCookie', () => {
    test('delegates to buildLogoutCookie', () => {
      const cookie = buildIdentityLogoutCookie();

      expect(cookie).toBe('mock-logout-cookie');
      expect(mockBuildLogoutCookie).toHaveBeenCalled();
    });
  });

  describe('getIdentitySessionIdFromRequest', () => {
    test('returns null when no cookie header', () => {
      const request = new Request('http://localhost/test');
      expect(getIdentitySessionIdFromRequest(request)).toBeNull();
    });

    test('returns session ID from adieuu_session cookie', () => {
      const request = new Request('http://localhost/test', {
        headers: { Cookie: 'adieuu_session=test-session-id; other=value' },
      });
      expect(getIdentitySessionIdFromRequest(request)).toBe('test-session-id');
    });

    test('returns null when adieuu_session cookie absent', () => {
      const request = new Request('http://localhost/test', {
        headers: { Cookie: 'other_cookie=value' },
      });
      expect(getIdentitySessionIdFromRequest(request)).toBeNull();
    });
  });

  describe('MIN_PASSPHRASE_LENGTH', () => {
    test('is at least 8 characters', () => {
      expect(MIN_PASSPHRASE_LENGTH).toBeGreaterThanOrEqual(8);
    });
  });
});
