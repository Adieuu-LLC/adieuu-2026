/**
 * Shared route-controller test helpers so global `mock.module()` registration order
 * (non-deterministic across environments) does not break ObjectId equality assertions.
 */

import { ObjectId } from 'mongodb';

/** Fixed identity id used wherever route tests compare Mongo ObjectId arguments. */
export const ROUTE_TEST_IDENTITY_ID = new ObjectId('64a1b2c3d4e5f60718293a4b');

/** Mirrors production `getIdentitySessionIdFromRequest` (unified `adieuu_session` cookie). */
export function parseAdieuuSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').reduce(
    (acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  return cookies['adieuu_session'] ?? null;
}
