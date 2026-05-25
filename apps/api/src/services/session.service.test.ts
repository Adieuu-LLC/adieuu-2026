import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../config', () => ({
  config: {
    env: 'test',
    cookie: { domain: undefined },
    security: { csrfSecret: 'test-csrf-secret' },
  },
}));

const mockGetSession = mock(() => Promise.resolve(null)) as AnyMock;
const mockUpdateLastActivity = mock(() => Promise.resolve(new Date(Date.now() + 86_400_000))) as AnyMock;
const mockRevoke = mock(() => Promise.resolve()) as AnyMock;
const mockRevokeAllForUser = mock(() => Promise.resolve(0)) as AnyMock;
const mockCreateSession = mock(() => Promise.resolve()) as AnyMock;

mock.module('../repositories/session.repository', () => ({
  getSessionRepository: () => ({
    getSession: mockGetSession,
    updateLastActivity: mockUpdateLastActivity,
    revoke: mockRevoke,
    revokeAllForUser: mockRevokeAllForUser,
    createSession: mockCreateSession,
  }),
}));

mock.module('../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import {
  requireAccountSession,
  requireIdentitySession,
  destroySession,
  destroyAllSessions,
  getSessionFromRequest,
  buildSessionCookie,
  parseSessionCookie,
} from './session.service';

function makeRequest(sessionValue: string): Request {
  return new Request('http://localhost/api/test', {
    headers: { Cookie: `adieuu_session=${sessionValue}` },
  });
}

describe('session.service', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockGetSession.mockReset();
    mockUpdateLastActivity.mockReset();
    mockRevoke.mockReset();
    mockRevokeAllForUser.mockReset();
    mockCreateSession.mockReset();
    mockUpdateLastActivity.mockImplementation(() =>
      Promise.resolve(new Date(Date.now() + 86_400_000))
    );
  });

  test('requireAccountSession returns account session data', async () => {
    mockGetSession.mockResolvedValue({
      type: 'account',
      userId: 'user-1',
      identifier: 'user@example.com',
      identifierType: 'email',
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    });

    const session = await requireAccountSession(makeRequest('account-sess'));
    expect(session?.type).toBe('account');
    expect(session?.userId).toBe('user-1');
  });

  test('requireAccountSession returns null for identity session', async () => {
    mockGetSession.mockResolvedValue({
      type: 'identity',
      identityId: new ObjectId().toHexString(),
      maxVideoDurationSeconds: 300,
      subscriptions: [],
      entitlements: [],
      isLifetime: false,
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    });

    const session = await requireAccountSession(makeRequest('identity-sess'));
    expect(session).toBeNull();
  });

  test('requireIdentitySession returns identity session data', async () => {
    const identityId = new ObjectId().toHexString();
    mockGetSession.mockResolvedValue({
      type: 'identity',
      identityId,
      maxVideoDurationSeconds: 300,
      subscriptions: [],
      entitlements: [],
      isLifetime: false,
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    });

    const session = await requireIdentitySession(makeRequest('identity-sess'));
    expect(session?.type).toBe('identity');
    expect(session?.identityId).toBe(identityId);
  });

  test('getSessionFromRequest returns null when cookie missing', async () => {
    const session = await getSessionFromRequest(new Request('http://localhost'));
    expect(session).toBeNull();
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  test('getSessionFromRequest deduplicates loads within same request', async () => {
    mockGetSession.mockResolvedValue({
      type: 'account',
      userId: 'user-1',
      identifier: 'user@example.com',
      identifierType: 'email',
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    });

    const request = makeRequest('dedupe-sess');
    await getSessionFromRequest(request);
    await getSessionFromRequest(request);

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockGetSession).toHaveBeenCalledWith('dedupe-sess');
  });

  test('destroySession revokes by session id', async () => {
    await destroySession('sess-to-revoke');
    expect(mockRevoke).toHaveBeenCalledWith('sess-to-revoke');
  });

  test('destroyAllSessions revokes all user sessions', async () => {
    mockRevokeAllForUser.mockResolvedValue(3);
    const count = await destroyAllSessions('user-1');
    expect(count).toBe(3);
    expect(mockRevokeAllForUser).toHaveBeenCalledWith('user-1');
  });

  test('buildSessionCookie includes grant-key cookie value unchanged', () => {
    const cookie = buildSessionCookie('sess123.grantKey==', 3600);
    expect(cookie).toContain('adieuu_session=sess123.grantKey==');
    expect(cookie).toContain('Max-Age=3600');
    expect(cookie).toContain('HttpOnly');
  });

  test('parseSessionCookie round-trips grant key suffix', () => {
    const parsed = parseSessionCookie('sess123.grantKey==');
    expect(parsed.sessionId).toBe('sess123');
    expect(parsed.grantKey).toBe('grantKey==');
  });
});
