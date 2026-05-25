/**
 * CSRF test helpers for route/controller integration tests.
 */

import { generateCsrfToken, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../services/csrf.service';
import { parseSessionCookie } from '../services/session.service';

/**
 * Builds Cookie and X-CSRF-Token headers for a session cookie value.
 *
 * @param sessionCookie - e.g. `adieuu_session=test-session` or just the raw value
 */
export function csrfHeadersForSessionCookie(sessionCookie: string): Record<string, string> {
  const raw = sessionCookie.includes('=')
    ? sessionCookie.split('=').slice(1).join('=')
    : sessionCookie;
  const sessionId = parseSessionCookie(raw).sessionId;
  const token = generateCsrfToken(sessionId);

  const existingCookie = sessionCookie.startsWith('adieuu_session=')
    ? sessionCookie
    : `adieuu_session=${sessionCookie}`;

  return {
    Cookie: `${existingCookie}; ${CSRF_COOKIE_NAME}=${token}`,
    [CSRF_HEADER_NAME]: token,
  };
}

/**
 * Merges CSRF headers into a cookies string used by route test helpers.
 */
export function withCsrfCookieHeader(cookies: string): string {
  const headers = csrfHeadersForSessionCookie(cookies);
  return headers.Cookie ?? cookies;
}
