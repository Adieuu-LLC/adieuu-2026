/**
 * CORS Middleware
 * 
 * Adds Cross-Origin Resource Sharing (CORS) headers to responses, enabling
 * the API to be called from web applications hosted on different domains.
 * 
 * Features:
 * - Multiple allowed origins (comma-separated via CORS_ORIGINS env var)
 * - Wildcard '*' support for development
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
 * // Use default settings (origins from CORS_ORIGINS env var)
 * app.use(cors());
 * 
 * // Or configure explicitly
 * app.use(cors({
 *   origins: ['https://myapp.com', 'https://desktop.myapp.com'],
 *   credentials: true,
 * }));
 * ```
 */

import type { Middleware, RouteContext } from '../router';
import { config } from '../config';

/**
 * CORS middleware configuration options.
 */
export interface CorsOptions {
  /**
   * Allowed origins for CORS requests.
   * 
   * Can be an array of specific domains, a comma-separated string,
   * or '*' for any origin (not recommended with credentials).
   * 
   * @default process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173'
   * 
   * @example
   * ```typescript
   * // Single origin
   * cors({ origins: ['https://myapp.com'] })
   * 
   * // Multiple origins
   * cors({ origins: ['https://myapp.com', 'https://admin.myapp.com'] })
   * 
   * // Comma-separated string
   * cors({ origins: 'https://myapp.com,https://admin.myapp.com' })
   * 
   * // Any origin (use with caution, not with credentials)
   * cors({ origins: '*', credentials: false })
   * ```
   */
  origins?: string | string[];

  /**
   * Whether to allow credentials (cookies, authorization headers).
   * 
   * When true, browsers will include cookies and auth headers in cross-origin
   * requests. Cannot be used with `origins: '*'` (will be ignored).
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
 * Parses origins from config or options.
 * 
 * @param originsInput - String (comma-separated) or array of origins
 * @returns Array of allowed origin strings
 */
function parseOrigins(originsInput: string | string[]): string[] {
  if (Array.isArray(originsInput)) {
    return originsInput.map((o) => o.trim()).filter(Boolean);
  }
  
  // Handle wildcard
  if (originsInput === '*') {
    return ['*'];
  }
  
  // Split comma-separated string
  return originsInput
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Checks if the request origin is allowed.
 * 
 * @param requestOrigin - The Origin header from the request
 * @param allowedOrigins - Array of allowed origins
 * @returns The origin to use in the response header, or null if not allowed
 */
function getAllowedOrigin(requestOrigin: string | null, allowedOrigins: string[]): string | null {
  // Wildcard allows any origin
  if (allowedOrigins.includes('*')) {
    return requestOrigin ?? '*';
  }
  
  // No origin header (same-origin request or non-browser client)
  if (!requestOrigin) {
    return allowedOrigins[0] ?? null;
  }
  
  // Check if request origin is in allowed list
  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  
  return null;
}

/**
 * Creates a CORS middleware.
 * 
 * Returns a middleware function that adds CORS headers to all responses:
 * - `Access-Control-Allow-Origin` - The allowed origin (dynamic based on request)
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
 * // Default configuration (uses CORS_ORIGINS env var)
 * app.use(cors());
 * 
 * // Custom configuration
 * app.use(cors({
 *   origins: ['https://app.example.com', 'https://admin.example.com'],
 *   credentials: true,
 * }));
 * ```
 */
export function cors(options: CorsOptions = {}): Middleware {
  const originsInput = options.origins ?? config.cors.origins;
  const allowedOrigins = parseOrigins(originsInput);
  const credentials = options.credentials ?? config.cors.credentials;

  return async (ctx: RouteContext, next) => {
    const response = await next();
    const headers = new Headers(response.headers);

    // Get the request origin
    const requestOrigin = ctx.request.headers.get('Origin');
    
    // Determine which origin to allow
    const allowedOrigin = getAllowedOrigin(requestOrigin, allowedOrigins);
    
    if (allowedOrigin) {
      headers.set('Access-Control-Allow-Origin', allowedOrigin);
      
      // Only set credentials header if not using wildcard
      if (credentials && allowedOrigin !== '*') {
        headers.set('Access-Control-Allow-Credentials', 'true');
      }
      
      // Vary on Origin to ensure proper caching
      if (allowedOrigins.length > 1 || allowedOrigins.includes('*')) {
        headers.append('Vary', 'Origin');
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
