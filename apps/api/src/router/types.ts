/**
 * Router type definitions
 */

import type { Locale } from '../i18n';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

/**
 * Localized error response factories available on the route context.
 * These automatically use the request's locale.
 *
 * @remarks
 * **Anti-enumeration:** For OTP/code verification failures, use `verificationFailed()`
 * which returns an identical message and error code for all failure types
 * (invalid, expired, locked, etc.) to prevent enumeration attacks.
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
  /**
   * Generic verification failure - use for ALL OTP/code verification errors.
   * Returns identical response regardless of actual failure reason.
   */
  verificationFailed: () => Response;
  /** @deprecated Use verificationFailed instead */
  invalidOtp: () => Response;
  /** @deprecated Use verificationFailed instead */
  otpExpired: () => Response;
  /** @deprecated Use verificationFailed instead */
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
