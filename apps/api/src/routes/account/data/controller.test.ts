import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import { createHash } from 'crypto';
import { createRateLimitServiceMock } from '../../../test-utils/rate-limit-service.mock';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Mock declarations (all registered BEFORE importing the code under test)
// ---------------------------------------------------------------------------

mock.module('../../../config', () => ({
  config: {
    env: 'test',
    stripe: { enabled: false },
  },
}));

// -- Chainable Mongo cursor factory ----------------------------------------

function createMockCursor(docs: unknown[] = []) {
  const cursor = {
    sort: mock(() => cursor),
    limit: mock(() => cursor),
    project: mock(() => cursor),
    toArray: mock(() => Promise.resolve(docs)),
  };
  return cursor;
}

const collectionCallLog: Array<{ collection: string; method: string; args: unknown[] }> = [];

function createMockCollection(name: string) {
  const col = {
    find: mock((...args: unknown[]) => {
      collectionCallLog.push({ collection: name, method: 'find', args });
      return createMockCursor([]);
    }),
    findOne: mock((...args: unknown[]): Promise<unknown> => {
      collectionCallLog.push({ collection: name, method: 'findOne', args });
      return Promise.resolve(null);
    }),
    insertOne: mock((..._args: unknown[]) => Promise.resolve({ insertedId: new ObjectId() })),
    updateOne: mock((..._args: unknown[]) => Promise.resolve({ modifiedCount: 1 })),
    updateMany: mock((..._args: unknown[]) => Promise.resolve({ modifiedCount: 0 })),
    deleteOne: mock((..._args: unknown[]) => Promise.resolve({ deletedCount: 1 })),
    deleteMany: mock((..._args: unknown[]) => Promise.resolve({ deletedCount: 0 })),
    countDocuments: mock(() => Promise.resolve(0)),
  };
  return col;
}

const COLLECTIONS_MAP: Record<string, ReturnType<typeof createMockCollection>> = {};

function getMockCollection(name: string) {
  if (!COLLECTIONS_MAP[name]) {
    COLLECTIONS_MAP[name] = createMockCollection(name);
  }
  return COLLECTIONS_MAP[name];
}

const mockGetCollection = mock((name: string) => getMockCollection(name));

const COLLECTIONS_CONST = {
  USERS: 'users',
  SESSIONS: 'sessions',
  AUDIT_LOGS: 'audit_logs',
  TOTP_CREDENTIALS: 'totp_credentials',
  WEBAUTHN_CREDENTIALS: 'webauthn_credentials',
  USER_PREFERENCES: 'user_preferences',
  AGE_VERIFICATIONS: 'age_verifications',
  REFERRAL_CODES: 'referral_codes',
  REFERRAL_ATTRIBUTIONS: 'referral_attributions',
  PROMO_REDEMPTIONS: 'promo_redemptions',
  SPONSORSHIP_REQUESTS: 'sponsorship_requests',
  SPONSORSHIP_LOGS: 'sponsorship_logs',
  SUPPORT_TICKETS: 'support_tickets',
  IDENTITY_COUNTS: 'identity_counts',
  DELETED_EMAILS: 'deleted_emails',
} as const;

mock.module('../../../db', () => ({
  getCollection: mockGetCollection,
  Collections: COLLECTIONS_CONST,
  withTransaction: async (fn: (session: unknown) => Promise<unknown>) => fn(undefined),
  connectMongo: mock(() => Promise.resolve()),
  disconnectMongo: mock(() => Promise.resolve()),
  getDb: mock(() => ({})),
}));

mock.module('../../../db/mongo', () => ({
  getCollection: mockGetCollection,
  Collections: COLLECTIONS_CONST,
  connectMongo: mock(() => Promise.resolve()),
  disconnectMongo: mock(() => Promise.resolve()),
  getDb: mock(() => ({})),
  checkMongoHealth: mock(() => Promise.resolve({ status: 'up', latencyMs: 5 })),
  initializeCollections: mock(() => Promise.resolve([])),
}));

mock.module('../../../db/redis', () => ({
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

// -- OTP service -----------------------------------------------------------

const mockCreateOtp = mock((): Promise<string | null> => Promise.resolve('123456')) as AnyMock;
const mockVerifyOtp = mock(() => Promise.resolve({ valid: true })) as AnyMock;

mock.module('../../../services/otp.service', () => ({
  createOtp: mockCreateOtp,
  verifyOtp: mockVerifyOtp,
}));

// -- Messaging -------------------------------------------------------------

const mockSendEmail = mock(() => Promise.resolve()) as AnyMock;

mock.module('../../../services/messaging', () => ({
  sendEmail: mockSendEmail,
  sendSms: mock(() => Promise.resolve()),
}));

// -- i18n ------------------------------------------------------------------

const mockGetEmailTemplate = mock(() => ({
  subject: 'Delete your account',
  text: 'Your OTP is 123456',
  html: '<p>Your OTP is 123456</p>',
})) as AnyMock;

mock.module('../../../i18n', () => ({
  getEmailTemplate: mockGetEmailTemplate,
  DEFAULT_LOCALE: 'en',
}));

// -- Rate limit ------------------------------------------------------------

const mockCheckRateLimit = mock((_action: string, _id: string) =>
  Promise.resolve({ allowed: true, remaining: 5, resetAt: Date.now() + 60000, limit: 10 }),
) as AnyMock;

mock.module('../../../services/rate-limit.service', () =>
  createRateLimitServiceMock({ checkRateLimit: mockCheckRateLimit }),
);

// -- Session service -------------------------------------------------------

const mockDestroyAllSessions = mock(() => Promise.resolve(0)) as AnyMock;
const mockBuildAuthClearCookies = mock(() => [
  'adieuu_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
  'adieuu_csrf=; Max-Age=0; Path=/; SameSite=Lax',
]) as AnyMock;

mock.module('../../../services/session.service', () => ({
  destroyAllSessions: mockDestroyAllSessions,
  buildAuthClearCookies: mockBuildAuthClearCookies,
  createAccountSession: mock(() => Promise.resolve({ sessionId: 'sid', cookie: '', csrfCookie: '' })),
}));

// -- User repository -------------------------------------------------------

const mockFindById = mock(() => Promise.resolve(null)) as AnyMock;

mock.module('../../../repositories/user.repository', () => ({
  getUserRepository: () => ({ findById: mockFindById }),
}));

// -- Account token service -------------------------------------------------

const mockGenerateAccountHash = mock(() => 'test-account-hash') as AnyMock;

mock.module('../../../services/account-token.service', () => ({
  generateAccountHash: mockGenerateAccountHash,
  createSignedToken: mock(() => 'mock-signed-token'),
}));

// -- Logger ----------------------------------------------------------------

mock.module('../../../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

// ---------------------------------------------------------------------------
// Import code under test (AFTER all mock.module registrations)
// ---------------------------------------------------------------------------

import {
  gatherAccountData,
  requestAccountDeletion,
  confirmAccountDeletion,
  isEmailDeleted,
} from './controller';
import type { UserDocument } from '../../../models/user';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER_ID = '507f1f77bcf86cd799439011';
const TEST_OID = new ObjectId(TEST_USER_ID);
const NOW = new Date('2025-06-15T12:00:00Z');

function makeUser(overrides: Partial<UserDocument> = {}): UserDocument {
  return {
    _id: TEST_OID,
    email: 'test@example.com',
    emailVerified: true,
    phoneVerified: false,
    failedAttempts: 0,
    identityCount: 0,
    identityLockoutDuration: 3_600_000,
    identityLoginAttempts: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as UserDocument;
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex');
}

// ---------------------------------------------------------------------------
// Reset helpers
// ---------------------------------------------------------------------------

function resetCollectionMocks() {
  for (const name of Object.keys(COLLECTIONS_MAP)) {
    delete COLLECTIONS_MAP[name];
  }
  collectionCallLog.length = 0;
  mockGetCollection.mockClear();
}

function installCursorReturns(
  collectionName: string,
  docs: unknown[],
  opts?: { findOneResult?: unknown },
) {
  const col = getMockCollection(collectionName);
  col.find.mockImplementation(() => createMockCursor(docs));
  if (opts?.findOneResult !== undefined) {
    col.findOne.mockImplementation(() => Promise.resolve(opts.findOneResult));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('account data controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    resetCollectionMocks();
    mockCreateOtp.mockClear();
    mockVerifyOtp.mockClear();
    mockSendEmail.mockClear();
    mockGetEmailTemplate.mockClear();
    mockCheckRateLimit.mockClear();
    mockDestroyAllSessions.mockClear();
    mockBuildAuthClearCookies.mockClear();
    mockFindById.mockClear();
    mockGenerateAccountHash.mockClear();

    // Defaults
    mockCreateOtp.mockImplementation(() => Promise.resolve('123456'));
    mockVerifyOtp.mockImplementation(() => Promise.resolve({ valid: true }));
    mockCheckRateLimit.mockImplementation(() =>
      Promise.resolve({ allowed: true, remaining: 5, resetAt: Date.now() + 60000, limit: 10 }),
    );
    mockFindById.mockImplementation(() => Promise.resolve(null));
    mockBuildAuthClearCookies.mockImplementation(() => [
      'adieuu_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax',
      'adieuu_csrf=; Max-Age=0; Path=/; SameSite=Lax',
    ]);
    mockGetEmailTemplate.mockImplementation(() => ({
      subject: 'Delete your account',
      text: 'Your OTP is 123456',
      html: '<p>Your OTP is 123456</p>',
    }));
  });

  // =========================================================================
  // gatherAccountData
  // =========================================================================

  describe('gatherAccountData', () => {
    test('returns structured data with all fields populated', async () => {
      const user = makeUser();
      const sessionDoc = { _id: new ObjectId(), userId: TEST_OID, type: 'account', createdAt: NOW };
      const totpDoc = { _id: new ObjectId(), userId: TEST_OID, name: 'My TOTP' };
      const webauthnDoc = { _id: new ObjectId(), userId: TEST_OID, name: 'Yubikey' };
      const prefsDoc = { _id: new ObjectId(), userId: TEST_OID, theme: 'dark' };
      const ageDoc = { _id: new ObjectId(), userId: TEST_OID, status: 'verified' };
      const auditDoc = { _id: new ObjectId(), userId: TEST_OID, action: 'login', createdAt: NOW };
      const referralCodeDoc = { _id: new ObjectId(), userId: TEST_OID, code: 'ABC' };
      const referralAttrDoc = { _id: new ObjectId(), referrerId: TEST_OID, referredUserId: new ObjectId() };
      const promoDoc = { _id: new ObjectId(), userId: TEST_OID, code: 'PROMO1' };
      const sponsorReqDoc = { _id: new ObjectId(), userId: TEST_OID, status: 'pending' };
      const sponsorLogDoc = { _id: new ObjectId(), recipientUserId: TEST_OID, amount: 100 };
      const supportDoc = { _id: new ObjectId(), submitterId: TEST_USER_ID, submitterType: 'account' };
      const identityCountDoc = { accountHash: 'test-account-hash', count: 3 };

      installCursorReturns('sessions', [sessionDoc]);
      installCursorReturns('totp_credentials', [totpDoc]);
      installCursorReturns('webauthn_credentials', [webauthnDoc]);
      installCursorReturns('user_preferences', [], { findOneResult: prefsDoc });
      installCursorReturns('age_verifications', [ageDoc]);
      installCursorReturns('audit_logs', [auditDoc]);
      installCursorReturns('referral_codes', [referralCodeDoc]);
      installCursorReturns('referral_attributions', [referralAttrDoc]);
      installCursorReturns('promo_redemptions', [promoDoc]);
      installCursorReturns('sponsorship_requests', [sponsorReqDoc]);
      installCursorReturns('sponsorship_logs', [sponsorLogDoc]);
      installCursorReturns('support_tickets', [supportDoc]);
      installCursorReturns('identity_counts', [], { findOneResult: identityCountDoc });

      const result = await gatherAccountData(TEST_USER_ID, user);

      expect(result.sessions).toHaveLength(1);
      expect(result.mfaTotp).toHaveLength(1);
      expect(result.mfaWebAuthn).toHaveLength(1);
      expect(result.preferences).not.toBeNull();
      expect(result.ageVerifications).toHaveLength(1);
      expect(result.auditLogs).toHaveLength(1);
      expect(result.referralCodes).toHaveLength(1);
      expect(result.referralAttributions).toHaveLength(1);
      expect(result.promoRedemptions).toHaveLength(1);
      expect(result.sponsorshipRequests).toHaveLength(1);
      expect(result.sponsorshipLogs).toHaveLength(1);
      expect(result.supportTickets).toHaveLength(1);
      expect(result.identityCount).toBe(3);
      expect(result.exportedAt).toBeTruthy();
    });

    test('strips ObjectId fields to hex strings', async () => {
      const user = makeUser();
      const sessionDoc = { _id: new ObjectId(), userId: TEST_OID, type: 'account' };

      installCursorReturns('sessions', [sessionDoc]);
      installCursorReturns('identity_counts', [], { findOneResult: null });

      const result = await gatherAccountData(TEST_USER_ID, user);

      expect(typeof result.sessions[0]!._id).toBe('string');
      expect(typeof result.sessions[0]!.userId).toBe('string');
      expect(result.sessions[0]!._id).toBe(sessionDoc._id.toHexString());
    });

    test('strips Date fields to ISO strings', async () => {
      const user = makeUser();
      const auditDoc = { _id: new ObjectId(), userId: TEST_OID, createdAt: NOW };

      installCursorReturns('audit_logs', [auditDoc]);
      installCursorReturns('identity_counts', [], { findOneResult: null });

      const result = await gatherAccountData(TEST_USER_ID, user);

      expect(typeof result.auditLogs[0]!.createdAt).toBe('string');
      expect(result.auditLogs[0]!.createdAt).toBe(NOW.toISOString());
    });

    test('strips sensitive fields (stripeCustomerId) from user', async () => {
      const user = makeUser({ stripeCustomerId: 'cus_abc123' } as any);

      installCursorReturns('identity_counts', [], { findOneResult: null });

      const result = await gatherAccountData(TEST_USER_ID, user);

      expect(result.account.stripeCustomerId).toBeUndefined();
      expect(result.account.email).toBe('test@example.com');
    });

    test('returns identityCount from identity_counts collection', async () => {
      const user = makeUser();

      installCursorReturns('identity_counts', [], {
        findOneResult: { accountHash: 'test-account-hash', count: 7 },
      });

      const result = await gatherAccountData(TEST_USER_ID, user);

      expect(result.identityCount).toBe(7);
      expect(mockGenerateAccountHash).toHaveBeenCalledWith(TEST_USER_ID, user.createdAt);
    });

    test('returns 0 identityCount when no identity count doc exists', async () => {
      const user = makeUser();

      installCursorReturns('identity_counts', [], { findOneResult: null });

      const result = await gatherAccountData(TEST_USER_ID, user);

      expect(result.identityCount).toBe(0);
    });
  });

  // =========================================================================
  // requestAccountDeletion
  // =========================================================================

  describe('requestAccountDeletion', () => {
    test('returns { ok: false, reason: "no_email" } for non-email identifierType', async () => {
      const result = await requestAccountDeletion(
        TEST_USER_ID, '+15551234567', 'phone' as any, '192.168.1.1',
      );

      expect(result).toEqual({ ok: false, reason: 'no_email' });
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });

    test('returns { ok: false, reason: "rate_limited" } when rate limit exceeded', async () => {
      mockCheckRateLimit.mockImplementation(() =>
        Promise.resolve({ allowed: false, remaining: 0, resetAt: Date.now() + 60000, limit: 3 }),
      );

      const result = await requestAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '192.168.1.1',
      );

      expect(result).toEqual({ ok: false, reason: 'rate_limited' });
      expect(mockCreateOtp).not.toHaveBeenCalled();
    });

    test('returns { ok: false, reason: "internal" } when createOtp returns null', async () => {
      mockCreateOtp.mockImplementation(() => Promise.resolve(null));

      const result = await requestAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '192.168.1.1',
      );

      expect(result).toEqual({ ok: false, reason: 'internal' });
    });

    test('returns { ok: true } on success', async () => {
      const result = await requestAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '192.168.1.1',
      );

      expect(result).toEqual({ ok: true });
    });

    test('calls createOtp with identifier and "email"', async () => {
      await requestAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '192.168.1.1',
      );

      expect(mockCreateOtp).toHaveBeenCalledTimes(1);
      expect(mockCreateOtp).toHaveBeenCalledWith('test@example.com', 'email');
    });

    test('fires off email sending (fire-and-forget)', async () => {
      await requestAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '192.168.1.1',
      );

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockGetEmailTemplate).toHaveBeenCalledTimes(1);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockSendEmail.mock.calls[0]![0]).toMatchObject({
        to: 'test@example.com',
        subject: 'Delete your account',
      });
    });

    test('calls checkRateLimit with "account_delete" action and userId', async () => {
      await requestAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '192.168.1.1',
      );

      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
      expect(mockCheckRateLimit.mock.calls[0]![0]).toBe('account_delete');
      expect(mockCheckRateLimit.mock.calls[0]![1]).toBe(TEST_USER_ID);
    });
  });

  // =========================================================================
  // confirmAccountDeletion
  // =========================================================================

  describe('confirmAccountDeletion', () => {
    const user = makeUser({ email: 'test@example.com' });

    test('returns { ok: false, reason: "no_email" } for non-email identifierType', async () => {
      const result = await confirmAccountDeletion(
        TEST_USER_ID, '+15551234567', 'phone' as any, '123456',
      );

      expect(result).toEqual({ ok: false, reason: 'no_email' });
      expect(mockVerifyOtp).not.toHaveBeenCalled();
    });

    test('returns { ok: false, reason: "invalid_code" } when verifyOtp fails', async () => {
      mockVerifyOtp.mockImplementation(() => Promise.resolve({ valid: false, error: 'invalid' }));

      const result = await confirmAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '000000',
      );

      expect(result).toEqual({ ok: false, reason: 'invalid_code' });
      expect(mockFindById).not.toHaveBeenCalled();
    });

    test('returns { ok: false, reason: "user_not_found" } when user not in DB', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(null));

      const result = await confirmAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '123456',
      );

      expect(result).toEqual({ ok: false, reason: 'user_not_found' });
    });

    test('calls verifyOtp with identifier and code', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(user));

      await confirmAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '123456',
      );

      expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
      expect(mockVerifyOtp).toHaveBeenCalledWith('test@example.com', '123456');
    });

    test('on success returns { ok: true, cookies: [...] }', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(user));

      const result = await confirmAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '123456',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.cookies)).toBe(true);
        expect(result.cookies.length).toBeGreaterThan(0);
        expect(result.cookies[0]).toContain('Max-Age=0');
      }
    });

    test('on success calls destroyAllSessions', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(user));

      await confirmAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '123456',
      );

      expect(mockDestroyAllSessions).toHaveBeenCalledWith(TEST_USER_ID);
    });

    test('on success deletes user document', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(user));

      await confirmAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '123456',
      );

      const usersCol = getMockCollection('users');
      expect(usersCol.deleteOne).toHaveBeenCalledTimes(1);
      const deleteArg = usersCol.deleteOne.mock.calls[0]![0] as { _id: ObjectId };
      expect(deleteArg._id.toHexString()).toBe(TEST_USER_ID);
    });

    test('on success stores hashed email in deleted_emails', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(user));

      await confirmAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '123456',
      );

      const deletedCol = getMockCollection('deleted_emails');
      expect(deletedCol.updateOne).toHaveBeenCalledTimes(1);

      const [filter, update, options] = deletedCol.updateOne.mock.calls[0] as [
        { emailHash: string },
        { $setOnInsert: { emailHash: string } },
        { upsert: boolean },
      ];

      expect(filter.emailHash).toBe(hashEmail('test@example.com'));
      expect(update.$setOnInsert.emailHash).toBe(hashEmail('test@example.com'));
      expect(options.upsert).toBe(true);
    });

    test('on success bulk-deletes across account-scoped collections', async () => {
      mockFindById.mockImplementation(() => Promise.resolve(user));

      await confirmAccountDeletion(
        TEST_USER_ID, 'test@example.com', 'email', '123456',
      );

      const deletedCollections = [
        'totp_credentials',
        'webauthn_credentials',
        'user_preferences',
        'age_verifications',
        'referral_codes',
        'referral_attributions',
        'promo_redemptions',
        'sponsorship_requests',
        'sponsorship_logs',
      ];

      for (const name of deletedCollections) {
        const col = getMockCollection(name);
        expect(col.deleteMany).toHaveBeenCalledTimes(1);
      }

      const auditCol = getMockCollection('audit_logs');
      expect(auditCol.updateMany).toHaveBeenCalledTimes(1);

      const supportCol = getMockCollection('support_tickets');
      expect(supportCol.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // isEmailDeleted
  // =========================================================================

  describe('isEmailDeleted', () => {
    test('returns true when email hash exists in deleted_emails', async () => {
      const email = 'deleted@example.com';
      const col = getMockCollection('deleted_emails');
      col.findOne.mockImplementation(() =>
        Promise.resolve({ emailHash: hashEmail(email), deletedAt: new Date() }),
      );

      const result = await isEmailDeleted(email);

      expect(result).toBe(true);
      expect(col.findOne).toHaveBeenCalledWith({ emailHash: hashEmail(email) });
    });

    test('returns false when email hash does not exist', async () => {
      const col = getMockCollection('deleted_emails');
      col.findOne.mockImplementation(() => Promise.resolve(null));

      const result = await isEmailDeleted('new@example.com');

      expect(result).toBe(false);
    });
  });
});
