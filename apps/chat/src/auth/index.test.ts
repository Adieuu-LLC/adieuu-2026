import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockIsRedisConnected = vi.fn(() => true);
const mockFindOne = vi.fn();

vi.mock('../db/redis', () => ({
  getPublisher: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
  }),
  isRedisConnected: () => mockIsRedisConnected(),
}));

vi.mock('../db/mongo', () => ({
  getSessionsCollection: () => ({
    findOne: mockFindOne,
  }),
}));

vi.mock('../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { parseCookies, extractSessionId, validateSession } from './index';

describe('chat auth', () => {
  beforeEach(() => {
    mockRedisGet.mockReset();
    mockRedisSet.mockReset();
    mockFindOne.mockReset();
    mockIsRedisConnected.mockReset();
    mockIsRedisConnected.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('parseCookies', () => {
    it('returns empty object for null header', () => {
      expect(parseCookies(null)).toEqual({});
    });

    it('parses multiple cookies', () => {
      expect(parseCookies('a=1; b=2; c=hello=world')).toEqual({
        a: '1',
        b: '2',
        c: 'hello=world',
      });
    });
  });

  describe('extractSessionId', () => {
    it('extracts session id from cookie', () => {
      const sessionId = extractSessionId('adieuu_session=sess-abc123', '');
      expect(sessionId).toBe('sess-abc123');
    });

    it('strips grant-key suffix from cookie value', () => {
      const sessionId = extractSessionId('adieuu_session=sess-abc.grantKeyBase64==', '');
      expect(sessionId).toBe('sess-abc');
    });

    it('falls back to query token when cookie absent', () => {
      const sessionId = extractSessionId(null, '?token=query-session');
      expect(sessionId).toBe('query-session');
    });

    it('returns null when neither cookie nor token present', () => {
      expect(extractSessionId(null, '')).toBeNull();
    });
  });

  describe('validateSession', () => {
    it('returns null for expired cached identity session', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({
        type: 'identity',
        identityId: '507f1f77bcf86cd799439011',
        expiresAt: Date.now() - 1000,
        lastActivityAt: Date.now() - 2000,
      }));

      const result = await validateSession('expired-session');
      expect(result).toBeNull();
    });

    it('returns null for cached account session without identityId', async () => {
      mockRedisGet.mockResolvedValue(JSON.stringify({
        type: 'account',
        expiresAt: Date.now() + 60_000,
        lastActivityAt: Date.now(),
      }));

      const result = await validateSession('account-session');
      expect(result).toBeNull();
    });

    it('returns session data for valid cached identity session', async () => {
      const identityId = '507f1f77bcf86cd799439011';
      const expiresAt = Date.now() + 60_000;
      mockRedisGet.mockResolvedValue(JSON.stringify({
        type: 'identity',
        identityId,
        expiresAt,
        lastActivityAt: Date.now(),
      }));

      const result = await validateSession('valid-session');
      expect(result).toEqual({
        identityId,
        expiresAt,
        lastActivityAt: expect.any(Number),
      });
    });

    it('loads identity session from database on cache miss', async () => {
      mockRedisGet.mockResolvedValue(null);
      const identityId = '507f1f77bcf86cd799439011';
      mockFindOne.mockResolvedValue({
        type: 'identity',
        identityId,
        expiresAt: new Date(Date.now() + 60_000),
        lastActivityAt: new Date(),
        revoked: false,
      });

      const result = await validateSession('db-session');
      expect(result?.identityId).toBe(identityId);
      expect(mockFindOne).toHaveBeenCalledWith({
        sessionId: 'db-session',
        type: 'identity',
        revoked: false,
      });
      expect(mockRedisSet).toHaveBeenCalled();
    });

    it('returns null when database session is expired', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockFindOne.mockResolvedValue({
        type: 'identity',
        identityId: '507f1f77bcf86cd799439011',
        expiresAt: new Date(Date.now() - 1000),
        lastActivityAt: new Date(Date.now() - 2000),
        revoked: false,
      });

      const result = await validateSession('expired-db-session');
      expect(result).toBeNull();
    });
  });
});
