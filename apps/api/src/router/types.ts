/**
 * Router type definitions
 */

import type { Locale } from '../i18n';
import type { IdentityContext } from '../middleware/identity-session';

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
  conflict: () => Response;
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
  /** 401 SESSION_EXPIRED + clears adieuu_session (stale cookie). */
  sessionExpiredWithClearCookie: () => Response;
  payloadTooLarge: () => Response;
  /**
   * Contact (email/phone) already owned by another account.
   * Only use AFTER OTP verification proves ownership - safe to reveal.
   */
  alreadyOwned: () => Response;
  /** Sign-in not allowed (e.g. auth allowlist). */
  signInRestricted: () => Response;
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
  /** Raw request body text (available when body was parsed from JSON) */
  rawBody?: string;
  /** Detected locale from Accept-Language header */
  locale: Locale;
  /** Localized error response factories */
  errors: ContextErrors;
  /**
   * Resolved identity session data, populated by `enrichIdentitySession`
   * middleware. `null` when no identity session is present or resolution
   * failed; `undefined` only before the middleware runs.
   */
  identitySession?: IdentityContext | null;
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
  /**
   * Maximum request body in bytes for authenticated or allowlisted unauthenticated
   * routes (default: 250 KiB from `constants/http`).
   */
  maxBodySize?: number;
  /**
   * Stricter cap when there is no resolvable session (default: 16 KiB from
   * `constants/http`). Capped in config to not exceed `maxBodySize`.
   */
  anonymousMaxBodySize?: number;
}
