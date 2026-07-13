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
  changeIdent: mock(() => Promise.resolve(true)) as AnyMock,
};

mock.module('../repositories/identity.repository', () => ({
  getIdentityRepository: () => mockIdentityRepo,
}));

const mockKeyBundleRepo = {
  findByBundleId: mock(() => Promise.resolve({ bundleId: 'old-bundle' })) as AnyMock,
  migrateBundleId: mock(() => Promise.resolve()) as AnyMock,
};

mock.module('../repositories/key-bundle.repository', () => ({
  getKeyBundleRepository: () => mockKeyBundleRepo,
}));

// --- Mock identity count repository ---

const mockIdentityCountRepo = {
  getCount: mock(() => Promise.resolve(0)) as AnyMock,
  increment: mock(() => Promise.resolve(1)) as AnyMock,
  incrementGlobalSequence: mock(() => Promise.resolve(1)) as AnyMock,
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
  revokeAllForIdentityExcept: mock(() => Promise.resolve(0)) as AnyMock,
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

const mockGetSessionIdFromRequest = mock((request: Request) => {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/adieuu_session=([^;.]+)/);
  return match?.[1] ?? null;
});

mock.module('./session.service', () => ({
  createIdentitySession: mockCreateIdentitySession,
  destroySession: mockDestroySession,
  destroyAllIdentitySessions: mockDestroyAllIdentitySessions,
  requireIdentitySession: mock(() => Promise.resolve(null)),
  buildLogoutCookie: mockBuildLogoutCookie,
  getSessionIdFromRequest: mockGetSessionIdFromRequest,
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
  withTransaction: async (fn: (session: unknown) => Promise<unknown>) => fn(undefined),
  RedisKeys: {
    identityLoginAttempts: (hash: string) =>
      `ratelimit:identity_login:${hash}`,
    lockoutPending: (hash: string) => `lockout_pending:${hash}`,
    session: (id: string) => `session:${id}`,
  },
}));

// --- Mock badge service ---

const mockAwardOrderBadges = mock(() => Promise.resolve()) as AnyMock;

mock.module('./badge.service', () => ({
  awardOrderBadges: mockAwardOrderBadges,
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
  changePassphrase,
  MIN_PASSPHRASE_LENGTH,
  resolveMaxIdentities,
} from './identity.service';
import { IDENTITY_LIMITS } from '../constants/identity-limits';

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
    mockIdentityRepo.changeIdent.mockReset();
    mockKeyBundleRepo.findByBundleId.mockReset();
    mockKeyBundleRepo.migrateBundleId.mockReset();

    mockIdentityCountRepo.getCount.mockReset();
    mockIdentityCountRepo.getCount.mockImplementation(() => Promise.resolve(0));
    mockIdentityCountRepo.increment.mockReset();
    mockIdentityCountRepo.increment.mockImplementation(() =>
      Promise.resolve(1),
    );
    mockIdentityCountRepo.incrementGlobalSequence.mockReset();
    mockIdentityCountRepo.incrementGlobalSequence.mockImplementation(() =>
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

    mockAwardOrderBadges.mockReset();
    mockAwardOrderBadges.mockImplementation(() => Promise.resolve());
  });

  describe('createIdentity', () => {
    test('creates identity and returns session on auto-login', async () => {
      const identity = makeMockIdentity();
      mockIdentityRepo.create.mockImplementation(() =>
        Promise.resolve(identity),
      );

      const result = await createIdentity(
        testAccountHash,
        IDENTITY_LIMITS.access,
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
        undefined,
      );
      expect(mockAwardOrderBadges).toHaveBeenCalledWith(identity._id, 1);
    });

    test('returns VALIDATION_ERROR for short passphrase', async () => {
      const result = await createIdentity(
        testAccountHash,
        IDENTITY_LIMITS.access,
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
        Promise.resolve(IDENTITY_LIMITS.access),
      );

      const result = await createIdentity(
        testAccountHash,
        IDENTITY_LIMITS.access,
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
        IDENTITY_LIMITS.access,
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
        IDENTITY_LIMITS.access,
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
    test('destroys an identity session and returns true', async () => {
      mockGetSession.mockImplementationOnce(() =>
        Promise.resolve({ type: 'identity', identityId: 'id-1' }),
      );
      const result = await logoutFromIdentity('test-session-id');
      expect(result).toBe(true);
      expect(mockDestroySession).toHaveBeenCalledWith('test-session-id');
    });

    test('refuses to destroy an account session and returns false', async () => {
      mockGetSession.mockImplementationOnce(() =>
        Promise.resolve({ type: 'account', userId: 'u-1' }),
      );
      const result = await logoutFromIdentity('test-session-id');
      expect(result).toBe(false);
      expect(mockDestroySession).not.toHaveBeenCalled();
    });

    test('returns false for an expired or missing session', async () => {
      mockGetSession.mockImplementationOnce(() => Promise.resolve(null));
      const result = await logoutFromIdentity('test-session-id');
      expect(result).toBe(false);
      expect(mockDestroySession).not.toHaveBeenCalled();
    });

    test('returns false for empty session ID', async () => {
      const result = await logoutFromIdentity('');
      expect(result).toBe(false);
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
          maxVideoDurationSeconds: 300,
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
          maxVideoDurationSeconds: 300,
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
          maxVideoDurationSeconds: 300,
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

  describe('changePassphrase', () => {
    const currentPassphrase = 'current-passphrase-1';
    const newPassphrase = 'new-passphrase-99';
    const newBundle = {
      encryptedBundle: 'encrypted-bundle-data-min-32-chars-long',
      salt: 'salt-value-16chars',
      nonce: 'nonce-value-16chars',
    };

    test('returns validation error for short current passphrase', async () => {
      const result = await changePassphrase(
        testAccountHash,
        'short',
        newPassphrase,
        newBundle,
        new ObjectId().toHexString(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('VALIDATION_ERROR');
      }
    });

    test('returns validation error when new passphrase equals current', async () => {
      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        currentPassphrase,
        newBundle,
        new ObjectId().toHexString(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('VALIDATION_ERROR');
      }
    });

    test('returns invalid passphrase when identity not found', async () => {
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(null));

      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        newPassphrase,
        newBundle,
        new ObjectId().toHexString(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('INVALID_PASSPHRASE');
      }
    });

    test('returns invalid passphrase when caller identity mismatches', async () => {
      const identity = makeMockIdentity();
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(identity));

      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        newPassphrase,
        newBundle,
        new ObjectId().toHexString(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('INVALID_PASSPHRASE');
      }
    });

    test('returns bundle_not_found when existing bundle missing', async () => {
      const identity = makeMockIdentity();
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(identity));
      mockKeyBundleRepo.findByBundleId.mockImplementation(() => Promise.resolve(null));

      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        newPassphrase,
        newBundle,
        identity._id.toHexString(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('BUNDLE_NOT_FOUND');
      }
    });

    test('migrates ident and bundle on success', async () => {
      const identity = makeMockIdentity();
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(identity));
      mockIdentityRepo.findByIdent.mockImplementation(() => Promise.resolve(null));
      mockKeyBundleRepo.findByBundleId.mockImplementation(() =>
        Promise.resolve({ bundleId: 'old-bundle' }),
      );

      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        newPassphrase,
        newBundle,
        identity._id.toHexString(),
      );

      expect(result.success).toBe(true);
      expect(mockIdentityRepo.changeIdent).toHaveBeenCalled();
      expect(mockKeyBundleRepo.migrateBundleId).toHaveBeenCalled();
    });

    test('succeeds without callerIdentityId (account mode)', async () => {
      const identity = makeMockIdentity();
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(identity));
      mockIdentityRepo.findByIdent.mockImplementation(() => Promise.resolve(null));
      mockKeyBundleRepo.findByBundleId.mockImplementation(() =>
        Promise.resolve({ bundleId: 'old-bundle' }),
      );

      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        newPassphrase,
        newBundle,
        undefined,
      );

      expect(result.success).toBe(true);
      expect(mockIdentityRepo.changeIdent).toHaveBeenCalled();
      expect(mockKeyBundleRepo.migrateBundleId).toHaveBeenCalled();
    });

    test('skips ownership check when callerIdentityId is undefined', async () => {
      const identity = makeMockIdentity();
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(identity));
      mockIdentityRepo.findByIdent.mockImplementation(() => Promise.resolve(null));
      mockKeyBundleRepo.findByBundleId.mockImplementation(() =>
        Promise.resolve({ bundleId: 'old-bundle' }),
      );

      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        newPassphrase,
        newBundle,
        undefined,
      );

      expect(result.success).toBe(true);
    });

    test('still rejects mismatched callerIdentityId when provided', async () => {
      const identity = makeMockIdentity();
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(identity));

      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        newPassphrase,
        newBundle,
        new ObjectId().toHexString(),
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('INVALID_PASSPHRASE');
      }
    });

    test('account mode still validates current passphrase', async () => {
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(null));

      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        newPassphrase,
        newBundle,
        undefined,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('INVALID_PASSPHRASE');
      }
    });

    test('account mode detects bundle not found', async () => {
      const identity = makeMockIdentity();
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(identity));
      mockKeyBundleRepo.findByBundleId.mockImplementation(() => Promise.resolve(null));

      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        newPassphrase,
        newBundle,
        undefined,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('BUNDLE_NOT_FOUND');
      }
    });

    test('account mode detects collision', async () => {
      const identity = makeMockIdentity();
      const collision = makeMockIdentity();
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(identity));
      mockIdentityRepo.findByIdent.mockImplementation(() => Promise.resolve(collision));
      mockKeyBundleRepo.findByBundleId.mockImplementation(() =>
        Promise.resolve({ bundleId: 'old-bundle' }),
      );

      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        newPassphrase,
        newBundle,
        undefined,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errorCode).toBe('COLLISION');
      }
    });

    test('alias mode revokes other sessions but keeps the caller session', async () => {
      const identity = makeMockIdentity();
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(identity));
      mockIdentityRepo.findByIdent.mockImplementation(() => Promise.resolve(null));
      mockKeyBundleRepo.findByBundleId.mockImplementation(() =>
        Promise.resolve({ bundleId: 'old-bundle' }),
      );
      mockSessionRepo.revokeAllForIdentityExcept.mockReset();
      mockSessionRepo.revokeAllForIdentityExcept.mockImplementation(() => Promise.resolve(2));
      mockDestroyAllIdentitySessions.mockReset();
      mockDestroyAllIdentitySessions.mockImplementation(() => Promise.resolve(0));

      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        newPassphrase,
        newBundle,
        identity._id.toHexString(),
        'caller-session-id',
      );

      expect(result.success).toBe(true);
      expect(mockSessionRepo.revokeAllForIdentityExcept).toHaveBeenCalledTimes(1);
      const call = mockSessionRepo.revokeAllForIdentityExcept.mock.calls[0] as unknown[];
      expect(String(call[0])).toBe(identity._id.toHexString());
      expect(call[1]).toBe('caller-session-id');
      // Must NOT also revoke-all in alias mode.
      expect(mockDestroyAllIdentitySessions).not.toHaveBeenCalled();
    });

    test('account mode revokes all identity sessions', async () => {
      const identity = makeMockIdentity();
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(identity));
      mockIdentityRepo.findByIdent.mockImplementation(() => Promise.resolve(null));
      mockKeyBundleRepo.findByBundleId.mockImplementation(() =>
        Promise.resolve({ bundleId: 'old-bundle' }),
      );
      mockSessionRepo.revokeAllForIdentityExcept.mockReset();
      mockSessionRepo.revokeAllForIdentityExcept.mockImplementation(() => Promise.resolve(0));
      mockDestroyAllIdentitySessions.mockReset();
      mockDestroyAllIdentitySessions.mockImplementation(() => Promise.resolve(3));

      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        newPassphrase,
        newBundle,
        undefined,
        undefined,
      );

      expect(result.success).toBe(true);
      expect(mockDestroyAllIdentitySessions).toHaveBeenCalledTimes(1);
      const destroyCall = mockDestroyAllIdentitySessions.mock.calls[0] as unknown[];
      expect(String(destroyCall[0])).toBe(identity._id.toHexString());
      expect(mockSessionRepo.revokeAllForIdentityExcept).not.toHaveBeenCalled();
    });

    test('revocation failure does not fail the committed password change', async () => {
      const identity = makeMockIdentity();
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(identity));
      mockIdentityRepo.findByIdent.mockImplementation(() => Promise.resolve(null));
      mockKeyBundleRepo.findByBundleId.mockImplementation(() =>
        Promise.resolve({ bundleId: 'old-bundle' }),
      );
      mockSessionRepo.revokeAllForIdentityExcept.mockReset();
      mockSessionRepo.revokeAllForIdentityExcept.mockImplementation(() =>
        Promise.reject(new Error('redis down')),
      );

      const result = await changePassphrase(
        testAccountHash,
        currentPassphrase,
        newPassphrase,
        newBundle,
        identity._id.toHexString(),
        'caller-session-id',
      );

      // Password change already committed; revocation failure is logged, not thrown.
      expect(result.success).toBe(true);
      expect(mockIdentityRepo.changeIdent).toHaveBeenCalled();
      expect(mockKeyBundleRepo.migrateBundleId).toHaveBeenCalled();
    });
  });

  describe('MIN_PASSPHRASE_LENGTH', () => {
    test('is at least 8 characters', () => {
      expect(MIN_PASSPHRASE_LENGTH).toBeGreaterThanOrEqual(8);
    });
  });

  describe('resolveMaxIdentities', () => {
    test('returns free limit for free-only subscription', () => {
      expect(resolveMaxIdentities(['free'], [], false)).toBe(IDENTITY_LIMITS.free);
    });

    test('returns access limit for access-only subscription', () => {
      expect(resolveMaxIdentities(['access'], [], false)).toBe(IDENTITY_LIMITS.access);
    });

    test('returns insider limit for insider subscription', () => {
      expect(resolveMaxIdentities(['insider'], [], false)).toBe(IDENTITY_LIMITS.insider);
    });

    test('returns insider limit when both access and insider present', () => {
      expect(resolveMaxIdentities(['access', 'insider'], [], false)).toBe(IDENTITY_LIMITS.insider);
    });

    test('returns lifetime limit for founder entitlement', () => {
      expect(resolveMaxIdentities(['insider'], ['founder'], false)).toBe(IDENTITY_LIMITS.lifetime);
    });

    test('returns lifetime limit for vanguard entitlement', () => {
      expect(resolveMaxIdentities(['insider'], ['vanguard'], false)).toBe(IDENTITY_LIMITS.lifetime);
    });

    test('returns lifetime limit when isLifetime is true', () => {
      expect(resolveMaxIdentities(['access'], [], true)).toBe(IDENTITY_LIMITS.lifetime);
    });

    test('founder entitlement takes precedence over subscription tier', () => {
      expect(resolveMaxIdentities(['access'], ['founder'], false)).toBe(IDENTITY_LIMITS.lifetime);
    });

    test('vanguard entitlement takes precedence over subscription tier', () => {
      expect(resolveMaxIdentities(['access'], ['vanguard'], false)).toBe(IDENTITY_LIMITS.lifetime);
    });

    test('returns 0 for no subscription and no entitlements', () => {
      expect(resolveMaxIdentities([], [], false)).toBe(0);
    });

    test('account override raises the limit above tier resolution', () => {
      expect(resolveMaxIdentities(['access'], [], false, 5)).toBe(5);
    });

    test('account override does not lower the limit below tier resolution', () => {
      expect(resolveMaxIdentities(['insider'], [], false, 1)).toBe(IDENTITY_LIMITS.insider);
    });

    test('account override raises limit even with no subscription', () => {
      expect(resolveMaxIdentities([], [], false, 3)).toBe(3);
    });

    test('account override of 0 has no effect', () => {
      expect(resolveMaxIdentities(['access'], [], false, 0)).toBe(IDENTITY_LIMITS.access);
    });

    test('undefined account override has no effect', () => {
      expect(resolveMaxIdentities(['access'], [], false, undefined)).toBe(IDENTITY_LIMITS.access);
    });

    test('unrecognized entitlements do not affect resolution', () => {
      expect(resolveMaxIdentities(['access'], ['gifted', 'sponsor'], false)).toBe(IDENTITY_LIMITS.access);
    });

    test('lifetime flag with insider still returns lifetime limit', () => {
      expect(resolveMaxIdentities(['insider'], [], true)).toBe(IDENTITY_LIMITS.lifetime);
    });

    test('founder + vanguard together still returns lifetime limit', () => {
      expect(resolveMaxIdentities(['insider'], ['founder', 'vanguard'], false)).toBe(IDENTITY_LIMITS.lifetime);
    });

    test('account override works alongside lifetime entitlements', () => {
      expect(resolveMaxIdentities(['insider'], ['founder'], false, 10)).toBe(10);
    });

    test('account override equal to tier resolution returns that value', () => {
      expect(resolveMaxIdentities(['insider'], [], false, IDENTITY_LIMITS.insider)).toBe(IDENTITY_LIMITS.insider);
    });
  });
});
