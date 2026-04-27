/**
 * Shared route-controller test helpers so global `mock.module()` registration order
 * (non-deterministic across environments) does not break ObjectId equality assertions.
 */

import { ObjectId } from 'mongodb';
import type { RouteContext, Middleware } from '../router/types';

/** Fixed identity id used wherever route tests compare Mongo ObjectId arguments. */
export const ROUTE_TEST_IDENTITY_ID = new ObjectId('64a1b2c3d4e5f60718293a4b');

/** Mirrors production `getIdentitySessionIdFromRequest` (unified `adieuu_session` cookie). */
export function parseAdieuuSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').reduce(
    (acc, cookie) => {
      const eqIdx = cookie.indexOf('=');
      if (eqIdx === -1) return acc;
      const key = cookie.substring(0, eqIdx).trim();
      const value = cookie.substring(eqIdx + 1).trim();
      if (key && value) acc[key] = value;
      return acc;
    },
    {} as Record<string, string>,
  );

  return cookies['adieuu_session'] ?? null;
}

/**
 * Test middleware that mimics `enrichIdentitySession` for sub-router tests.
 *
 * When the `adieuu_session` cookie is present, sets `ctx.identitySession`
 * with the provided identity mock. Otherwise sets it to `null`.
 */
export function testIdentityEnrichment(
  identityId: ObjectId,
  overrides: { username?: string } = {},
): Middleware {
  return async (ctx: RouteContext, next: () => Promise<Response>) => {
    const cookie = ctx.request.headers.get('Cookie') ?? '';
    if (cookie.includes('adieuu_session=')) {
      ctx.identitySession = {
        identity: { _id: identityId, username: overrides.username ?? 'testuser' } as never,
        sessionId: 'test-session',
        maxVideoDurationSeconds: 300,
        subscriptions: [],
        entitlements: [],
      };
    } else {
      ctx.identitySession = null;
    }
    return next();
  };
}
