/**
 * Refreshes the `adieuu_session` cookie Max-Age on successful responses when
 * the session is valid, keeping browser cookie lifetime aligned with sliding
 * server-side expiry.
 */

import type { Middleware } from '../router/types';
import {
  buildSessionCookie,
  getSessionFromRequest,
  getSessionIdFromRequest,
} from '../services/session.service';

const renewalCookieByRequest = new WeakMap<Request, string | null>();

export function sessionCookieRenewal(): Middleware {
  return async (ctx, next) => {
    const sessionId = getSessionIdFromRequest(ctx.request);
    if (!sessionId) {
      return next();
    }

    const session = await getSessionFromRequest(ctx.request);
    if (session?.expiresAt) {
      const maxAge = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
      renewalCookieByRequest.set(ctx.request, buildSessionCookie(sessionId, maxAge));
    } else {
      renewalCookieByRequest.set(ctx.request, null);
    }

    const res = await next();
    const cookie = renewalCookieByRequest.get(ctx.request);
    renewalCookieByRequest.delete(ctx.request);

    if (cookie && res.status >= 200 && res.status < 300) {
      const headers = new Headers(res.headers);
      headers.append('Set-Cookie', cookie);
      return new Response(res.body, { status: res.status, headers });
    }
    return res;
  };
}
