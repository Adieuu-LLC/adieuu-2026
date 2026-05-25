/**
 * CSRF token generation and cookie helpers (session-bound double-submit).
 *
 * @module services/csrf
 */

import { createHmac } from 'crypto';
import { config } from '../config';
import { constantTimeCompare } from '../utils/crypto';

export const CSRF_COOKIE_NAME = 'adieuu_csrf';

export const CSRF_HEADER_NAME = 'X-CSRF-Token';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Keep in sync with `STRIPE_WEBHOOK_PATH` in `router/resolve-body-limit.ts`. */
const STRIPE_WEBHOOK_PATH = '/api/webhooks/stripe';

/** Paths that never require CSRF validation (non-cookie or pre-session auth). */
export const CSRF_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  STRIPE_WEBHOOK_PATH,
  '/api/uploads/process-callback',
  '/api/age-verification/webhook',
  '/api/auth/request',
  '/api/auth/verify',
  '/api/auth/mfa/totp',
  '/api/auth/mfa/webauthn',
]);

/**
 * Generates a session-bound CSRF token (base64url HMAC-SHA256).
 */
export function generateCsrfToken(sessionId: string): string {
  return createHmac('sha256', config.security.csrfSecret)
    .update(sessionId)
    .digest('base64url');
}

/**
 * Validates a CSRF token against the expected value for a session.
 */
export function validateCsrfToken(sessionId: string, token: string): boolean {
  if (!sessionId || !token) return false;
  const expected = generateCsrfToken(sessionId);
  return constantTimeCompare(expected, token);
}

/**
 * Builds a non-HttpOnly CSRF cookie readable by client JS for double-submit.
 */
export function buildCsrfCookie(sessionId: string, maxAge: number): string {
  const token = generateCsrfToken(sessionId);
  const isProduction = config.env === 'production';
  const parts = [
    `${CSRF_COOKIE_NAME}=${token}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'SameSite=Lax',
  ];

  if (isProduction) {
    parts.push('Secure');
  }

  if (config.cookie.domain) {
    parts.push(`Domain=${config.cookie.domain}`);
  }

  return parts.join('; ');
}

/**
 * Clears the CSRF cookie.
 */
export function buildCsrfClearCookie(): string {
  const isProduction = config.env === 'production';
  const parts = [
    `${CSRF_COOKIE_NAME}=`,
    'Max-Age=0',
    'Path=/',
    'SameSite=Lax',
  ];

  if (isProduction) {
    parts.push('Secure');
  }

  if (config.cookie.domain) {
    parts.push(`Domain=${config.cookie.domain}`);
  }

  return parts.join('; ');
}

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

export function isCsrfExemptPath(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.has(pathname);
}

/**
 * Parses a named cookie from the Cookie header.
 */
export function getCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx);
    const value = trimmed.substring(eqIdx + 1);
    if (key === name && value) return value;
  }

  return null;
}

export function getCsrfTokenFromRequest(request: Request): string | null {
  const header = request.headers.get(CSRF_HEADER_NAME);
  if (header) return header;
  return getCookieValue(request, CSRF_COOKIE_NAME);
}

export function appendSetCookies(headers: Headers, cookies: string[]): void {
  for (const cookie of cookies) {
    headers.append('Set-Cookie', cookie);
  }
}
