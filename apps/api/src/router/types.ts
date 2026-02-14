/**
 * Router type definitions
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export interface RouteContext {
  /** The original request */
  request: Request;
  /** URL object for easy parsing */
  url: URL;
  /** Route parameters (e.g., { id: '123' } for /users/:id) */
  params: Record<string, string>;
  /** Query string parameters */
  query: URLSearchParams;
  /** Request ID for tracing */
  requestId: string;
  /** Parsed JSON body (if applicable) */
  body?: unknown;
}

export type RouteHandler = (ctx: RouteContext) => Response | Promise<Response>;

export type Middleware = (
  ctx: RouteContext,
  next: () => Promise<Response>
) => Response | Promise<Response>;

export interface Route {
  method: HttpMethod;
  pattern: string;
  regex: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export interface RouterOptions {
  /** Base path prefix for all routes (e.g., '/api') */
  prefix?: string;
}
