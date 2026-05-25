import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import type { AccountSessionData } from '../services/session.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockGetSessionIdFromRequest = mock(() => null) as AnyMock;
const mockGetSessionFromRequest = mock(() => Promise.resolve(null)) as AnyMock;
const mockGetGrantKeyFromRequest = mock(() => null) as AnyMock;
const mockBuildSessionCookie = mock((_value: string, maxAge: number) =>
  `adieuu_session=${_value}; Max-Age=${maxAge}; Path=/; HttpOnly`
) as AnyMock;

mock.module('../services/session.service', () => ({
  getSessionIdFromRequest: mockGetSessionIdFromRequest,
  getSessionFromRequest: mockGetSessionFromRequest,
  getGrantKeyFromRequest: mockGetGrantKeyFromRequest,
  buildSessionCookie: mockBuildSessionCookie,
  SESSION_CONFIG: { cookieName: 'adieuu_session' },
}));

import { sessionCookieRenewal } from './session-cookie-renewal';

function makeAccountSession(expiresAt: number): AccountSessionData {
  return {
    type: 'account',
    userId: 'user-1',
    identifier: 'user@example.com',
    identifierType: 'email',
    lastActivityAt: Date.now(),
    expiresAt,
  };
}

function makeCtx(cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  const request = new Request('http://localhost/api/test', { headers });
  return { request, url: new URL(request.url) } as never;
}

describe('sessionCookieRenewal middleware', () => {
  const middleware = sessionCookieRenewal();

  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockGetSessionIdFromRequest.mockReset();
    mockGetSessionFromRequest.mockReset();
    mockGetGrantKeyFromRequest.mockReset();
    mockBuildSessionCookie.mockReset();
    mockBuildSessionCookie.mockImplementation((value: string, maxAge: number) =>
      `adieuu_session=${value}; Max-Age=${maxAge}; Path=/; HttpOnly`
    );
  });

  test('renews session cookie on 2xx when session is valid', async () => {
    mockGetSessionIdFromRequest.mockReturnValue('sess-abc');
    mockGetSessionFromRequest.mockResolvedValue(
      makeAccountSession(Date.now() + 3600_000)
    );

    const res = await middleware(makeCtx('adieuu_session=sess-abc'), () =>
      Promise.resolve(new Response('ok', { status: 200 }))
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toContain('adieuu_session=sess-abc');
    expect(mockBuildSessionCookie).toHaveBeenCalledWith('sess-abc', expect.any(Number));
  });

  test('preserves grant-key suffix in renewed cookie', async () => {
    mockGetSessionIdFromRequest.mockReturnValue('sess-abc');
    mockGetGrantKeyFromRequest.mockReturnValue('grantKeyBase64==');
    mockGetSessionFromRequest.mockResolvedValue(
      makeAccountSession(Date.now() + 3600_000)
    );

    await middleware(makeCtx('adieuu_session=sess-abc.grantKeyBase64=='), () =>
      Promise.resolve(new Response('ok', { status: 200 }))
    );

    expect(mockBuildSessionCookie).toHaveBeenCalledWith(
      'sess-abc.grantKeyBase64==',
      expect.any(Number)
    );
  });

  test('does not renew when response already sets session cookie', async () => {
    mockGetSessionIdFromRequest.mockReturnValue('sess-abc');
    mockGetSessionFromRequest.mockResolvedValue(
      makeAccountSession(Date.now() + 3600_000)
    );

    const res = await middleware(makeCtx('adieuu_session=sess-abc'), () =>
      Promise.resolve(
        new Response('ok', {
          status: 200,
          headers: { 'Set-Cookie': 'adieuu_session=new-session; Path=/' },
        })
      )
    );

    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain('new-session');
  });

  test('skips renewal on 4xx responses', async () => {
    mockGetSessionIdFromRequest.mockReturnValue('sess-abc');
    mockGetSessionFromRequest.mockResolvedValue(
      makeAccountSession(Date.now() + 3600_000)
    );

    const res = await middleware(makeCtx('adieuu_session=sess-abc'), () =>
      Promise.resolve(new Response('nope', { status: 401 }))
    );

    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  test('skips renewal when session id is absent', async () => {
    mockGetSessionIdFromRequest.mockReturnValue(null);

    const res = await middleware(makeCtx(), () =>
      Promise.resolve(new Response('ok', { status: 200 }))
    );

    expect(res.headers.get('Set-Cookie')).toBeNull();
    expect(mockGetSessionFromRequest).not.toHaveBeenCalled();
  });

  test('skips renewal when session has no expiresAt', async () => {
    mockGetSessionIdFromRequest.mockReturnValue('sess-abc');
    mockGetSessionFromRequest.mockResolvedValue(null);

    const res = await middleware(makeCtx('adieuu_session=sess-abc'), () =>
      Promise.resolve(new Response('ok', { status: 200 }))
    );

    expect(res.headers.get('Set-Cookie')).toBeNull();
  });
});
