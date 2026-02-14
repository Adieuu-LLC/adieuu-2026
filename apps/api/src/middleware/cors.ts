/**
 * CORS Middleware
 * 
 * Adds Cross-Origin Resource Sharing (CORS) headers to responses, enabling
 * the API to be called from web applications hosted on different domains.
 * 
 * Features:
 * - Configurable allowed origin
 * - Credentials support (cookies, authorization headers)
 * - Works in conjunction with router's OPTIONS handling
 * 
 * Note: The router handles OPTIONS preflight requests separately. This
 * middleware adds CORS headers to actual request responses.
 * 
 * @module middleware/cors
 * 
 * @example
 * ```typescript
 * import { cors } from './middleware';
 * 
 * const app = new Router();
 * 
 * // Use default settings (origin from CORS_ORIGIN env var)
 * app.use(cors());
 * 
 * // Or configure explicitly
 * app.use(cors({
 *   origin: 'https://myapp.com',
 *   credentials: true,
 * }));
 * ```
 */

import type { Middleware } from '../router';

/**
 * CORS middleware configuration options.
 */
export interface CorsOptions {
  /**
   * Allowed origin for CORS requests.
   * 
   * Can be a specific domain or '*' for any origin (not recommended with credentials).
   * 
   * @default process.env.CORS_ORIGIN || 'http://localhost:3000'
   * 
   * @example
   * ```typescript
   * // Single origin
   * cors({ origin: 'https://myapp.com' })
   * 
   * // Any origin (use with caution)
   * cors({ origin: '*', credentials: false })
   * ```
   */
  origin?: string;

  /**
   * Whether to allow credentials (cookies, authorization headers).
   * 
   * When true, browsers will include cookies and auth headers in cross-origin
   * requests. Cannot be used with `origin: '*'`.
   * 
   * @default true
   * 
   * @example
   * ```typescript
   * // Allow credentials (for session cookies)
   * cors({ credentials: true })
   * 
   * // Public API without credentials
   * cors({ credentials: false })
   * ```
   */
  credentials?: boolean;
}

/**
 * Creates a CORS middleware.
 * 
 * Returns a middleware function that adds CORS headers to all responses:
 * - `Access-Control-Allow-Origin` - The allowed origin
 * - `Access-Control-Allow-Credentials` - Whether credentials are allowed
 * 
 * Note: For full CORS support, the router also handles OPTIONS preflight
 * requests with additional headers like `Access-Control-Allow-Methods` and
 * `Access-Control-Allow-Headers`.
 * 
 * @param options - CORS configuration options
 * @returns Middleware function that applies CORS headers
 * 
 * @example
 * ```typescript
 * import { Router } from './router';
 * import { cors } from './middleware';
 * 
 * const app = new Router();
 * 
 * // Default configuration (uses CORS_ORIGIN env var)
 * app.use(cors());
 * 
 * // Custom configuration
 * app.use(cors({
 *   origin: 'https://app.example.com',
 *   credentials: true,
 * }));
 * 
 * // Response headers:
 * // Access-Control-Allow-Origin: https://app.example.com
 * // Access-Control-Allow-Credentials: true
 * ```
 * 
 * @example
 * ```typescript
 * // Development vs Production
 * const corsOptions = {
 *   origin: process.env.NODE_ENV === 'production'
 *     ? 'https://myapp.com'
 *     : 'http://localhost:3000',
 *   credentials: true,
 * };
 * 
 * app.use(cors(corsOptions));
 * ```
 */
export function cors(options: CorsOptions = {}): Middleware {
  const origin = options.origin ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  const credentials = options.credentials ?? true;

  return async (_ctx, next) => {
    const response = await next();
    const headers = new Headers(response.headers);

    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', String(credentials));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
