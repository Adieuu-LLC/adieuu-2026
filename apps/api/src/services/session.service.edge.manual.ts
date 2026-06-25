import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { CachedSessionData } from '../models/session';
import { DEFAULT_MAX_VIDEO_DURATION_SECONDS } from '../constants/media-limits';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockConfig = {
  env: 'test',
  cookie: { domain: '' },
  security: { sessionSecret: 'test-secret', otpSecret: 'test-otp-secret', csrfSecret: 'test-csrf-secret' },
};

const mockSessionRepo = {
  createSession: mock(() => Promise.resolve()) as AnyMock,
  getSession: mock(() => Promise.resolve(null)) as AnyMock,
  revoke: mock(() => Promise.resolve()) as AnyMock,
  revokeAllForUser: mock(() => Promise.resolve(0)) as AnyMock,
  revokeAllForIdentity: mock(() => Promise.resolve(0)) as AnyMock,
  updateLastActivity: mock(() => Promise.resolve(new Date('2030-06-01T12:00:00.000Z'))) as AnyMock,
};

mock.module('../config', () => ({ config: mockConfig }));

mock.module('../repositories/session.repository', () => ({
  getSessionRepository: () => mockSessionRepo,
}));

mock.module('../utils/crypto', () => ({
  generateSecureToken: mock(() => 'mock-session-id-token'),
}));

import {
  createAccountSession,
  createIdentitySession,
  getSession,
  destroySession,
  destroyAllSessions,
  destroyAllIdentitySessions,
  getSessionFromRequest,
  requireAccountSession,
  requireIdentitySession,
  buildLogoutCookie,
} from './session.service';

function makeAccountCached(overrides?: Partial<CachedSessionData>): CachedSessionData {
  return {
    type: 'account',
    userId: '507f1f77bcf86cd799439011',
    identifier: 'user@example.com',
    identifierType: 'email',
    expiresAt: Date.now() + 86_400_000,
    lastActivityAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makeIdentityCached(overrides?: Partial<CachedSessionData>): CachedSessionData {
  return {
    type: 'identity',
    identityId: '507f1f77bcf86cd799439012',
    expiresAt: Date.now() + 86_400_000,
    lastActivityAt: 1_700_000_000_000,
    ...overrides,
  };
}

function requestWithCookie(cookie: string): Request {
  return new Request('http://localhost', { headers: { Cookie: cookie } });
}

describe('session.service', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockConfig.env = 'test';
    mockConfig.cookie.domain = '';

    for (const fn of Object.values(mockSessionRepo)) {
      fn.mockReset();
    }

    mockSessionRepo.createSession.mockResolvedValue(undefined);
    mockSessionRepo.getSession.mockResolvedValue(null);
    mockSessionRepo.revoke.mockResolvedValue(undefined);
    mockSessionRepo.revokeAllForUser.mockResolvedValue(0);
    mockSessionRepo.revokeAllForIdentity.mockResolvedValue(0);
    mockSessionRepo.updateLastActivity.mockResolvedValue(new Date('2030-06-01T12:00:00.000Z'));
  });

  describe('createAccountSession', () => {
    test('stores an account session and returns sessionId + cookie', async () => {
      const userId = new ObjectId();
      const result = await createAccountSession(userId, 'user@example.com', 'email', {
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
      });

      expect(mockSessionRepo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'mock-session-id-token',
          type: 'account',
          userId,
          identifier: 'user@example.com',
          identifierType: 'email',
          userAgent: 'test-agent',
          ipAddress: '127.0.0.1',
        }),
      );
      expect(result.sessionId).toBe('mock-session-id-token');
      expect(result.cookie).toContain('adieuu_session=mock-session-id-token');
      expect(result.csrfCookie).toContain('adieuu_csrf=');
      expect(result.cookie).toContain('HttpOnly');
      expect(result.cookie).toContain('SameSite=Lax');
      expect(result.cookie).toContain('Path=/');
      expect(result.cookie).not.toContain('Secure');
    });

    test('includes Secure and Domain in production', async () => {
      mockConfig.env = 'production';
      mockConfig.cookie.domain = '.example.com';

      const result = await createAccountSession(new ObjectId(), 'a@b.com', 'email');

      expect(result.cookie).toContain('Secure');
      expect(result.cookie).toContain('Domain=.example.com');
    });
  });

  describe('createIdentitySession', () => {
    test('stores an identity session and returns sessionId + cookie', async () => {
      const identityId = new ObjectId();
      const result = await createIdentitySession(identityId, {
        userAgent: 'test-agent',
      });

      expect(mockSessionRepo.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'mock-session-id-token',
          type: 'identity',
          identityId,
        }),
      );
      expect(mockSessionRepo.createSession).toHaveBeenCalledWith(
        expect.not.objectContaining({
          userAgent: 'test-agent',
        }),
      );
      expect(result.sessionId).toBe('mock-session-id-token');
      expect(result.cookie).toContain('adieuu_session=mock-session-id-token');
      expect(result.csrfCookie).toContain('adieuu_csrf=');
      expect(result.cookie).toContain('HttpOnly');
      expect(result.cookie).toContain('Path=/');
    });
  });

  describe('getSession', () => {
    test('returns null for empty session id', async () => {
      expect(await getSession('')).toBeNull();
      expect(mockSessionRepo.getSession).not.toHaveBeenCalled();
    });

    test('returns null when repository has no matching session', async () => {
      expect(await getSession('nonexistent')).toBeNull();
    });

    test('returns AccountSessionData and fires activity update', async () => {
      mockSessionRepo.getSession.mockResolvedValue(makeAccountCached());

      const result = await getSession('sess-123');

      expect(result).toEqual({
        type: 'account',
        userId: '507f1f77bcf86cd799439011',
        identifier: 'user@example.com',
        identifierType: 'email',
        lastActivityAt: 1_700_000_000_000,
        expiresAt: new Date('2030-06-01T12:00:00.000Z').getTime(),
      });
      expect(mockSessionRepo.updateLastActivity).toHaveBeenCalledWith('sess-123');
    });

    test('returns IdentitySessionData for identity-type cached data', async () => {
      mockSessionRepo.getSession.mockResolvedValue(makeIdentityCached());

      const result = await getSession('sess-456');

      expect(result).toEqual({
        type: 'identity',
        identityId: '507f1f77bcf86cd799439012',
        maxVideoDurationSeconds: DEFAULT_MAX_VIDEO_DURATION_SECONDS,
        subscriptions: [],
        entitlements: [],
        isLifetime: false,
        lastActivityAt: 1_700_000_000_000,
        expiresAt: new Date('2030-06-01T12:00:00.000Z').getTime(),
      });
    });
  });

  describe('destroySession', () => {
    test('is a no-op for empty session id', async () => {
      await destroySession('');
      expect(mockSessionRepo.revoke).not.toHaveBeenCalled();
    });

    test('delegates to repository', async () => {
      await destroySession('sess-123');
      expect(mockSessionRepo.revoke).toHaveBeenCalledWith('sess-123');
    });
  });

  describe('destroyAllSessions', () => {
    test('delegates to repository and returns revoked count', async () => {
      mockSessionRepo.revokeAllForUser.mockResolvedValue(3);
      const userId = new ObjectId();

      expect(await destroyAllSessions(userId)).toBe(3);
      expect(mockSessionRepo.revokeAllForUser).toHaveBeenCalledWith(userId);
    });
  });

  describe('destroyAllIdentitySessions', () => {
    test('delegates to repository and returns revoked count', async () => {
      mockSessionRepo.revokeAllForIdentity.mockResolvedValue(2);
      const identityId = new ObjectId();

      expect(await destroyAllIdentitySessions(identityId)).toBe(2);
      expect(mockSessionRepo.revokeAllForIdentity).toHaveBeenCalledWith(identityId);
    });
  });

  describe('getSessionFromRequest', () => {
    test('returns null when no cookie header is present', async () => {
      expect(await getSessionFromRequest(new Request('http://localhost'))).toBeNull();
    });

    test('returns null when adieuu_session cookie is absent', async () => {
      const req = requestWithCookie('other=value; foo=bar');
      expect(await getSessionFromRequest(req)).toBeNull();
    });

    test('extracts session id from cookie and returns session data', async () => {
      mockSessionRepo.getSession.mockResolvedValue(makeAccountCached());

      const req = requestWithCookie('other=x; adieuu_session=sess-abc; z=1');
      const result = await getSessionFromRequest(req);

      expect(mockSessionRepo.getSession).toHaveBeenCalledWith('sess-abc');
      expect(result).toEqual(
        expect.objectContaining({ type: 'account', userId: '507f1f77bcf86cd799439011' }),
      );
    });
  });

  describe('requireAccountSession', () => {
    test('returns account data when session type is account', async () => {
      mockSessionRepo.getSession.mockResolvedValue(makeAccountCached());

      const req = requestWithCookie('adieuu_session=sess-acc');
      const result = await requireAccountSession(req);

      expect(result).toEqual({
        type: 'account',
        userId: '507f1f77bcf86cd799439011',
        identifier: 'user@example.com',
        identifierType: 'email',
        lastActivityAt: 1_700_000_000_000,
        expiresAt: new Date('2030-06-01T12:00:00.000Z').getTime(),
      });
    });

    test('returns null when session type is identity', async () => {
      mockSessionRepo.getSession.mockResolvedValue(makeIdentityCached());

      const req = requestWithCookie('adieuu_session=sess-id');
      expect(await requireAccountSession(req)).toBeNull();
    });

    test('returns null when no session exists', async () => {
      expect(await requireAccountSession(new Request('http://localhost'))).toBeNull();
    });
  });

  describe('requireIdentitySession', () => {
    test('returns identity data when session type is identity', async () => {
      mockSessionRepo.getSession.mockResolvedValue(makeIdentityCached());

      const req = requestWithCookie('adieuu_session=sess-id');
      const result = await requireIdentitySession(req);

      expect(result).toEqual({
        type: 'identity',
        identityId: '507f1f77bcf86cd799439012',
        maxVideoDurationSeconds: DEFAULT_MAX_VIDEO_DURATION_SECONDS,
        subscriptions: [],
        entitlements: [],
        isLifetime: false,
        lastActivityAt: 1_700_000_000_000,
        expiresAt: new Date('2030-06-01T12:00:00.000Z').getTime(),
      });
    });

    test('returns null when session type is account', async () => {
      mockSessionRepo.getSession.mockResolvedValue(makeAccountCached());

      const req = requestWithCookie('adieuu_session=sess-acc');
      expect(await requireIdentitySession(req)).toBeNull();
    });

    test('returns null when no session exists', async () => {
      expect(await requireIdentitySession(new Request('http://localhost'))).toBeNull();
    });
  });

  describe('buildLogoutCookie', () => {
    test('returns a cookie string that clears the session', () => {
      const cookie = buildLogoutCookie();

      expect(cookie).toContain('adieuu_session=');
      expect(cookie).toContain('Max-Age=0');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toContain('Secure');
    });

    test('includes Secure and Domain in production', () => {
      mockConfig.env = 'production';
      mockConfig.cookie.domain = '.example.com';

      const cookie = buildLogoutCookie();

      expect(cookie).toContain('Secure');
      expect(cookie).toContain('Domain=.example.com');
    });
  });
});
