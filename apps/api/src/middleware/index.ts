/**
 * Middleware Module Exports
 * 
 * Central export point for all API middleware. Middleware functions wrap
 * route handlers to add cross-cutting concerns like security headers,
 * request tracing, and CORS support.
 * 
 * Middleware execution order matters - they are executed in the order
 * they are registered with `app.use()`.
 * 
 * Recommended order:
 * 1. `requestId()` - Add request ID early for tracing
 * 2. `securityHeaders()` - Apply security headers to all responses
 * 3. `cors()` - Add CORS headers for cross-origin requests
 * 
 * @module middleware
 * 
 * @example
 * ```typescript
 * import { Router } from './router';
 * import { requestId, securityHeaders, cors } from './middleware';
 * 
 * const app = new Router();
 * 
 * // Register middleware in recommended order
 * app.use(requestId());
 * app.use(securityHeaders());
 * app.use(cors());
 * 
 * // Register routes
 * app.get('/api/health', healthHandler);
 * app.get('/api/users/:id', getUserHandler);
 * 
 * // All routes now have:
 * // - X-Request-ID header for tracing
 * // - Security headers (X-Frame-Options, CSP, etc.)
 * // - CORS headers for cross-origin access
 * ```
 */

/**
 * Security headers middleware.
 * 
 * Applies security-related HTTP headers to protect against common
 * web vulnerabilities like XSS, clickjacking, and MIME sniffing.
 * 
 * @see {@link module:middleware/security-headers}
 */
export { securityHeaders } from './security-headers';

/**
 * Request ID middleware.
 * 
 * Adds X-Request-ID header to responses for distributed tracing
 * and debugging.
 * 
 * @see {@link module:middleware/request-id}
 */
export { requestId } from './request-id';

/**
 * CORS middleware.
 * 
 * Adds Cross-Origin Resource Sharing headers to enable API access
 * from web applications on different domains.
 * 
 * @see {@link module:middleware/cors}
 */
export { cors } from './cors';

/**
 * Sliding session cookie renewal on successful API responses.
 *
 * @see {@link module:middleware/session-cookie-renewal}
 */
export { sessionCookieRenewal } from './session-cookie-renewal';

/**
 * Subscription enforcement for account sessions on protected routes.
 *
 * @see {@link module:middleware/require-subscription}
 */
export { requireActiveSubscription } from './require-subscription';

/**
 * Identity session enrichment and enforcement middleware.
 *
 * @see {@link module:middleware/identity-session}
 */
export { enrichIdentitySession, requireIdentitySession } from './identity-session';

/**
 * Re-export types for external use.
 */
export type { CorsOptions } from './cors';
export type { IdentityContext } from './identity-session';
