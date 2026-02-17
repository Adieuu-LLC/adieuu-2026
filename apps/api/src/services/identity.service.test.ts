import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

// Mock dependencies
const mockUserRepo = {
  findById: mock(() => Promise.resolve(null)),
  incrementIdentityCount: mock(() => Promise.resolve()),
  recordIdentityLoginAttempt: mock(() => Promise.resolve({ attempts: [], lockedUntil: undefined })),
  resetIdentityLoginAttempts: mock(() => Promise.resolve()),
  isIdentityLockedOut: mock(() => Promise.resolve({ lockedOut: false })),
};

const mockIdentityRepo = {
  findByUsername: mock(() => Promise.resolve(null)),
  findByIdent: mock(() => Promise.resolve(null)),
  findActiveByIdent: mock(() => Promise.resolve(null)),
  findByIdentityId: mock(() => Promise.resolve(null)),
  create: mock(() => Promise.resolve(null)),
  softDelete: mock(() => Promise.resolve(true)),
  updateLastActive: mock(() => Promise.resolve()),
  upgradeHashVersion: mock(() => Promise.resolve(true)),
};

const mockIdentitySessionRepo = {
  create: mock(() => Promise.resolve(null)),
  findBySessionId: mock(() => Promise.resolve(null)),
  getSession: mock(() => Promise.resolve(null)),
  revoke: mock(() => Promise.resolve()),
  revokeAllForIdentity: mock(() => Promise.resolve(0)),
};

const mockAuditRepo = {
  create: mock(() => Promise.resolve(null)),
};

mock.module('../repositories/user.repository', () => ({
  getUserRepository: () => mockUserRepo,
}));

mock.module('../repositories/identity.repository', () => ({
  getIdentityRepository: () => mockIdentityRepo,
}));

mock.module('../repositories/identity-session.repository', () => ({
  getIdentitySessionRepository: () => mockIdentitySessionRepo,
}));

mock.module('../repositories/audit.repository', () => ({
  getAuditLogRepository: () => mockAuditRepo,
}));

mock.module('./messaging', () => ({
  sendEmail: mock(() => Promise.resolve({ success: true })),
  sendSms: mock(() => Promise.resolve({ success: true })),
}));

mock.module('../config', () => ({
  config: {
    env: 'test',
    security: {
      sessionSecret: 'test-secret',
    },
  },
}));

// Import after mocking
import {
  createIdentity,
  loginToIdentity,
  logoutFromIdentity,
  deleteIdentity,
  getIdentitySession,
  buildIdentityLogoutCookie,
  getIdentitySessionIdFromRequest,
  MIN_PASSPHRASE_LENGTH,
} from './identity.service';

describe('identity.service', () => {
  const testUserId = new ObjectId();
  const testUserCreatedAt = new Date('2024-01-15T12:00:00Z');
  const validPassphrase = 'my-secure-passphrase-123';
  const testUsername = 'testuser';
  const testDisplayName = 'Test User';

  beforeEach(() => {
    // Reset all mocks
    mockUserRepo.findById.mockReset();
    mockUserRepo.incrementIdentityCount.mockReset();
    mockUserRepo.recordIdentityLoginAttempt.mockReset();
    mockUserRepo.resetIdentityLoginAttempts.mockReset();
    mockUserRepo.isIdentityLockedOut.mockReset();
    mockIdentityRepo.findByUsername.mockReset();
    mockIdentityRepo.findByIdent.mockReset();
    mockIdentityRepo.findActiveByIdent.mockReset();
    mockIdentityRepo.findByIdentityId.mockReset();
    mockIdentityRepo.create.mockReset();
    mockIdentityRepo.softDelete.mockReset();
    mockIdentityRepo.updateLastActive.mockReset();
    mockIdentityRepo.upgradeHashVersion.mockReset();
    mockIdentitySessionRepo.create.mockReset();
    mockIdentitySessionRepo.findBySessionId.mockReset();
    mockIdentitySessionRepo.getSession.mockReset();
    mockIdentitySessionRepo.revoke.mockReset();
    mockIdentitySessionRepo.revokeAllForIdentity.mockReset();
    mockAuditRepo.create.mockReset();

    // Set up default mock returns
    mockUserRepo.isIdentityLockedOut.mockImplementation(() =>
      Promise.resolve({ lockedOut: false })
    );
    mockUserRepo.recordIdentityLoginAttempt.mockImplementation(() =>
      Promise.resolve({ attempts: [new Date()], lockedUntil: undefined })
    );
  });

  describe('createIdentity', () => {
    test('returns error for passphrase below minimum length', async () => {
      const result = await createIdentity(
        testUserId,
        testUserCreatedAt,
        'short', // Too short
        testUsername,
        testDisplayName
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });

    test('returns error when user not found', async () => {
      mockUserRepo.findById.mockImplementation(() => Promise.resolve(null));

      const result = await createIdentity(
        testUserId,
        testUserCreatedAt,
        validPassphrase,
        testUsername,
        testDisplayName
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
      expect(result.error).toContain('User not found');
    });

    test('returns error when max identities reached', async () => {
      mockUserRepo.findById.mockImplementation(() =>
        Promise.resolve({
          _id: testUserId,
          identityCount: 1, // Already at max
          createdAt: testUserCreatedAt,
        })
      );

      const result = await createIdentity(
        testUserId,
        testUserCreatedAt,
        validPassphrase,
        testUsername,
        testDisplayName
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MAX_IDENTITIES');
    });

    test('returns error when username is taken', async () => {
      mockUserRepo.findById.mockImplementation(() =>
        Promise.resolve({
          _id: testUserId,
          identityCount: 0,
          createdAt: testUserCreatedAt,
        })
      );
      mockIdentityRepo.findByUsername.mockImplementation(() =>
        Promise.resolve({ _id: new ObjectId(), username: testUsername })
      );

      const result = await createIdentity(
        testUserId,
        testUserCreatedAt,
        validPassphrase,
        testUsername,
        testDisplayName
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('USERNAME_TAKEN');
    });

    test('returns error when ident hash already exists', async () => {
      mockUserRepo.findById.mockImplementation(() =>
        Promise.resolve({
          _id: testUserId,
          identityCount: 0,
          createdAt: testUserCreatedAt,
        })
      );
      mockIdentityRepo.findByUsername.mockImplementation(() => Promise.resolve(null));
      mockIdentityRepo.findByIdent.mockImplementation(() =>
        Promise.resolve({ _id: new ObjectId(), ident: 'existing-hash' })
      );

      const result = await createIdentity(
        testUserId,
        testUserCreatedAt,
        validPassphrase,
        testUsername,
        testDisplayName
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });

    test('creates identity successfully', async () => {
      const mockIdentity = {
        _id: new ObjectId(),
        ident: 'generated-hash',
        hashVersion: 1,
        username: testUsername,
        displayName: testDisplayName,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActiveAt: new Date(),
      };

      mockUserRepo.findById.mockImplementation(() =>
        Promise.resolve({
          _id: testUserId,
          identityCount: 0,
          createdAt: testUserCreatedAt,
        })
      );
      mockIdentityRepo.findByUsername.mockImplementation(() => Promise.resolve(null));
      mockIdentityRepo.findByIdent.mockImplementation(() => Promise.resolve(null));
      mockIdentityRepo.create.mockImplementation(() => Promise.resolve(mockIdentity));

      const result = await createIdentity(
        testUserId,
        testUserCreatedAt,
        validPassphrase,
        testUsername,
        testDisplayName
      );

      expect(result.success).toBe(true);
      expect(result.identity).toBeDefined();
      expect(result.identity?.username).toBe(testUsername);
      expect(mockUserRepo.incrementIdentityCount).toHaveBeenCalled();
    });
  });

  describe('loginToIdentity', () => {
    const mockIdentity = {
      _id: new ObjectId(),
      ident: 'test-hash',
      hashVersion: 1,
      username: testUsername,
      displayName: testDisplayName,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastActiveAt: new Date(),
    };

    const mockUser = {
      _id: testUserId,
      createdAt: testUserCreatedAt,
      identityCount: 1,
      identityLoginAttempts: [],
      identityLockoutDuration: 3600000, // 1 hour
    };

    test('returns error when user not found', async () => {
      mockUserRepo.findById.mockImplementation(() => Promise.resolve(null));

      const result = await loginToIdentity(
        testUserId,
        testUserCreatedAt,
        validPassphrase
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });

    test('returns error when user is locked out', async () => {
      mockUserRepo.findById.mockImplementation(() => Promise.resolve(mockUser));
      mockUserRepo.isIdentityLockedOut.mockImplementation(() =>
        Promise.resolve({
          lockedOut: true,
          lockedUntil: new Date(Date.now() + 3600000),
        })
      );

      const result = await loginToIdentity(
        testUserId,
        testUserCreatedAt,
        validPassphrase
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LOCKED_OUT');
      expect(result.retryAfter).toBeDefined();
    });

    test('returns error for invalid passphrase (identity not found)', async () => {
      mockUserRepo.findById.mockImplementation(() => Promise.resolve(mockUser));
      mockUserRepo.isIdentityLockedOut.mockImplementation(() =>
        Promise.resolve({ lockedOut: false })
      );
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(null));

      const result = await loginToIdentity(
        testUserId,
        testUserCreatedAt,
        'wrong-passphrase-here'
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_PASSPHRASE');
      expect(mockUserRepo.recordIdentityLoginAttempt).toHaveBeenCalled();
      expect(mockAuditRepo.create).toHaveBeenCalled();
    });

    test('triggers lockout after max attempts', async () => {
      const lockedUntil = new Date(Date.now() + 3600000);
      mockUserRepo.findById.mockImplementation(() => Promise.resolve(mockUser));
      mockUserRepo.isIdentityLockedOut.mockImplementation(() =>
        Promise.resolve({ lockedOut: false })
      );
      mockIdentityRepo.findActiveByIdent.mockImplementation(() => Promise.resolve(null));
      mockUserRepo.recordIdentityLoginAttempt.mockImplementation(() =>
        Promise.resolve({
          attempts: [new Date(), new Date(), new Date(), new Date(), new Date(), new Date()],
          lockedUntil,
        })
      );

      const result = await loginToIdentity(
        testUserId,
        testUserCreatedAt,
        'wrong-passphrase'
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LOCKED_OUT');
    });

    test('returns error for passphrase below minimum length', async () => {
      mockUserRepo.findById.mockImplementation(() => Promise.resolve(mockUser));
      mockUserRepo.isIdentityLockedOut.mockImplementation(() =>
        Promise.resolve({ lockedOut: false })
      );

      const result = await loginToIdentity(
        testUserId,
        testUserCreatedAt,
        'short' // Too short
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('VALIDATION_ERROR');
    });
  });

  describe('logoutFromIdentity', () => {
    test('revokes session when session ID provided', async () => {
      await logoutFromIdentity('test-session-id');

      expect(mockIdentitySessionRepo.revoke).toHaveBeenCalledWith('test-session-id');
    });

    test('does nothing when session ID is empty', async () => {
      await logoutFromIdentity('');

      expect(mockIdentitySessionRepo.revoke).not.toHaveBeenCalled();
    });
  });

  describe('deleteIdentity', () => {
    const testIdentityId = new ObjectId();
    const testSessionId = 'test-session-id';

    test('returns error when session not found', async () => {
      mockIdentitySessionRepo.findBySessionId.mockImplementation(() =>
        Promise.resolve(null)
      );

      const result = await deleteIdentity(testIdentityId, testSessionId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid session');
    });

    test('returns error when session does not match identity', async () => {
      mockIdentitySessionRepo.findBySessionId.mockImplementation(() =>
        Promise.resolve({
          identitySessionId: testSessionId,
          identityId: new ObjectId(), // Different identity
        })
      );

      const result = await deleteIdentity(testIdentityId, testSessionId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not match');
    });

    test('deletes identity successfully', async () => {
      mockIdentitySessionRepo.findBySessionId.mockImplementation(() =>
        Promise.resolve({
          identitySessionId: testSessionId,
          identityId: testIdentityId,
        })
      );
      mockIdentityRepo.softDelete.mockImplementation(() => Promise.resolve(true));

      const result = await deleteIdentity(testIdentityId, testSessionId);

      expect(result.success).toBe(true);
      expect(mockIdentitySessionRepo.revokeAllForIdentity).toHaveBeenCalled();
      expect(mockIdentityRepo.softDelete).toHaveBeenCalled();
    });

    test('returns error when soft delete fails', async () => {
      mockIdentitySessionRepo.findBySessionId.mockImplementation(() =>
        Promise.resolve({
          identitySessionId: testSessionId,
          identityId: testIdentityId,
        })
      );
      mockIdentityRepo.softDelete.mockImplementation(() => Promise.resolve(false));

      const result = await deleteIdentity(testIdentityId, testSessionId);

      expect(result.success).toBe(false);
    });
  });

  describe('getIdentitySession', () => {
    test('returns null for empty session ID', async () => {
      const result = await getIdentitySession('');
      expect(result).toBeNull();
    });

    test('returns session data when found', async () => {
      const mockSession = {
        identityId: 'test-identity-id',
        expiresAt: Date.now() + 3600000,
        lastActivityAt: Date.now(),
      };
      mockIdentitySessionRepo.getSession.mockImplementation(() =>
        Promise.resolve(mockSession)
      );

      const result = await getIdentitySession('test-session-id');

      expect(result).toEqual(mockSession);
    });

    test('returns null when session not found', async () => {
      mockIdentitySessionRepo.getSession.mockImplementation(() =>
        Promise.resolve(null)
      );

      const result = await getIdentitySession('nonexistent-session');

      expect(result).toBeNull();
    });
  });

  describe('buildIdentityLogoutCookie', () => {
    test('returns a cookie string that clears the session', () => {
      const cookie = buildIdentityLogoutCookie();

      expect(cookie).toContain('chadder_identity=');
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/');
    });
  });

  describe('getIdentitySessionIdFromRequest', () => {
    test('returns null when no cookie header', () => {
      const request = new Request('http://localhost/test');
      const result = getIdentitySessionIdFromRequest(request);
      expect(result).toBeNull();
    });

    test('returns null when identity cookie not present', () => {
      const request = new Request('http://localhost/test', {
        headers: { Cookie: 'other_cookie=value' },
      });
      const result = getIdentitySessionIdFromRequest(request);
      expect(result).toBeNull();
    });

    test('returns session ID when identity cookie present', () => {
      const request = new Request('http://localhost/test', {
        headers: { Cookie: 'chadder_identity=test-session-id; other=value' },
      });
      const result = getIdentitySessionIdFromRequest(request);
      expect(result).toBe('test-session-id');
    });

    test('handles cookie as only cookie', () => {
      const request = new Request('http://localhost/test', {
        headers: { Cookie: 'chadder_identity=session123' },
      });
      const result = getIdentitySessionIdFromRequest(request);
      expect(result).toBe('session123');
    });
  });

  describe('MIN_PASSPHRASE_LENGTH', () => {
    test('is at least 8 characters', () => {
      expect(MIN_PASSPHRASE_LENGTH).toBeGreaterThanOrEqual(8);
    });
  });
});

