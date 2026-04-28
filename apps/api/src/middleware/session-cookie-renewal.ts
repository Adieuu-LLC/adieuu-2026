/**
 * Refreshes the `adieuu_session` cookie Max-Age on successful responses when
 * the session is valid, keeping browser cookie lifetime aligned with sliding
 * server-side expiry.
 *
 * Skips renewal when the response already carries a `Set-Cookie` for the
 * session cookie (e.g. identity login establishing a new session), so we
 * never clobber a freshly-minted session cookie with a stale renewal.
 *
 * Preserves the grant-key suffix for identity sessions with encrypted
 * subscription grants, so the renewed cookie remains usable for grant
 * evaluation downstream.
 */

import type { Middleware } from '../router/types';
import {
  buildSessionCookie,
  getSessionFromRequest,
  getSessionIdFromRequest,
  getGrantKeyFromRequest,
  SESSION_CONFIG,
} from '../services/session.service';

const renewalCookieByRequest = new WeakMap<Request, string | null>();

/** True when the response already sets (or clears) the session cookie. */
function responseAlreadySetsSessionCookie(headers: Headers): boolean {
  const prefix = `${SESSION_CONFIG.cookieName}=`;
  return headers.getSetCookie().some((v) => v.startsWith(prefix));
}

export function sessionCookieRenewal(): Middleware {
  return async (ctx, next) => {
    const sessionId = getSessionIdFromRequest(ctx.request);
    if (!sessionId) {
      return next();
    }

    const session = await getSessionFromRequest(ctx.request);
    if (session?.expiresAt) {
      const maxAge = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
      const grantKey = getGrantKeyFromRequest(ctx.request);
      const cookieValue = grantKey ? `${sessionId}.${grantKey}` : sessionId;
      renewalCookieByRequest.set(ctx.request, buildSessionCookie(cookieValue, maxAge));
    } else {
      renewalCookieByRequest.set(ctx.request, null);
    }

    const res = await next();
    const cookie = renewalCookieByRequest.get(ctx.request);
    renewalCookieByRequest.delete(ctx.request);

    if (cookie && res.status >= 200 && res.status < 300) {
      if (responseAlreadySetsSessionCookie(res.headers)) {
        return res;
      }
      const headers = new Headers(res.headers);
      headers.append('Set-Cookie', cookie);
      return new Response(res.body, { status: res.status, headers });
    }
    return res;
  };
}
