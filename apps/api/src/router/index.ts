/**
 * Simple router for Bun.serve
 */

import type { HttpMethod, Route, RouteHandler, RouteContext, Middleware, RouterOptions } from './types';
import { errors } from '../utils/response';
import elog from '../utils/adieuuLogger';

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

export class Router {
  private routes: Route[] = [];
  private middlewares: Middleware[] = [];
  private prefix: string;

  constructor(options: RouterOptions = {}) {
    this.prefix = options.prefix ?? '';
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
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': process.env.CORS_ORIGIN ?? 'http://localhost:3000',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, X-Request-ID',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': '86400',
          },
        });
      }

      // Find matching route
      const match = this.findRoute(method, path);

      if (!match) {
        return errors.notFound(`No route found for ${method} ${path}`);
      }

      // Parse body for POST/PUT/PATCH
      let body: unknown;
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        const contentType = request.headers.get('Content-Type') ?? '';
        if (contentType.includes('application/json')) {
          try {
            body = await request.json();
          } catch {
            return errors.badRequest('Invalid JSON body');
          }
        }
      }

      // Build context
      const ctx: RouteContext = {
        request,
        url,
        params: match.params,
        query: url.searchParams,
        requestId,
        body,
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
        return errors.internal();
      }
    };
  }
}

export * from './types';
