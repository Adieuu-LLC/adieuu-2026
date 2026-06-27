import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';
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
    IDENTITIES: 'identities',
    PLATFORM_REPORTS: 'platform_reports',
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
  withTransaction: async (fn: (session: unknown) => Promise<unknown>) => fn(undefined),
  Collections: {
    USERS: 'users',
    SESSIONS: 'sessions',
    AUDIT_LOGS: 'audit_logs',
    IDENTITIES: 'identities',
    PLATFORM_REPORTS: 'platform_reports',
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

const testIdentityId = new ObjectId('507f1f77bcf86cd799439033');
const adminIdentityId = '607f1f77bcf86cd799439022';

const mockIdentity = {
  _id: testIdentityId,
  ident: 'abc123hash',
  hashVersion: 1,
  username: 'testuser',
  displayName: 'Test Identity',
  bio: 'A test identity bio',
  avatarUrl: 'https://example.com/avatar.png',
  bannerUrl: 'https://example.com/banner.png',
  lastActiveAt: new Date('2024-06-01T12:00:00Z'),
  createdAt: new Date('2024-01-15T12:00:00Z'),
  updatedAt: new Date('2024-06-01T12:00:00Z'),
  messagesSentCount: 42,
  conversationsJoinedCount: 5,
  friendCount: 10,
  achievementsEarnedCount: 3,
  entitlementOverrides: ['beta_tester'],
  platformRoles: ['moderator'],
  platformAttributes: ['read-support-tickets'],
};

const mockSearchForAdmin = mock(() => Promise.resolve([mockIdentity])) as AnyMock;
const mockFindByIdentityId = mock(() => Promise.resolve(mockIdentity)) as AnyMock;
const mockSuspendIdentity = mock(() => Promise.resolve()) as AnyMock;
const mockUnsuspendIdentity = mock(() => Promise.resolve()) as AnyMock;
const mockBanIdentity = mock(() => Promise.resolve()) as AnyMock;
const mockUnbanIdentity = mock(() => Promise.resolve()) as AnyMock;
const mockAddEntitlementOverride = mock(() => Promise.resolve()) as AnyMock;
const mockRemoveEntitlementOverride = mock(() => Promise.resolve()) as AnyMock;

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: mock(() => ({
    findByIdentityId: mockFindByIdentityId,
    searchForAdmin: mockSearchForAdmin,
    suspendIdentity: mockSuspendIdentity,
    unsuspendIdentity: mockUnsuspendIdentity,
    banIdentity: mockBanIdentity,
    unbanIdentity: mockUnbanIdentity,
    addEntitlementOverride: mockAddEntitlementOverride,
    removeEntitlementOverride: mockRemoveEntitlementOverride,
  })),
}));

const mockFindByIdentityIdSession = mock(() => Promise.resolve([])) as AnyMock;
const mockRevokeAllForIdentity = mock(() => Promise.resolve(2)) as AnyMock;

mock.module('../../repositories/session.repository', () => ({
  getSessionRepository: mock(() => ({
    findByIdentityId: mockFindByIdentityIdSession,
    revokeAllForIdentity: mockRevokeAllForIdentity,
  })),
}));

const mockAuditCreate = mock(() => Promise.resolve({ _id: new ObjectId(), createdAt: new Date(), updatedAt: new Date() })) as AnyMock;

mock.module('../../repositories/audit.repository', () => ({
  getAuditLogRepository: mock(() => ({
    create: mockAuditCreate,
  })),
}));

const mockReportList = mock(() => Promise.resolve({ reports: [], total: 0, page: 1, limit: 25 })) as AnyMock;

mock.module('../../repositories/report.repository', () => ({
  getReportRepository: mock(() => ({
    list: mockReportList,
  })),
}));

// Import controller after all mocks
const {
  searchIdentities,
  getIdentityProfile,
  getIdentitySessions,
  getIdentityReports,
  getIdentityEntitlements,
  addIdentityEntitlement,
  removeIdentityEntitlement,
  suspendIdentity,
  unsuspendIdentity,
  banIdentity,
  unbanIdentity,
} = await import('./identities.controller');

// --- Tests ---

describe('Admin Identities Controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockFindByIdentityId.mockReset();
    mockFindByIdentityId.mockImplementation(() => Promise.resolve(mockIdentity));
    mockSearchForAdmin.mockReset();
    mockSearchForAdmin.mockImplementation(() => Promise.resolve([mockIdentity]));
    mockAuditCreate.mockReset();
    mockAuditCreate.mockImplementation(() => Promise.resolve({ _id: new ObjectId(), createdAt: new Date(), updatedAt: new Date() }));
    mockAddEntitlementOverride.mockReset();
    mockRemoveEntitlementOverride.mockReset();
    mockSuspendIdentity.mockReset();
    mockUnsuspendIdentity.mockReset();
    mockBanIdentity.mockReset();
    mockUnbanIdentity.mockReset();
    mockRevokeAllForIdentity.mockReset();
    mockRevokeAllForIdentity.mockImplementation(() => Promise.resolve(2));
    mockFindByIdentityIdSession.mockReset();
    mockFindByIdentityIdSession.mockImplementation(() => Promise.resolve([]));
    mockReportList.mockReset();
    mockReportList.mockImplementation(() => Promise.resolve({ reports: [], total: 0, page: 1, limit: 25 }));
  });

  // -----------------------------------------------------------------------
  // searchIdentities
  // -----------------------------------------------------------------------
  describe('searchIdentities', () => {
    test('returns validation_failed when query is empty', async () => {
      const result = await searchIdentities({ q: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('validation_failed');
    });

    test('returns validation_failed when query is missing', async () => {
      const result = await searchIdentities({});
      expect(result.ok).toBe(false);
    });

    test('returns matching identities for valid query', async () => {
      const result = await searchIdentities({ q: 'testuser' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.identities).toHaveLength(1);
        expect(result.identities[0]!.username).toBe('testuser');
        expect(result.identities[0]!.status).toBe('active');
      }
    });

    test('parses URLSearchParams from route query', async () => {
      const result = await searchIdentities(new URLSearchParams('q=testuser'));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.identities).toHaveLength(1);
      }
    });

    test('returns empty array when no identities match', async () => {
      mockSearchForAdmin.mockImplementation(() => Promise.resolve([]));
      const result = await searchIdentities({ q: 'nobody' });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.identities).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // getIdentityProfile
  // -----------------------------------------------------------------------
  describe('getIdentityProfile', () => {
    test('returns validation_failed for invalid ObjectId', async () => {
      const result = await getIdentityProfile('not-an-id');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('validation_failed');
    });

    test('returns not_found when identity does not exist', async () => {
      mockFindByIdentityId.mockImplementation(() => Promise.resolve(null));
      const result = await getIdentityProfile(testIdentityId.toHexString());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not_found');
    });

    test('returns not_found for deleted identity', async () => {
      mockFindByIdentityId.mockImplementation(() =>
        Promise.resolve({ ...mockIdentity, ident: '_deleted_507f1f77bcf86cd799439033' }),
      );
      const result = await getIdentityProfile(testIdentityId.toHexString());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not_found');
    });

    test('returns full profile for existing identity', async () => {
      const result = await getIdentityProfile(testIdentityId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.profile.id).toBe(testIdentityId.toHexString());
        expect(result.profile.username).toBe('testuser');
        expect(result.profile.displayName).toBe('Test Identity');
        expect(result.profile.moderation.status).toBe('active');
        expect(result.profile.stats.messagesSent).toBe(42);
        expect(result.profile.stats.friends).toBe(10);
      }
    });

    test('shows suspended status', async () => {
      mockFindByIdentityId.mockImplementation(() =>
        Promise.resolve({
          ...mockIdentity,
          suspendedUntil: new Date(Date.now() + 86400000),
          moderationReason: 'TOS violation',
        }),
      );
      const result = await getIdentityProfile(testIdentityId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.profile.moderation.status).toBe('suspended');
        expect(result.profile.moderation.reason).toBe('TOS violation');
      }
    });

    test('shows banned status with category', async () => {
      mockFindByIdentityId.mockImplementation(() =>
        Promise.resolve({
          ...mockIdentity,
          isBanned: true,
          moderationReason: 'Permanent violation',
          moderationCategory: 'fraud',
        }),
      );
      const result = await getIdentityProfile(testIdentityId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.profile.moderation.status).toBe('banned');
        expect(result.profile.moderation.category).toBe('fraud');
      }
    });

    test('returns platformRoles when present on identity', async () => {
      const result = await getIdentityProfile(testIdentityId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.profile.platformRoles).toEqual(['moderator']);
      }
    });

    test('returns empty platformRoles when absent', async () => {
      mockFindByIdentityId.mockImplementation(() =>
        Promise.resolve({ ...mockIdentity, platformRoles: undefined }),
      );
      const result = await getIdentityProfile(testIdentityId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.profile.platformRoles).toEqual([]);
      }
    });

    test('returns platformAttributes when present on identity', async () => {
      const result = await getIdentityProfile(testIdentityId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.profile.platformAttributes).toEqual(['read-support-tickets']);
      }
    });

    test('returns empty platformAttributes when absent', async () => {
      mockFindByIdentityId.mockImplementation(() =>
        Promise.resolve({ ...mockIdentity, platformAttributes: undefined }),
      );
      const result = await getIdentityProfile(testIdentityId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.profile.platformAttributes).toEqual([]);
      }
    });
  });

  // -----------------------------------------------------------------------
  // getIdentitySessions
  // -----------------------------------------------------------------------
  describe('getIdentitySessions', () => {
    test('returns validation_failed for invalid id', async () => {
      const result = await getIdentitySessions('bad');
      expect(result.ok).toBe(false);
    });

    test('returns sessions for valid identity', async () => {
      const mockSessions = [
        {
          sessionId: 'sess-1',
          createdAt: new Date(),
          lastActivityAt: new Date(),
          userAgent: 'Mozilla/5.0',
          ipAddress: '192.168.1.100',
        },
      ];
      mockFindByIdentityIdSession.mockImplementation(() => Promise.resolve(mockSessions));
      const result = await getIdentitySessions(testIdentityId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.sessions).toHaveLength(1);
        expect(result.sessions[0]!.id).toBe('sess-1');
        expect(result.sessions[0]!.userAgent).toBe('Mozilla/5.0');
      }
    });
  });

  // -----------------------------------------------------------------------
  // getIdentityReports
  // -----------------------------------------------------------------------
  describe('getIdentityReports', () => {
    test('returns validation_failed for invalid id', async () => {
      const result = await getIdentityReports('bad', {});
      expect(result.ok).toBe(false);
    });

    test('returns reports for valid identity', async () => {
      const result = await getIdentityReports(testIdentityId.toHexString(), {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.against.total).toBe(0);
        expect(result.by.total).toBe(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // getIdentityEntitlements
  // -----------------------------------------------------------------------
  describe('getIdentityEntitlements', () => {
    test('returns not_found for missing identity', async () => {
      mockFindByIdentityId.mockImplementation(() => Promise.resolve(null));
      const result = await getIdentityEntitlements(testIdentityId.toHexString());
      expect(result.ok).toBe(false);
    });

    test('returns override entitlements', async () => {
      const result = await getIdentityEntitlements(testIdentityId.toHexString());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.overrides).toEqual(['beta_tester']);
      }
    });
  });

  // -----------------------------------------------------------------------
  // addIdentityEntitlement / removeIdentityEntitlement
  // -----------------------------------------------------------------------
  describe('addIdentityEntitlement', () => {
    test('returns validation_failed for missing entitlement', async () => {
      const result = await addIdentityEntitlement(adminIdentityId, testIdentityId.toHexString(), {});
      expect(result.ok).toBe(false);
    });

    test('adds entitlement and writes audit log', async () => {
      const result = await addIdentityEntitlement(adminIdentityId, testIdentityId.toHexString(), { entitlement: 'early_access' });
      expect(result.ok).toBe(true);
      expect(mockAddEntitlementOverride).toHaveBeenCalledWith(testIdentityId, 'early_access');
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      const auditCall = mockAuditCreate.mock.calls[0]![0];
      expect(auditCall.action).toBe('admin_add_identity_entitlement');
    });
  });

  describe('removeIdentityEntitlement', () => {
    test('returns validation_failed for missing name', async () => {
      const result = await removeIdentityEntitlement(adminIdentityId, testIdentityId.toHexString(), undefined);
      expect(result.ok).toBe(false);
    });

    test('removes entitlement and writes audit log', async () => {
      const result = await removeIdentityEntitlement(adminIdentityId, testIdentityId.toHexString(), 'beta_tester');
      expect(result.ok).toBe(true);
      expect(mockRemoveEntitlementOverride).toHaveBeenCalledWith(testIdentityId, 'beta_tester');
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      const auditCall = mockAuditCreate.mock.calls[0]![0];
      expect(auditCall.action).toBe('admin_remove_identity_entitlement');
    });
  });

  // -----------------------------------------------------------------------
  // suspendIdentity / unsuspendIdentity
  // -----------------------------------------------------------------------
  describe('suspendIdentity', () => {
    test('returns validation_failed for missing reason', async () => {
      const result = await suspendIdentity(adminIdentityId, testIdentityId.toHexString(), {});
      expect(result.ok).toBe(false);
    });

    test('returns not_found for missing identity', async () => {
      mockFindByIdentityId.mockImplementation(() => Promise.resolve(null));
      const result = await suspendIdentity(adminIdentityId, testIdentityId.toHexString(), { reason: 'Abuse' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not_found');
    });

    test('returns self_action when targeting own identity', async () => {
      const result = await suspendIdentity(adminIdentityId, adminIdentityId, { reason: 'Abuse' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('self_action');
    });

    test('returns protected_admin when target is a platform admin', async () => {
      mockFindByIdentityId.mockImplementation(() =>
        Promise.resolve({ ...mockIdentity, platformRoles: ['admin'] }),
      );
      const result = await suspendIdentity(adminIdentityId, testIdentityId.toHexString(), { reason: 'Abuse' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('protected_admin');
    });

    test('suspends with explicit duration and category', async () => {
      const result = await suspendIdentity(adminIdentityId, testIdentityId.toHexString(), {
        reason: 'Spam',
        durationMs: 86400000,
        category: 'spam',
      });
      expect(result.ok).toBe(true);
      expect(mockSuspendIdentity).toHaveBeenCalledTimes(1);
      const opts = mockSuspendIdentity.mock.calls[0]![1];
      expect(opts.reason).toBe('Spam');
      expect(opts.category).toBe('spam');
      expect(opts.moderatedBy).toBe(adminIdentityId);
      expect(mockRevokeAllForIdentity).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      const auditCall = mockAuditCreate.mock.calls[0]![0];
      expect(auditCall.action).toBe('admin_suspend_identity');
    });

    test('suspends indefinitely when no duration provided', async () => {
      const result = await suspendIdentity(adminIdentityId, testIdentityId.toHexString(), { reason: 'Investigation' });
      expect(result.ok).toBe(true);
      const opts = mockSuspendIdentity.mock.calls[0]![1];
      const farFuture = new Date(Date.now() + 99 * 365 * 24 * 60 * 60 * 1000);
      expect(opts.suspendedUntil.getTime()).toBeGreaterThan(farFuture.getTime());
    });
  });

  describe('unsuspendIdentity', () => {
    test('returns not_found for missing identity', async () => {
      mockFindByIdentityId.mockImplementation(() => Promise.resolve(null));
      const result = await unsuspendIdentity(adminIdentityId, testIdentityId.toHexString());
      expect(result.ok).toBe(false);
    });

    test('unsuspends and writes audit log', async () => {
      const result = await unsuspendIdentity(adminIdentityId, testIdentityId.toHexString());
      expect(result.ok).toBe(true);
      expect(mockUnsuspendIdentity).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      const auditCall = mockAuditCreate.mock.calls[0]![0];
      expect(auditCall.action).toBe('admin_unsuspend_identity');
    });

    test('returns protected_admin when target is a platform admin', async () => {
      mockFindByIdentityId.mockImplementation(() =>
        Promise.resolve({ ...mockIdentity, platformRoles: ['admin'] }),
      );
      const result = await unsuspendIdentity(adminIdentityId, testIdentityId.toHexString());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('protected_admin');
    });
  });

  // -----------------------------------------------------------------------
  // banIdentity / unbanIdentity
  // -----------------------------------------------------------------------
  describe('banIdentity', () => {
    test('returns validation_failed for missing reason', async () => {
      const result = await banIdentity(adminIdentityId, testIdentityId.toHexString(), {});
      expect(result.ok).toBe(false);
    });

    test('returns protected_admin when target is a platform admin', async () => {
      mockFindByIdentityId.mockImplementation(() =>
        Promise.resolve({ ...mockIdentity, platformRoles: ['admin'] }),
      );
      const result = await banIdentity(adminIdentityId, testIdentityId.toHexString(), {
        reason: 'Permanent violation',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('protected_admin');
    });

    test('bans identity, revokes sessions, writes audit', async () => {
      const result = await banIdentity(adminIdentityId, testIdentityId.toHexString(), {
        reason: 'Permanent violation',
        category: 'fraud',
      });
      expect(result.ok).toBe(true);
      expect(mockBanIdentity).toHaveBeenCalledTimes(1);
      expect(mockBanIdentity.mock.calls[0]![1].reason).toBe('Permanent violation');
      expect(mockBanIdentity.mock.calls[0]![1].category).toBe('fraud');
      expect(mockRevokeAllForIdentity).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      const auditCall = mockAuditCreate.mock.calls[0]![0];
      expect(auditCall.action).toBe('admin_ban_identity');
    });
  });

  describe('unbanIdentity', () => {
    test('returns not_found for missing identity', async () => {
      mockFindByIdentityId.mockImplementation(() => Promise.resolve(null));
      const result = await unbanIdentity(adminIdentityId, testIdentityId.toHexString());
      expect(result.ok).toBe(false);
    });

    test('unbans and writes audit log', async () => {
      const result = await unbanIdentity(adminIdentityId, testIdentityId.toHexString());
      expect(result.ok).toBe(true);
      expect(mockUnbanIdentity).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      const auditCall = mockAuditCreate.mock.calls[0]![0];
      expect(auditCall.action).toBe('admin_unban_identity');
    });
  });
});
