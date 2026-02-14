/**
 * Security headers middleware
 * Applies security-related HTTP headers to all responses (similar to Helmet)
 */

import type { Middleware } from '../router';

const SECURITY_HEADERS: Record<string, string> = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking
  'X-Frame-Options': 'DENY',

  // XSS protection (legacy browsers)
  'X-XSS-Protection': '1; mode=block',

  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Permissions policy - disable unnecessary features
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',

  // Content Security Policy
  // TODO: Adjust CSP based on actual frontend requirements
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
};

// HSTS header - only in production
const HSTS_HEADER = 'max-age=31536000; includeSubDomains; preload';

/**
 * Applies security headers to the response
 */
function applySecurityHeaders(response: Response, isProduction: boolean): Response {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  // Only set HSTS in production (requires HTTPS)
  if (isProduction) {
    headers.set('Strict-Transport-Security', HSTS_HEADER);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Security headers middleware
 */
export function securityHeaders(): Middleware {
  const isProduction = process.env.NODE_ENV === 'production';

  return async (_ctx, next) => {
    const response = await next();
    return applySecurityHeaders(response, isProduction);
  };
}
