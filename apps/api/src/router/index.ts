/**
 * Simple router for Bun.serve
 */

import type { HttpMethod, Route, RouteHandler, RouteContext, ContextErrors, Middleware, RouterOptions } from './types';
import { localizedErrors } from '../utils/response';
import { parseAcceptLanguage, type Locale } from '../i18n';
import { config } from '../config';
import elog from '../utils/adieuuLogger';

/**
 * Parses allowed origins from config string.
 */
function parseAllowedOrigins(): string[] {
  const originsStr = config.cors.origins;
  if (originsStr === '*') return ['*'];
  return originsStr.split(',').map((o) => o.trim()).filter(Boolean);
}

/**
 * Gets the Access-Control-Allow-Origin value for a request.
 */
function getCorsOrigin(requestOrigin: string | null): string {
  const allowedOrigins = parseAllowedOrigins();
  
  // Wildcard allows any origin
  if (allowedOrigins.includes('*')) {
    return requestOrigin ?? '*';
  }
  
  // Check if request origin is allowed
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  
  // Default to first allowed origin
  return allowedOrigins[0] ?? 'http://localhost:3000';
}

/**
 * Creates a ContextErrors object bound to a specific locale.
 * This allows routes to call ctx.errors.notFound() without passing locale.
 *
 * @remarks
 * For OTP verification, use `verificationFailed()` which returns identical
 * responses for all failure types to prevent enumeration attacks.
 */
function createContextErrors(locale: Locale): ContextErrors {
  // Anti-enumeration: verificationFailed is used for ALL OTP verification errors
  const verificationFailed = () => localizedErrors.verificationFailed(locale);

  return {
    badRequest: () => localizedErrors.badRequest(locale),
    unauthorized: () => localizedErrors.unauthorized(locale),
    forbidden: () => localizedErrors.forbidden(locale),
    notFound: () => localizedErrors.notFound(locale),
    methodNotAllowed: () => localizedErrors.methodNotAllowed(locale),
    rateLimited: () => localizedErrors.rateLimited(locale),
    internal: () => localizedErrors.internal(locale),
    validationFailed: () => localizedErrors.validationFailed(locale),
    invalidEmail: () => localizedErrors.invalidEmail(locale),
    invalidPhone: () => localizedErrors.invalidPhone(locale),
    // All verification errors return identical responses (anti-enumeration)
    verificationFailed,
    invalidOtp: verificationFailed,
    otpExpired: verificationFailed,
    tooManyAttempts: verificationFailed,
    accountLocked: () => localizedErrors.accountLocked(locale),
    sessionExpired: () => localizedErrors.sessionExpired(locale),
    payloadTooLarge: () => localizedErrors.payloadTooLarge(locale),
    alreadyOwned: () => localizedErrors.alreadyOwned(locale),
  };
}

/**
 * Converts a route pattern like '/users/:id' to a regex and extracts param names
 */
function patternToRegex(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];

  // Escape special regex characters except : and *
  let regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    // Replace :param with named capture group
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });

  // Ensure exact match
  regexStr = `^${regexStr}$`;

  return { regex: new RegExp(regexStr), paramNames };
}

/**
 * Extracts params from a path given a regex and param names
 */
function extractParams(
  path: string,
  regex: RegExp,
  paramNames: string[]
): Record<string, string> | null {
  const match = path.match(regex);
  if (!match) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < paramNames.length; i++) {
    const name = paramNames[i];
    const value = match[i + 1];
    if (name !== undefined && value !== undefined) {
      params[name] = value;
    }
  }
  return params;
}

/**
 * Generates a unique request ID
 */
function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Default maximum request body size in bytes.
 * Set to 1MB which is generous for JSON text content in a chat app.
 * Individual routes can override this if needed.
 */
const DEFAULT_MAX_BODY_SIZE = 1024 * 1024; // 1MB

/**
 * Maximum body size for large content (e.g., message composition with attachments metadata).
 * Use sparingly - most routes should use the default.
 */
export const LARGE_BODY_SIZE = 5 * 1024 * 1024; // 5MB

export class Router {
  private routes: Route[] = [];
  private middlewares: Middleware[] = [];
  private prefix: string;
  private maxBodySize: number;

  constructor(options: RouterOptions = {}) {
    this.prefix = options.prefix ?? '';
    this.maxBodySize = options.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;
  }

  /**
   * Adds a middleware to the router
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Registers a route
   */
  private addRoute(method: HttpMethod, pattern: string, handler: RouteHandler): this {
    const fullPattern = this.prefix + pattern;
    const { regex, paramNames } = patternToRegex(fullPattern);

    this.routes.push({
      method,
      pattern: fullPattern,
      regex,
      paramNames,
      handler,
    });

    return this;
  }

  get(pattern: string, handler: RouteHandler): this {
    return this.addRoute('GET', pattern, handler);
  }

  post(pattern: string, handler: RouteHandler): this {
    return this.addRoute('POST', pattern, handler);
  }

  put(pattern: string, handler: RouteHandler): this {
    return this.addRoute('PUT', pattern, handler);
  }

  patch(pattern: string, handler: RouteHandler): this {
    return this.addRoute('PATCH', pattern, handler);
  }

  delete(pattern: string, handler: RouteHandler): this {
    return this.addRoute('DELETE', pattern, handler);
  }

  /**
   * Merges another router's routes into this one
   */
  merge(subRouter: Router, subPrefix = ''): this {
    for (const route of subRouter.routes) {
      const fullPattern = subPrefix + route.pattern.slice(subRouter.prefix.length);
      const { regex, paramNames } = patternToRegex(this.prefix + fullPattern);

      this.routes.push({
        method: route.method,
        pattern: this.prefix + fullPattern,
        regex,
        paramNames,
        handler: route.handler,
      });
    }
    return this;
  }

  /**
   * Finds a matching route for a request
   */
  private findRoute(method: string, path: string): { route: Route; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;

      const params = extractParams(path, route.regex, route.paramNames);
      if (params !== null) {
        return { route, params };
      }
    }
    return null;
  }

  /**
   * Creates a handler function for Bun.serve
   */
  handler(): (request: Request) => Promise<Response> {
    return async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const method = request.method.toUpperCase() as HttpMethod;
      const path = url.pathname;

      // Generate request ID
      const requestId = request.headers.get('X-Request-ID') ?? generateRequestId();

      // Handle CORS preflight
      if (method === 'OPTIONS') {
        const requestOrigin = request.headers.get('Origin');
        const corsOrigin = getCorsOrigin(requestOrigin);
        const allowCredentials = config.cors.credentials && corsOrigin !== '*';
        
        const headers: Record<string, string> = {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, X-Request-ID, Authorization',
          'Access-Control-Max-Age': '86400',
        };
        
        if (allowCredentials) {
          headers['Access-Control-Allow-Credentials'] = 'true';
        }
        
        // Vary on Origin for proper caching when multiple origins are allowed
        const allowedOrigins = parseAllowedOrigins();
        if (allowedOrigins.length > 1 || allowedOrigins.includes('*')) {
          headers['Vary'] = 'Origin';
        }
        
        return new Response(null, { status: 204, headers });
      }

      // Parse locale from Accept-Language for localized error messages
      const locale = parseAcceptLanguage(request.headers.get('Accept-Language'));
      const contextErrors = createContextErrors(locale);

      // Find matching route
      const match = this.findRoute(method, path);

      if (!match) {
        // Generic message to avoid leaking route structure
        return contextErrors.notFound();
      }

      // Parse body for POST/PUT/PATCH
      let body: unknown;
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        // Check Content-Length to prevent DoS via large payloads
        const contentLength = request.headers.get('Content-Length');
        if (contentLength) {
          const size = parseInt(contentLength, 10);
          if (!isNaN(size) && size > this.maxBodySize) {
            return contextErrors.payloadTooLarge();
          }
        }

        const contentType = request.headers.get('Content-Type') ?? '';
        if (contentType.includes('application/json')) {
          try {
            // Read body with size limit (handles chunked encoding where Content-Length may be absent)
            const text = await request.text();
            if (text.length > this.maxBodySize) {
              return contextErrors.payloadTooLarge();
            }
            body = JSON.parse(text);
          } catch (e) {
            if (e instanceof SyntaxError) {
              return contextErrors.badRequest();
            }
            throw e;
          }
        }
      }

      // Build context with locale and localized error helpers
      const ctx: RouteContext = {
        request,
        url,
        params: match.params,
        query: url.searchParams,
        requestId,
        body,
        locale,
        errors: contextErrors,
      };

      // Execute middleware chain and handler
      const executeHandler = async (): Promise<Response> => {
        return match.route.handler(ctx);
      };

      // Build middleware chain (execute in order, then handler)
      let next = executeHandler;
      for (let i = this.middlewares.length - 1; i >= 0; i--) {
        const middleware = this.middlewares[i];
        if (middleware) {
          const currentNext = next;
          next = async () => middleware(ctx, currentNext);
        }
      }

      try {
        return await next();
      } catch (err) {
        elog.error('Unhandled error', { error: err, path, method, requestId });
        return contextErrors.internal();
      }
    };
  }
}

export * from './types';
