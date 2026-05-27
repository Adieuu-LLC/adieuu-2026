import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../config', () => ({
  config: {
    env: 'test',
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test', minPoolSize: 1, maxPoolSize: 10 },
    redis: { url: 'redis://localhost:6379' },
    features: { requireDatabase: false, initializeCollections: false },
    app: { name: 'Adieuu' },
    session: { secret: 'test-secret', expiresIn: 3600 },
    security: { sessionSecret: 'test-secret', otpSecret: 'test-otp-secret' },
  },
}));

const mockCollection = {
  findOne: mock(() => Promise.resolve(null)),
  find: mock(() => ({
    sort: mock(() => ({
      limit: mock(() => ({ toArray: mock(() => Promise.resolve([])) })),
    })),
    limit: mock(() => ({ toArray: mock(() => Promise.resolve([])) })),
    toArray: mock(() => Promise.resolve([])),
  })),
  insertOne: mock(() => Promise.resolve({ insertedId: new ObjectId() })),
  updateOne: mock(() => Promise.resolve({ modifiedCount: 1 })),
  updateMany: mock(() => Promise.resolve({ modifiedCount: 0 })),
  countDocuments: mock(() => Promise.resolve(0)),
};

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
  getRedis: mock(() => ({ get: mock(() => null), set: mock(() => 'OK'), del: mock(() => 1) })),
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
  getRedis: mock(() => ({ get: mock(() => null), set: mock(() => 'OK'), del: mock(() => 1) })),
  isRedisConnected: mock(() => true),
  checkRedisHealth: mock(() => Promise.resolve({ status: 'up', latencyMs: 2 })),
  RedisKeys: {
    otp: (id: string) => `otp:${id}`,
    rateLimit: (action: string, id: string) => `rate:${action}:${id}`,
    session: (id: string) => `session:${id}`,
  },
}));

mock.module('../../repositories/base.repository', () => ({
  BaseRepository: class MockBaseRepository {
    collection = mockCollection;
    constructor() {}
    findById = mock(() => Promise.resolve(null));
    findOne = mock(() => Promise.resolve(null));
    findMany = mock(() => Promise.resolve([]));
    create = mock((doc: any) => Promise.resolve({ _id: new ObjectId(), createdAt: new Date(), updatedAt: new Date(), ...doc }));
    updateById = mock(() => Promise.resolve(null));
    deleteById = mock(() => Promise.resolve(true));
    count = mock(() => Promise.resolve(0));
    toObjectId = (id: string | ObjectId) => (typeof id === 'string' ? new ObjectId(id) : id);
  },
}));

// --- Mock repositories ---

const testUserId = new ObjectId('507f1f77bcf86cd799439011');
const adminIdentityId = '607f1f77bcf86cd799439022';

const mockUser = {
  _id: testUserId,
  email: 'user@example.com',
  emailVerified: true,
  phone: '+15551234567',
  phoneVerified: true,
  displayName: 'Test User',
  failedAttempts: 0,
  identityCount: 1,
  identityLockoutDuration: 3600000,
  identityLoginAttempts: [],
  createdAt: new Date('2024-01-15T12:00:00Z'),
  updatedAt: new Date('2024-06-01T12:00:00Z'),
  lastLoginAt: new Date('2024-06-01T12:00:00Z'),
  geo: {
    jurisdiction: 'US-TN',
    countryCode: 'US',
    regionCode: 'TN',
    ipHash: 'abc123',
    checkedAt: new Date('2024-06-01T12:00:00Z'),
  },
  ageVerification: {
    status: 'unverified' as const,
    expirationCount: 0,
  },
  billing: {
    activeSubscriptions: ['access' as const],
    entitlements: [],
    isLifetime: false,
    status: 'active' as const,
    currentPeriodEnd: new Date('2025-01-15T12:00:00Z'),
    updatedAt: new Date('2024-06-01T12:00:00Z'),
  },
  subscriptionOverrides: [],
  entitlementOverrides: ['gifted'],
};

const mockSearchByIdentifier = mock(() => Promise.resolve([mockUser])) as AnyMock;
const mockFindById = mock(() => Promise.resolve(mockUser)) as AnyMock;
const mockAddSubscriptionOverride = mock(() => Promise.resolve()) as AnyMock;
const mockRemoveSubscriptionOverrideAt = mock(() => Promise.resolve(true)) as AnyMock;
const mockUpdateSubscriptionOverrideAt = mock(() => Promise.resolve(true)) as AnyMock;
const mockAddEntitlementOverride = mock(() => Promise.resolve()) as AnyMock;
const mockRemoveEntitlementOverride = mock(() => Promise.resolve()) as AnyMock;
const mockSuspendAccount = mock(() => Promise.resolve()) as AnyMock;
const mockUnsuspendAccount = mock(() => Promise.resolve()) as AnyMock;
const mockBanAccount = mock(() => Promise.resolve()) as AnyMock;
const mockUnbanAccount = mock(() => Promise.resolve()) as AnyMock;
const mockApproveAge = mock(() => Promise.resolve()) as AnyMock;

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: mock(() => ({
    findById: mockFindById,
    findByEmail: mock(() => Promise.resolve(null)),
    findByPhone: mock(() => Promise.resolve(null)),
    searchByIdentifier: mockSearchByIdentifier,
    addSubscriptionOverride: mockAddSubscriptionOverride,
    removeSubscriptionOverrideAt: mockRemoveSubscriptionOverrideAt,
    updateSubscriptionOverrideAt: mockUpdateSubscriptionOverrideAt,
    addEntitlementOverride: mockAddEntitlementOverride,
    removeEntitlementOverride: mockRemoveEntitlementOverride,
    suspendAccount: mockSuspendAccount,
    unsuspendAccount: mockUnsuspendAccount,
    banAccount: mockBanAccount,
    unbanAccount: mockUnbanAccount,
    approveAge: mockApproveAge,
  })),
}));

const mockFindActiveByUserId = mock(() => Promise.resolve([])) as AnyMock;
const mockRevokeAllForUser = mock(() => Promise.resolve(2)) as AnyMock;

mock.module('../../repositories/session.repository', () => ({
  getSessionRepository: mock(() => ({
    findActiveByUserId: mockFindActiveByUserId,
    revokeAllForUser: mockRevokeAllForUser,
  })),
}));

const mockAuditCreate = mock(() => Promise.resolve({ _id: new ObjectId(), createdAt: new Date(), updatedAt: new Date() })) as AnyMock;
const mockAuditFindByUserId = mock(() => Promise.resolve([])) as AnyMock;

mock.module('../../repositories/audit.repository', () => ({
  getAuditLogRepository: mock(() => ({
    create: mockAuditCreate,
    findByUserId: mockAuditFindByUserId,
  })),
}));

mock.module('../../services/billing/resolve-access', () => ({
  resolveEffectiveAccess: mock((user: any) => ({
    subscriptions: user.billing?.activeSubscriptions ?? [],
    entitlements: [...(user.billing?.entitlements ?? []), ...(user.entitlementOverrides ?? [])],
    isLifetime: user.billing?.isLifetime ?? false,
  })),
}));

// Import controller after all mocks
const {
  searchUsers,
  getUserProfile,
  getUserSessions,
  getUserAuditLog,
  giftSubscription,
  approveAge,
  getEntitlements,
  addEntitlement,
  removeEntitlement,
  getSubscriptionOverrides,
  addSubscriptionOverride,
  updateSubscriptionOverride,
  removeSubscriptionOverride,
  suspendAccount,
  unsuspendAccount,
  banAccount,
  unbanAccount,
} = await import('./users.controller');

// --- Tests ---

describe('Admin Users Controller', () => {
  beforeEach(() => {
    mockFindById.mockReset();
    mockFindById.mockImplementation(() => Promise.resolve(mockUser));
    mockSearchByIdentifier.mockReset();
    mockSearchByIdentifier.mockImplementation(() => Promise.resolve([mockUser]));
    mockAuditCreate.mockReset();
    mockAuditCreate.mockImplementation(() => Promise.resolve({ _id: new ObjectId(), createdAt: new Date(), updatedAt: new Date() }));
    mockAuditFindByUserId.mockReset();
    mockAuditFindByUserId.mockImplementation(() => Promise.resolve([]));
    mockAddSubscriptionOverride.mockReset();
    mockRemoveSubscriptionOverrideAt.mockReset();
    mockRemoveSubscriptionOverrideAt.mockImplementation(() => Promise.resolve(true));
    mockUpdateSubscriptionOverrideAt.mockReset();
    mockUpdateSubscriptionOverrideAt.mockImplementation(() => Promise.resolve(true));
    mockAddEntitlementOverride.mockReset();
    mockRemoveEntitlementOverride.mockReset();
    mockSuspendAccount.mockReset();
    mockUnsuspendAccount.mockReset();
    mockBanAccount.mockReset();
    mockUnbanAccount.mockReset();
    mockApproveAge.mockReset();
    mockRevokeAllForUser.mockReset();
    mockRevokeAllForUser.mockImplementation(() => Promise.resolve(2));
    mockFindActiveByUserId.mockReset();
    mockFindActiveByUserId.mockImplementation(() => Promise.resolve([]));
  });

  // -----------------------------------------------------------------------
  // searchUsers
  // -----------------------------------------------------------------------
  describe('searchUsers', () => {
    test('returns validation_failed when query is empty', async () => {
      const result = await searchUsers({ q: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('validation_failed');
    });

    test('returns validation_failed when query is missing', async () => {
      const result = await searchUsers({});
      expect(result.ok).toBe(false);
    });

    test('returns matching users for valid query', async () => {
      const result = await searchUsers({ q: 'user@example.com' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.users).toHaveLength(1);
        expect(result.users[0]!.email).toBe('user@example.com');
        expect(result.users[0]!.status).toBe('active');
      }
    });

    test('parses URLSearchParams from route query', async () => {
      const result = await searchUsers(new URLSearchParams('q=user@example.com'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.users).toHaveLength(1);
        expect(result.users[0]!.email).toBe('user@example.com');
      }
    });

    test('returns empty array when no users match', async () => {
      mockSearchByIdentifier.mockImplementation(() => Promise.resolve([]));
      const result = await searchUsers({ q: 'nobody@example.com' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.users).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // getUserProfile
  // -----------------------------------------------------------------------
  describe('getUserProfile', () => {
    test('returns validation_failed for invalid ObjectId', async () => {
      const result = await getUserProfile('not-an-id');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('validation_failed');
    });

    test('returns not_found when user does not exist', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(null));
      const result = await getUserProfile(testUserId.toHexString());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not_found');
    });

    test('returns full profile for existing user', async () => {
      const result = await getUserProfile(testUserId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.profile.id).toBe(testUserId.toHexString());
        expect(result.profile.email).toBe('user@example.com');
        expect(result.profile.geo?.jurisdiction).toBe('US-TN');
        expect(result.profile.ageVerification?.status).toBe('unverified');
        expect(result.profile.moderation.status).toBe('active');
      }
    });

    test('shows suspended status', async () => {
      mockFindById.mockImplementation(() =>
        Promise.resolve({
          ...mockUser,
          suspendedUntil: new Date(Date.now() + 86400000),
          moderationReason: 'TOS violation',
        }),
      );
      const result = await getUserProfile(testUserId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.profile.moderation.status).toBe('suspended');
        expect(result.profile.moderation.reason).toBe('TOS violation');
      }
    });

    test('shows banned status', async () => {
      mockFindById.mockImplementation(() =>
        Promise.resolve({ ...mockUser, isBanned: true, moderationReason: 'Permanent violation' }),
      );
      const result = await getUserProfile(testUserId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.profile.moderation.status).toBe('banned');
      }
    });
  });

  // -----------------------------------------------------------------------
  // getUserSessions
  // -----------------------------------------------------------------------
  describe('getUserSessions', () => {
    test('returns validation_failed for invalid id', async () => {
      const result = await getUserSessions('bad');
      expect(result.ok).toBe(false);
    });

    test('returns sessions for valid user', async () => {
      const mockSessions = [
        {
          sessionId: 'sess-1',
          createdAt: new Date(),
          lastActivityAt: new Date(),
          userAgent: 'Mozilla/5.0',
          ipAddress: '192.168.1.100',
        },
      ];
      mockFindActiveByUserId.mockImplementation(() => Promise.resolve(mockSessions));
      const result = await getUserSessions(testUserId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]!.ipAddress).toBe('192.168.*.*');
      }
    });
  });

  // -----------------------------------------------------------------------
  // getUserAuditLog
  // -----------------------------------------------------------------------
  describe('getUserAuditLog', () => {
    test('returns validation_failed for invalid id', async () => {
      const result = await getUserAuditLog('bad', {});
      expect(result.ok).toBe(false);
    });

    test('returns entries with pagination', async () => {
      const entries = Array.from({ length: 5 }, (_, i) => ({
        _id: new ObjectId(),
        action: 'login_success',
        createdAt: new Date(Date.now() - i * 60000),
        ipHash: 'hash',
        updatedAt: new Date(),
      }));
      mockAuditFindByUserId.mockImplementation(() => Promise.resolve(entries));

      const result = await getUserAuditLog(testUserId.toHexString(), { limit: '3', offset: '1' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.entries).toHaveLength(3);
        expect(result.total).toBe(5);
      }
    });
  });

  // -----------------------------------------------------------------------
  // giftSubscription
  // -----------------------------------------------------------------------
  describe('giftSubscription', () => {
    test('returns validation_failed for missing tier', async () => {
      const result = await giftSubscription(adminIdentityId, testUserId.toHexString(), {});
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('validation_failed');
    });

    test('returns validation_failed for invalid tier', async () => {
      const result = await giftSubscription(adminIdentityId, testUserId.toHexString(), { tier: 'platinum' });
      expect(result.ok).toBe(false);
    });

    test('returns not_found for missing user', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(null));
      const result = await giftSubscription(adminIdentityId, testUserId.toHexString(), { tier: 'access' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not_found');
    });

    test('gifts subscription with duration', async () => {
      const result = await giftSubscription(adminIdentityId, testUserId.toHexString(), {
        tier: 'access',
        durationMonths: 12,
      });
      expect(result.ok).toBe(true);
      expect(mockAddSubscriptionOverride).toHaveBeenCalledTimes(1);
      const callArgs = mockAddSubscriptionOverride.mock.calls[0]!;
      const override = callArgs[1];
      expect(override.tier).toBe('access');
      expect(override.expiresAt).toBeInstanceOf(Date);
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    });

    test('gifts lifetime subscription (no durationMonths)', async () => {
      const result = await giftSubscription(adminIdentityId, testUserId.toHexString(), { tier: 'insider' });
      expect(result.ok).toBe(true);
      const callArgs = mockAddSubscriptionOverride.mock.calls[0]!;
      const override = callArgs[1];
      expect(override.tier).toBe('insider');
      expect(override.expiresAt).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // approveAge
  // -----------------------------------------------------------------------
  describe('approveAge', () => {
    test('returns not_found for missing user', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(null));
      const result = await approveAge(adminIdentityId, testUserId.toHexString());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not_found');
    });

    test('approves age and writes audit log', async () => {
      const result = await approveAge(adminIdentityId, testUserId.toHexString());
      expect(result.ok).toBe(true);
      expect(mockApproveAge).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      const auditCall = mockAuditCreate.mock.calls[0]![0];
      expect(auditCall.action).toBe('admin_approve_age');
    });
  });

  // -----------------------------------------------------------------------
  // getEntitlements
  // -----------------------------------------------------------------------
  describe('getEntitlements', () => {
    test('returns not_found for missing user', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(null));
      const result = await getEntitlements(testUserId.toHexString());
      expect(result.ok).toBe(false);
    });

    test('returns effective and override entitlements', async () => {
      const result = await getEntitlements(testUserId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.overrides).toEqual(['gifted']);
        expect(result.effective).toContain('gifted');
      }
    });
  });

  // -----------------------------------------------------------------------
  // subscription overrides
  // -----------------------------------------------------------------------
  describe('getSubscriptionOverrides', () => {
    test('returns not_found for missing user', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(null));
      const result = await getSubscriptionOverrides(testUserId.toHexString());
      expect(result.ok).toBe(false);
    });

    test('returns effective tiers and override list', async () => {
      mockFindById.mockImplementation(() =>
        Promise.resolve({
          ...mockUser,
          subscriptionOverrides: [{ tier: 'insider', expiresAt: new Date('2030-01-01T00:00:00Z') }],
        }),
      );
      const result = await getSubscriptionOverrides(testUserId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.overrides).toHaveLength(1);
        expect(result.overrides[0]!.tier).toBe('insider');
        expect(result.effective).toContain('access');
      }
    });
  });

  describe('addSubscriptionOverride', () => {
    test('returns validation_failed for missing tier', async () => {
      const result = await addSubscriptionOverride(adminIdentityId, testUserId.toHexString(), {});
      expect(result.ok).toBe(false);
    });

    test('adds override and writes audit log', async () => {
      const result = await addSubscriptionOverride(adminIdentityId, testUserId.toHexString(), {
        tier: 'insider',
        durationMonths: 6,
      });
      expect(result.ok).toBe(true);
      expect(mockAddSubscriptionOverride).toHaveBeenCalledTimes(1);
      const auditCall = mockAuditCreate.mock.calls[0]![0];
      expect(auditCall.action).toBe('admin_add_subscription_override');
    });
  });

  describe('updateSubscriptionOverride', () => {
    test('returns validation_failed for invalid index', async () => {
      const result = await updateSubscriptionOverride(
        adminIdentityId,
        testUserId.toHexString(),
        'abc',
        { tier: 'access' },
      );
      expect(result.ok).toBe(false);
    });

    test('updates override at index', async () => {
      const result = await updateSubscriptionOverride(
        adminIdentityId,
        testUserId.toHexString(),
        '0',
        { tier: 'insider' },
      );
      expect(result.ok).toBe(true);
      expect(mockUpdateSubscriptionOverrideAt).toHaveBeenCalledTimes(1);
      const auditCall = mockAuditCreate.mock.calls[0]![0];
      expect(auditCall.action).toBe('admin_update_subscription_override');
    });
  });

  describe('removeSubscriptionOverride', () => {
    test('returns override_not_found when index is out of range', async () => {
      const result = await removeSubscriptionOverride(adminIdentityId, testUserId.toHexString(), '0');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('override_not_found');
    });

    test('removes override and writes audit log', async () => {
      mockFindById.mockImplementation(() =>
        Promise.resolve({
          ...mockUser,
          subscriptionOverrides: [{ tier: 'insider' }],
        }),
      );
      const result = await removeSubscriptionOverride(adminIdentityId, testUserId.toHexString(), '0');
      expect(result.ok).toBe(true);
      expect(mockRemoveSubscriptionOverrideAt).toHaveBeenCalledWith(testUserId, 0);
      const auditCall = mockAuditCreate.mock.calls[0]![0];
      expect(auditCall.action).toBe('admin_remove_subscription_override');
    });
  });

  // -----------------------------------------------------------------------
  // addEntitlement / removeEntitlement
  // -----------------------------------------------------------------------
  describe('addEntitlement', () => {
    test('returns validation_failed for missing entitlement', async () => {
      const result = await addEntitlement(adminIdentityId, testUserId.toHexString(), {});
      expect(result.ok).toBe(false);
    });

    test('adds entitlement and writes audit log', async () => {
      const result = await addEntitlement(adminIdentityId, testUserId.toHexString(), { entitlement: 'beta_tester' });
      expect(result.ok).toBe(true);
      expect(mockAddEntitlementOverride).toHaveBeenCalledWith(testUserId, 'beta_tester');
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeEntitlement', () => {
    test('returns validation_failed for missing name', async () => {
      const result = await removeEntitlement(adminIdentityId, testUserId.toHexString(), undefined);
      expect(result.ok).toBe(false);
    });

    test('removes entitlement and writes audit log', async () => {
      const result = await removeEntitlement(adminIdentityId, testUserId.toHexString(), 'gifted');
      expect(result.ok).toBe(true);
      expect(mockRemoveEntitlementOverride).toHaveBeenCalledWith(testUserId, 'gifted');
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // suspendAccount / unsuspendAccount
  // -----------------------------------------------------------------------
  describe('suspendAccount', () => {
    test('returns validation_failed for missing reason', async () => {
      const result = await suspendAccount(adminIdentityId, testUserId.toHexString(), {});
      expect(result.ok).toBe(false);
    });

    test('returns not_found for missing user', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(null));
      const result = await suspendAccount(adminIdentityId, testUserId.toHexString(), { reason: 'Abuse' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not_found');
    });

    test('suspends with explicit duration', async () => {
      const result = await suspendAccount(adminIdentityId, testUserId.toHexString(), {
        reason: 'Spam',
        durationMs: 86400000,
      });
      expect(result.ok).toBe(true);
      expect(mockSuspendAccount).toHaveBeenCalledTimes(1);
      const opts = mockSuspendAccount.mock.calls[0]![1];
      expect(opts.reason).toBe('Spam');
      expect(opts.moderatedBy).toBe(adminIdentityId);
      expect(mockRevokeAllForUser).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    });

    test('suspends indefinitely when no duration provided', async () => {
      const result = await suspendAccount(adminIdentityId, testUserId.toHexString(), { reason: 'Investigation' });
      expect(result.ok).toBe(true);
      const opts = mockSuspendAccount.mock.calls[0]![1];
      const farFuture = new Date(Date.now() + 99 * 365 * 24 * 60 * 60 * 1000);
      expect(opts.suspendedUntil.getTime()).toBeGreaterThan(farFuture.getTime());
    });
  });

  describe('unsuspendAccount', () => {
    test('returns not_found for missing user', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(null));
      const result = await unsuspendAccount(adminIdentityId, testUserId.toHexString());
      expect(result.ok).toBe(false);
    });

    test('unsuspends and writes audit log', async () => {
      const result = await unsuspendAccount(adminIdentityId, testUserId.toHexString());
      expect(result.ok).toBe(true);
      expect(mockUnsuspendAccount).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // banAccount / unbanAccount
  // -----------------------------------------------------------------------
  describe('banAccount', () => {
    test('returns validation_failed for missing reason', async () => {
      const result = await banAccount(adminIdentityId, testUserId.toHexString(), {});
      expect(result.ok).toBe(false);
    });

    test('bans user, revokes sessions, writes audit', async () => {
      const result = await banAccount(adminIdentityId, testUserId.toHexString(), { reason: 'Permanent violation' });
      expect(result.ok).toBe(true);
      expect(mockBanAccount).toHaveBeenCalledTimes(1);
      expect(mockBanAccount.mock.calls[0]![1].reason).toBe('Permanent violation');
      expect(mockRevokeAllForUser).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('unbanAccount', () => {
    test('returns not_found for missing user', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(null));
      const result = await unbanAccount(adminIdentityId, testUserId.toHexString());
      expect(result.ok).toBe(false);
    });

    test('unbans and writes audit log', async () => {
      const result = await unbanAccount(adminIdentityId, testUserId.toHexString());
      expect(result.ok).toBe(true);
      expect(mockUnbanAccount).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      const auditCall = mockAuditCreate.mock.calls[0]![0];
      expect(auditCall.action).toBe('admin_unban_account');
    });
  });
});
