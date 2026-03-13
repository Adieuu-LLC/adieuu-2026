import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockConfig = {
  env: 'test',
  cookie: {
    domain: '',
  },
};

const mockSessionRepo = {
  create: mock(() => Promise.resolve(null)) as AnyMock,
  getSession: mock(() => Promise.resolve(null)) as AnyMock,
  updateLastActivity: mock(() => Promise.resolve()) as AnyMock,
  revoke: mock(() => Promise.resolve()) as AnyMock,
  revokeAllForUser: mock(() => Promise.resolve(0)) as AnyMock,
};

const mockGenerateSecureToken = mock(() => 'fixed-session-token');

mock.module('../config', () => ({
  config: mockConfig,
}));

mock.module('../repositories/session.repository', () => ({
  getSessionRepository: () => mockSessionRepo,
}));

mock.module('../utils/crypto', () => ({
  generateSecureToken: mockGenerateSecureToken,
}));

mock.module('../utils/adieuuLogger', () => ({
  default: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  },
}));

import {
  createSession,
  getSession,
  destroySession,
  destroyAllSessions,
  buildLogoutCookie,
  getSessionIdFromRequest,
  getSessionFromRequest,
} from './session.service';

describe('session.service', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockConfig.env = 'test';
    mockConfig.cookie.domain = '';

    mockGenerateSecureToken.mockReset();
    mockGenerateSecureToken.mockReturnValue('fixed-session-token');

    mockSessionRepo.create.mockReset();
    mockSessionRepo.getSession.mockReset();
    mockSessionRepo.updateLastActivity.mockReset();
    mockSessionRepo.revoke.mockReset();
    mockSessionRepo.revokeAllForUser.mockReset();

    mockSessionRepo.create.mockResolvedValue(null);
    mockSessionRepo.getSession.mockResolvedValue(null);
    mockSessionRepo.updateLastActivity.mockResolvedValue(undefined);
    mockSessionRepo.revoke.mockResolvedValue(undefined);
    mockSessionRepo.revokeAllForUser.mockResolvedValue(0);
  });

  test('createSession stores session and returns hardened cookie', async () => {
    const userId = new ObjectId();
    const result = await createSession(
      userId,
      'user@example.com',
      'email',
      { userAgent: 'test-agent', ipAddress: '127.0.0.1' }
    );

    expect(mockSessionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'fixed-session-token',
        userId,
        identifier: 'user@example.com',
        identifierType: 'email',
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
      })
    );
    expect(result.sessionId).toBe('fixed-session-token');
    expect(result.cookie).toContain('adieuu_session=fixed-session-token');
    expect(result.cookie).toContain('HttpOnly');
    expect(result.cookie).toContain('SameSite=Lax');
    expect(result.cookie).toContain('Path=/');
    expect(result.cookie).not.toContain('Secure');
  });

  test('cookie builders include Secure + Domain in production', async () => {
    mockConfig.env = 'production';
    mockConfig.cookie.domain = '.example.com';

    const result = await createSession(
      new ObjectId(),
      'user@example.com',
      'email'
    );
    const logoutCookie = buildLogoutCookie();

    expect(result.cookie).toContain('Secure');
    expect(result.cookie).toContain('Domain=.example.com');
    expect(logoutCookie).toContain('Secure');
    expect(logoutCookie).toContain('Domain=.example.com');
    expect(logoutCookie).toContain('adieuu_session=');
    expect(logoutCookie).toContain('Max-Age=0');
  });

  test('getSession returns null for missing session id', async () => {
    const result = await getSession('');
    expect(result).toBeNull();
    expect(mockSessionRepo.getSession).not.toHaveBeenCalled();
  });

  test('getSession returns mapped data and updates activity asynchronously', async () => {
    mockSessionRepo.getSession.mockResolvedValue({
      userId: '507f1f77bcf86cd799439011',
      identifier: 'user@example.com',
      identifierType: 'email',
      lastActivityAt: 1234,
    });

    const result = await getSession('fixed-session-token');
    expect(result).toEqual({
      userId: '507f1f77bcf86cd799439011',
      identifier: 'user@example.com',
      identifierType: 'email',
      lastActivityAt: 1234,
    });
    expect(mockSessionRepo.updateLastActivity).toHaveBeenCalledWith('fixed-session-token');
  });

  test('getSessionIdFromRequest parses session cookie among multiple cookies', () => {
    const request = new Request('http://localhost', {
      headers: {
        Cookie: 'other=value; adieuu_session=session123; x=y',
      },
    });
    expect(getSessionIdFromRequest(request)).toBe('session123');
  });

  test('getSessionFromRequest returns null when cookie missing', async () => {
    const request = new Request('http://localhost');
    const result = await getSessionFromRequest(request);
    expect(result).toBeNull();
  });

  test('destroySession is no-op for empty id and delegates otherwise', async () => {
    await destroySession('');
    expect(mockSessionRepo.revoke).not.toHaveBeenCalled();

    await destroySession('session123');
    expect(mockSessionRepo.revoke).toHaveBeenCalledWith('session123');
  });

  test('destroyAllSessions delegates to repository', async () => {
    mockSessionRepo.revokeAllForUser.mockResolvedValue(3);
    const userId = new ObjectId();
    const count = await destroyAllSessions(userId);
    expect(count).toBe(3);
    expect(mockSessionRepo.revokeAllForUser).toHaveBeenCalledWith(userId);
  });
});

