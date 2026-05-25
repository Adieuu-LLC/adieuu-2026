import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { securityHeaders } from './security-headers';

function makeCtx() {
  const request = new Request('http://localhost');
  return { request, url: new URL(request.url) } as never;
}

describe('securityHeaders middleware', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('applies standard security headers on success responses', async () => {
    const middleware = securityHeaders();
    const res = await middleware(makeCtx(), () =>
      Promise.resolve(new Response('ok', { status: 200 }))
    );

    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Permissions-Policy')).toBe('geolocation=(), microphone=(), camera=()');
    expect(res.headers.get('Content-Security-Policy')).toBe(
      "default-src 'self'; frame-ancestors 'none'"
    );
  });

  test('includes HSTS in production', async () => {
    process.env.NODE_ENV = 'production';
    const middleware = securityHeaders();

    const res = await middleware(makeCtx(), () =>
      Promise.resolve(new Response('ok', { status: 200 }))
    );

    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains; preload'
    );
  });

  test('omits HSTS outside production', async () => {
    process.env.NODE_ENV = 'test';
    const middleware = securityHeaders();

    const res = await middleware(makeCtx(), () =>
      Promise.resolve(new Response('ok', { status: 200 }))
    );

    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });

  test('preserves response status and body', async () => {
    const middleware = securityHeaders();
    const res = await middleware(makeCtx(), () =>
      Promise.resolve(new Response('payload', { status: 418, statusText: "I'm a teapot" }))
    );

    expect(res.status).toBe(418);
    expect(await res.text()).toBe('payload');
  });
});
