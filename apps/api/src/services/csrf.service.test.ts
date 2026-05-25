import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

mock.module('../config', () => ({
  config: {
    env: 'test',
    security: { csrfSecret: 'test-csrf-secret' },
    cookie: { domain: '' },
  },
}));

const {
  generateCsrfToken,
  validateCsrfToken,
  buildCsrfCookie,
  buildCsrfClearCookie,
  CSRF_COOKIE_NAME,
  CSRF_EXEMPT_PATHS,
  getCookieValue,
  getCsrfTokenFromRequest,
  isCsrfExemptPath,
  isMutatingMethod,
} = await import('./csrf.service');

describe('csrf.service', () => {
  test('generateCsrfToken is deterministic for a session', () => {
    const a = generateCsrfToken('sess-abc');
    const b = generateCsrfToken('sess-abc');
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });

  test('validateCsrfToken accepts matching token', () => {
    const sessionId = 'sess-xyz';
    const token = generateCsrfToken(sessionId);
    expect(validateCsrfToken(sessionId, token)).toBe(true);
  });

  test('validateCsrfToken rejects wrong token', () => {
    expect(validateCsrfToken('sess-xyz', 'wrong-token')).toBe(false);
    expect(validateCsrfToken('', generateCsrfToken('sess'))).toBe(false);
  });

  test('buildCsrfCookie includes token and is not HttpOnly', () => {
    const cookie = buildCsrfCookie('sess-1', 3600);
    expect(cookie).toContain(`${CSRF_COOKIE_NAME}=`);
    expect(cookie).toContain('Max-Age=3600');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie.toLowerCase()).not.toContain('httponly');
  });

  test('buildCsrfClearCookie clears cookie', () => {
    const cookie = buildCsrfClearCookie();
    expect(cookie).toContain(`${CSRF_COOKIE_NAME}=`);
    expect(cookie).toContain('Max-Age=0');
  });

  test('isMutatingMethod identifies state-changing verbs', () => {
    expect(isMutatingMethod('POST')).toBe(true);
    expect(isMutatingMethod('get')).toBe(false);
  });

  test('isCsrfExemptPath includes webhook and pre-session auth', () => {
    expect(isCsrfExemptPath('/api/webhooks/stripe')).toBe(true);
    expect(isCsrfExemptPath('/api/auth/verify')).toBe(true);
    expect(isCsrfExemptPath('/api/users/me')).toBe(false);
  });

  test('getCookieValue parses named cookies', () => {
    const req = new Request('http://localhost', {
      headers: { Cookie: 'foo=1; adieuu_csrf=tok; bar=2' },
    });
    expect(getCookieValue(req, 'adieuu_csrf')).toBe('tok');
    expect(getCookieValue(req, 'missing')).toBeNull();
  });

  test('getCsrfTokenFromRequest prefers header over cookie', () => {
    const req = new Request('http://localhost', {
      headers: {
        Cookie: 'adieuu_csrf=cookie-tok',
        'X-CSRF-Token': 'header-tok',
      },
    });
    expect(getCsrfTokenFromRequest(req)).toBe('header-tok');
  });
});
