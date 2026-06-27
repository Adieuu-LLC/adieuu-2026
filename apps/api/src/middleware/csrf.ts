/**
 * CSRF validation middleware for cookie-authenticated mutating requests.
 *
 * Uses session-bound double-submit: `adieuu_csrf` cookie must match
 * `X-CSRF-Token` header. Enforcement mode is controlled by `CSRF_ENFORCEMENT`.
 *
 * @module middleware/csrf
 */

import type { Middleware } from '../router/types';
import { config } from '../config';
import {
  getCookieValue,
  CSRF_COOKIE_NAME,
  isCsrfExemptPath,
  isMutatingMethod,
  validateCsrfToken,
} from '../services/csrf.service';
import { getSessionIdFromRequest } from '../services/session.service';
import {
  parseCorsOriginsList,
  resolveCorsAllowedOrigin,
} from '../utils/corsOrigins';
import elog from '../utils/adieuuLogger';
import { sanitizePathForLog } from '../utils/sanitize';

export type CsrfFailureReason =
  | 'missing_token'
  | 'token_mismatch'
  | 'origin_not_allowed';

function originAllowed(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true;

  const allowed = parseCorsOriginsList(config.cors.origins);
  return resolveCorsAllowedOrigin(origin, allowed) !== null;
}

function logCsrfFailure(
  ctx: { request: Request; requestId: string; url: URL },
  reason: CsrfFailureReason,
): void {
  elog.warn('CSRF validation failed', {
    reason,
    requestId: ctx.requestId,
    path: sanitizePathForLog(ctx.url.pathname),
    method: ctx.request.method,
    enforcement: config.csrf.enforcement,
  });
}

export function csrf(): Middleware {
  return async (ctx, next) => {
    if (config.csrf.enforcement === 'off') {
      return next();
    }

    const method = ctx.request.method.toUpperCase();
    const pathname = ctx.url.pathname;

    if (!isMutatingMethod(method)) {
      return next();
    }

    if (isCsrfExemptPath(pathname)) {
      return next();
    }

    const sessionId = getSessionIdFromRequest(ctx.request);
    if (!sessionId) {
      return next();
    }

    if (!originAllowed(ctx.request)) {
      logCsrfFailure(ctx, 'origin_not_allowed');
      if (config.csrf.enforcement === 'enforce') {
        return ctx.errors.forbidden();
      }
      return next();
    }

    const headerToken = ctx.request.headers.get('X-CSRF-Token');
    const cookieToken = getCookieValue(ctx.request, CSRF_COOKIE_NAME);

    if (!headerToken || !cookieToken) {
      logCsrfFailure(ctx, 'missing_token');
      if (config.csrf.enforcement === 'enforce') {
        return ctx.errors.forbidden();
      }
      return next();
    }

    if (headerToken !== cookieToken || !validateCsrfToken(sessionId, headerToken)) {
      logCsrfFailure(ctx, 'token_mismatch');
      if (config.csrf.enforcement === 'enforce') {
        return ctx.errors.forbidden();
      }
      return next();
    }

    return next();
  };
}
