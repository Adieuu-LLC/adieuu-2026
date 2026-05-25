import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { RouteContext } from '../router/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockGetSessionId = mock(() => null as string | null) as AnyMock;

mock.module('../config', () => ({
  config: {
    env: 'test',
    cors: { origins: 'http://localhost:5173' },
    csrf: { enforcement: 'enforce' as 'off' | 'warn' | 'enforce' },
    security: { csrfSecret: 'test-csrf-secret' },
    cookie: { domain: '' },
  },
}));

mock.module('../services/session.service', () => ({
  getSessionIdFromRequest: (request: Request) => mockGetSessionId(request),
}));

mock.module('../utils/adieuuLogger', () => ({
  default: { warn: mock(() => {}), info: mock(() => {}), error: mock(() => {}) },
}));

const { generateCsrfToken } = await import('../services/csrf.service');
const { csrf } = await import('./csrf');

function makeCtx(
  method: string,
  path: string,
  options?: { cookies?: string; headers?: Record<string, string> },
): RouteContext {
  const headers: Record<string, string> = { ...(options?.headers ?? {}) };
  if (options?.cookies) {
    headers.Cookie = options.cookies;
  }
  const request = new Request(`http://localhost${path}`, { method, headers });
  return {
    request,
    url: new URL(request.url),
    params: {},
    query: new URLSearchParams(),
    requestId: 'req-test',
    locale: 'en',
    errors: {
      forbidden: () => new Response(JSON.stringify({ success: false }), { status: 403 }),
    },
  } as RouteContext;
}

function validCsrfPair(sessionId: string): { cookie: string; header: string } {
  const token = generateCsrfToken(sessionId);
  return {
    cookie: `adieuu_session=${sessionId}; adieuu_csrf=${token}`,
    header: token,
  };
}

describe('csrf middleware', () => {
  beforeEach(() => {
    mockGetSessionId.mockReset();
    mockGetSessionId.mockImplementation(() => 'sess-abc');
  });

  test('skips GET requests', async () => {
    const middleware = csrf();
    const res = await middleware(makeCtx('GET', '/api/users/me'), () =>
      Promise.resolve(new Response('ok', { status: 200 })),
    );
    expect(res.status).toBe(200);
  });

  test('skips exempt paths', async () => {
    const middleware = csrf();
    const res = await middleware(makeCtx('POST', '/api/auth/verify'), () =>
      Promise.resolve(new Response('ok', { status: 200 })),
    );
    expect(res.status).toBe(200);
  });

  test('skips when no session cookie', async () => {
    mockGetSessionId.mockImplementation(() => null);
    const middleware = csrf();
    const res = await middleware(makeCtx('POST', '/api/users/me'), () =>
      Promise.resolve(new Response('ok', { status: 200 })),
    );
    expect(res.status).toBe(200);
  });

  test('allows valid double-submit token', async () => {
    const pair = validCsrfPair('sess-abc');
    const middleware = csrf();
    const res = await middleware(
      makeCtx('POST', '/api/users/me', {
        cookies: pair.cookie,
        headers: { 'X-CSRF-Token': pair.header },
      }),
      () => Promise.resolve(new Response('ok', { status: 200 })),
    );
    expect(res.status).toBe(200);
  });

  test('returns 403 on token mismatch in enforce mode', async () => {
    const middleware = csrf();
    const res = await middleware(
      makeCtx('POST', '/api/users/me', {
        cookies: 'adieuu_session=sess-abc; adieuu_csrf=bad',
        headers: { 'X-CSRF-Token': 'bad' },
      }),
      () => Promise.resolve(new Response('ok', { status: 200 })),
    );
    expect(res.status).toBe(403);
  });

  test('returns 403 when Origin is not allowlisted', async () => {
    const pair = validCsrfPair('sess-abc');
    const middleware = csrf();
    const res = await middleware(
      makeCtx('POST', '/api/users/me', {
        cookies: pair.cookie,
        headers: {
          'X-CSRF-Token': pair.header,
          Origin: 'https://evil.example.com',
        },
      }),
      () => Promise.resolve(new Response('ok', { status: 200 })),
    );
    expect(res.status).toBe(403);
  });
});

describe('csrf middleware warn mode', () => {
  beforeEach(async () => {
    const configMod = await import('../config');
    (configMod.config as { csrf: { enforcement: string } }).csrf.enforcement = 'warn';
    mockGetSessionId.mockImplementation(() => 'sess-abc');
  });

  afterAll(async () => {
    const configMod = await import('../config');
    (configMod.config as { csrf: { enforcement: string } }).csrf.enforcement = 'enforce';
  });

  test('allows request on mismatch in warn mode', async () => {
    const middleware = csrf();
    const res = await middleware(
      makeCtx('POST', '/api/users/me', {
        cookies: 'adieuu_session=sess-abc',
      }),
      () => Promise.resolve(new Response('ok', { status: 200 })),
    );
    expect(res.status).toBe(200);
  });
});
