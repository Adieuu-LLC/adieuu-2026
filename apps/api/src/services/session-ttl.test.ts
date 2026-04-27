/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test, mock, beforeEach } from 'bun:test';

type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetSessionRepo = mock(() => null) as AnyMock;
const mockRepoGetSession = mock(() => Promise.resolve(null)) as AnyMock;
const mockRepoUpdateLastActivity = mock(() => Promise.resolve(null)) as AnyMock;
const mockRepoRevoke = mock(() => Promise.resolve()) as AnyMock;

mock.module('../repositories/session.repository', () => ({
  getSessionRepository: () => ({
    getSession: mockRepoGetSession,
    updateLastActivity: mockRepoUpdateLastActivity,
    revoke: mockRepoRevoke,
  }),
}));

mock.module('../config', () => ({
  config: {
    env: 'test',
    cookie: { domain: '' },
  },
}));

mock.module('../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

mock.module('../utils/crypto', () => ({
  generateSecureToken: () => 'mock-token',
}));

mock.module('../constants/session', () => ({
  SESSION_ACCOUNT_TTL_SECONDS: 3600,
  SESSION_IDENTITY_TTL_SECONDS: 604800,
}));

import { getSession } from './session.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function makeIdentityCached(overrides: Record<string, unknown> = {}) {
  return {
    type: 'identity' as const,
    identityId: 'abc123def456',
    maxVideoDurationSeconds: 300,
    subscriptions: [],
    entitlements: [],
    lastActivityAt: Date.now(),
    expiresAt: Date.now() + 604_800_000,
    ...overrides,
  };
}

function makeAccountCached() {
  return {
    type: 'account' as const,
    userId: 'user-1',
    identifier: 'u@example.com',
    identifierType: 'email' as const,
    lastActivityAt: Date.now(),
    expiresAt: Date.now() + 3_600_000,
  };
}

// ---------------------------------------------------------------------------
// 7f. Absolute TTL boundary tests
// ---------------------------------------------------------------------------

describe('getSession absolute TTL', () => {
  beforeEach(() => {
    mockRepoGetSession.mockReset();
    mockRepoUpdateLastActivity.mockReset();
    mockRepoRevoke.mockReset();

    mockRepoUpdateLastActivity.mockResolvedValue(
      new Date(Date.now() + 604_800_000),
    );
  });

  test('identity session with absoluteExpiresAt in the future -> returns session data', async () => {
    const cached = makeIdentityCached({
      absoluteExpiresAt: Date.now() + ONE_DAY_MS,
    });
    mockRepoGetSession.mockResolvedValue(cached);

    const result = await getSession('test-session');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('identity');
    expect(mockRepoRevoke).not.toHaveBeenCalled();
  });

  test('day 29: session still valid', async () => {
    const cached = makeIdentityCached({
      absoluteExpiresAt: Date.now() + ONE_DAY_MS,
    });
    mockRepoGetSession.mockResolvedValue(cached);

    const result = await getSession('test-session');
    expect(result).not.toBeNull();
    expect(mockRepoRevoke).not.toHaveBeenCalled();
  });

  test('day 31: absoluteExpiresAt in the past -> destroySession + returns null', async () => {
    const cached = makeIdentityCached({
      absoluteExpiresAt: Date.now() - ONE_DAY_MS,
    });
    mockRepoGetSession.mockResolvedValue(cached);

    const result = await getSession('test-session');
    expect(result).toBeNull();
    expect(mockRepoRevoke).toHaveBeenCalledWith('test-session');
  });

  test('boundary: absoluteExpiresAt exactly now -> returns null (>= check)', async () => {
    const now = Date.now();
    const cached = makeIdentityCached({ absoluteExpiresAt: now });
    mockRepoGetSession.mockResolvedValue(cached);

    const result = await getSession('test-session');
    expect(result).toBeNull();
    expect(mockRepoRevoke).toHaveBeenCalledWith('test-session');
  });

  test('identity session without absoluteExpiresAt -> returns session data', async () => {
    const cached = makeIdentityCached();
    mockRepoGetSession.mockResolvedValue(cached);

    const result = await getSession('test-session');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('identity');
    expect(mockRepoRevoke).not.toHaveBeenCalled();
  });

  test('account session ignores absoluteExpiresAt', async () => {
    const cached = makeAccountCached();
    mockRepoGetSession.mockResolvedValue(cached);

    const result = await getSession('test-session');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('account');
    expect(mockRepoRevoke).not.toHaveBeenCalled();
  });

  test('missing identityId on identity session -> returns null without destroying', async () => {
    const cached = makeIdentityCached({
      identityId: undefined,
      absoluteExpiresAt: Date.now() + THIRTY_DAYS_MS,
    });
    mockRepoGetSession.mockResolvedValue(cached);

    const result = await getSession('test-session');
    expect(result).toBeNull();
  });

  test('empty sessionId -> returns null immediately', async () => {
    const result = await getSession('');
    expect(result).toBeNull();
    expect(mockRepoGetSession).not.toHaveBeenCalled();
  });

  test('session not found in repository -> returns null', async () => {
    mockRepoGetSession.mockResolvedValue(null);

    const result = await getSession('nonexistent');
    expect(result).toBeNull();
  });
});
