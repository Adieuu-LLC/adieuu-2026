/**
 * Router type definitions
 */

import type { Locale } from '../i18n';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

/**
 * Localized error response factories available on the route context.
 * These automatically use the request's locale.
 */
export interface ContextErrors {
  badRequest: () => Response;
  unauthorized: () => Response;
  forbidden: () => Response;
  notFound: () => Response;
  methodNotAllowed: () => Response;
  rateLimited: () => Response;
  internal: () => Response;
  validationFailed: () => Response;
  invalidEmail: () => Response;
  invalidPhone: () => Response;
  invalidOtp: () => Response;
  otpExpired: () => Response;
  tooManyAttempts: () => Response;
  accountLocked: () => Response;
  sessionExpired: () => Response;
  payloadTooLarge: () => Response;
}

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
  /** Detected locale from Accept-Language header */
  locale: Locale;
  /** Localized error response factories */
  errors: ContextErrors;
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
  /** Maximum request body size in bytes (default: 1MB) */
  maxBodySize?: number;
}
