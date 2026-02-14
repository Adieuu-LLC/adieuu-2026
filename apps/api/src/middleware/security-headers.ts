/**
 * Security Headers Middleware
 * 
 * Applies security-related HTTP headers to all responses, providing protection
 * against common web vulnerabilities. Similar to the Helmet library but
 * implemented natively for Bun.serve.
 * 
 * Headers applied:
 * - `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
 * - `X-Frame-Options: DENY` - Prevents clickjacking attacks
 * - `X-XSS-Protection: 1; mode=block` - XSS protection for legacy browsers
 * - `Referrer-Policy: strict-origin-when-cross-origin` - Controls referrer information
 * - `Permissions-Policy` - Disables unnecessary browser features
 * - `Content-Security-Policy` - Restricts resource loading
 * - `Strict-Transport-Security` - Forces HTTPS (production only)
 * 
 * @module middleware/security-headers
 * 
 * @example
 * ```typescript
 * import { securityHeaders } from './middleware';
 * 
 * const app = new Router();
 * app.use(securityHeaders());
 * 
 * // All responses will now include security headers
 * ```
 */

import type { Middleware } from '../router';

/**
 * Security headers applied to all responses.
 * 
 * These headers protect against common web vulnerabilities:
 * 
 * | Header | Purpose |
 * |--------|---------|
 * | X-Content-Type-Options | Prevents MIME type sniffing attacks |
 * | X-Frame-Options | Prevents clickjacking by disabling framing |
 * | X-XSS-Protection | Enables browser XSS filters (legacy browsers) |
 * | Referrer-Policy | Controls how much referrer info is sent |
 * | Permissions-Policy | Disables access to sensitive browser APIs |
 * | Content-Security-Policy | Restricts which resources can be loaded |
 * 
 * @internal
 */
const SECURITY_HEADERS: Record<string, string> = {
  // Prevent MIME type sniffing - forces browser to use declared content type
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking - page cannot be displayed in a frame
  'X-Frame-Options': 'DENY',

  // XSS protection for legacy browsers (modern browsers use CSP)
  'X-XSS-Protection': '1; mode=block',

  // Referrer policy - send full URL only for same-origin, origin only for cross-origin
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Permissions policy - disable unnecessary browser features
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',

  // Content Security Policy - restrict resource loading
  // TODO: Adjust CSP based on actual frontend requirements
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
};

/**
 * HTTP Strict Transport Security (HSTS) header value.
 * 
 * Forces HTTPS for 1 year, includes subdomains, and opts into browser preload lists.
 * Only applied in production since local development uses HTTP.
 * 
 * @internal
 */
const HSTS_HEADER = 'max-age=31536000; includeSubDomains; preload';

/**
 * Applies security headers to a response.
 * 
 * Creates a new Response with all security headers added. The original response
 * body, status, and statusText are preserved.
 * 
 * @param response - The original response to add headers to
 * @param isProduction - Whether running in production (enables HSTS)
 * @returns New response with security headers applied
 * 
 * @internal
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
 * Creates a security headers middleware.
 * 
 * Returns a middleware function that adds security headers to all responses.
 * HSTS is only enabled in production environments.
 * 
 * @returns Middleware function that applies security headers
 * 
 * @example
 * ```typescript
 * import { Router } from './router';
 * import { securityHeaders } from './middleware';
 * 
 * const app = new Router();
 * 
 * // Apply security headers to all routes
 * app.use(securityHeaders());
 * 
 * // Register routes
 * app.get('/api/health', healthHandler);
 * 
 * // Headers applied:
 * // X-Content-Type-Options: nosniff
 * // X-Frame-Options: DENY
 * // X-XSS-Protection: 1; mode=block
 * // Referrer-Policy: strict-origin-when-cross-origin
 * // Permissions-Policy: geolocation=(), microphone=(), camera=()
 * // Content-Security-Policy: default-src 'self'; frame-ancestors 'none'
 * // Strict-Transport-Security: max-age=31536000; ... (production only)
 * ```
 */
export function securityHeaders(): Middleware {
  const isProduction = process.env.NODE_ENV === 'production';

  return async (_ctx, next) => {
    const response = await next();
    return applySecurityHeaders(response, isProduction);
  };
}
