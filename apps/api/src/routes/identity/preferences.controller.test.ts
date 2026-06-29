/**
 * @module routes/identity/preferences.controller.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Locale } from '../../i18n';
import type { RouteContext } from '../../router/types';

const mockFindByPrefsId = mock((_id: string) => Promise.resolve(null as null));
const mockUpsert = mock((_id: string, _data: unknown) => Promise.resolve());

mock.module('../../repositories/identity-preferences.repository', () => ({
  getIdentityPreferencesRepository: () => ({
    findByPrefsId: mockFindByPrefsId,
    upsert: mockUpsert,
  }),
}));

import {
  getIdentityPreferencesCtrl,
  putIdentityPreferencesCtrl,
} from './preferences.controller';

afterAll(() => {
  mock.restore();
});

const mockIdentityId = '507f1f77bcf86cd799439011';

function makeErrors(): RouteContext['errors'] {
  return {
    badRequest: () => new Response(null, { status: 400 }),
    unauthorized: () => new Response(null, { status: 401 }),
    forbidden: () => new Response(null, { status: 403 }),
    notFound: () => new Response(null, { status: 404 }),
    methodNotAllowed: () => new Response(null, { status: 405 }),
    rateLimited: () => new Response(null, { status: 429 }),
    conflict: () => new Response(null, { status: 409 }),
    internal: () => new Response(null, { status: 500 }),
    validationFailed: () => new Response(null, { status: 400 }),
    invalidEmail: () => new Response(null, { status: 400 }),
    invalidPhone: () => new Response(null, { status: 400 }),
    verificationFailed: () => new Response(null, { status: 400 }),
    invalidOtp: () => new Response(null, { status: 400 }),
    otpExpired: () => new Response(null, { status: 400 }),
    tooManyAttempts: () => new Response(null, { status: 400 }),
    accountLocked: () => new Response(null, { status: 403 }),
    sessionExpired: () => new Response(null, { status: 401 }),
    sessionExpiredWithClearCookie: () => new Response(null, { status: 401 }),
    payloadTooLarge: () => new Response(null, { status: 413 }),
    alreadyOwned: () => new Response(null, { status: 409 }),
    signInRestricted: () => new Response(null, { status: 403 }),
    accountDeleted: () => new Response(JSON.stringify({ success: false, error: { code: 'ACCOUNT_DELETED', message: 'Account deleted' } }), { status: 403 }),
  };
}

function ctxWithIdentitySession(req: Request): RouteContext {
  const url = new URL(req.url);
  return {
    request: req,
    url,
    params: {},
    query: url.searchParams,
    requestId: 't',
    locale: 'en' as Locale,
    errors: makeErrors(),
    identitySession: {
      identity: { _id: { toHexString: () => mockIdentityId } } as never,
      sessionId: 'sess',
      maxVideoDurationSeconds: 300,
      subscriptions: [],
      entitlements: [],
      isLifetime: false,
    },
  };
}

describe('preferences.controller', () => {
  beforeEach(() => {
    mockFindByPrefsId.mockReset();
    mockUpsert.mockReset();
    mockFindByPrefsId.mockImplementation(() => Promise.resolve(null));
    mockUpsert.mockImplementation(() => Promise.resolve());
  });

  test('getIdentityPreferencesCtrl returns 401 without session', async () => {
    const req = new Request('http://x/identity/me/preferences?prefsId=abc');
    const url = new URL(req.url);
    const ctx: RouteContext = {
      request: req,
      url,
      params: {},
      query: url.searchParams,
      requestId: 't',
      locale: 'en' as Locale,
      errors: makeErrors(),
      identitySession: null,
    };
    const res = await getIdentityPreferencesCtrl(ctx);
    expect(res.status).toBe(401);
  });

  test('getIdentityPreferencesCtrl returns 400 when prefsId missing', async () => {
    const req = new Request('http://x/identity/me/preferences');
    const res = await getIdentityPreferencesCtrl(ctxWithIdentitySession(req));
    expect(res.status).toBe(400);
    expect(mockFindByPrefsId).not.toHaveBeenCalled();
  });

  test('getIdentityPreferencesCtrl looks up sanitized prefsId', async () => {
    const req = new Request(
      `http://x/identity/me/preferences?prefsId=${encodeURIComponent('my_prefs_v1\u200b')}`,
    );
    await getIdentityPreferencesCtrl(ctxWithIdentitySession(req));
    expect(mockFindByPrefsId).toHaveBeenCalledWith('my_prefs_v1');
  });

  test('putIdentityPreferencesCtrl upserts with sanitized prefsId', async () => {
    const body = {
      prefsId: 'cfg\u200d_one',
      encryptedData: 'a'.repeat(32),
      nonce: 'n'.repeat(16),
      schemeVersion: 1,
    };
    const req = new Request('http://x/identity/me/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const ctx = ctxWithIdentitySession(req);
    ctx.body = body;
    await putIdentityPreferencesCtrl(ctx);
    expect(mockUpsert).toHaveBeenCalled();
    const [idArg, dataArg] = mockUpsert.mock.calls[0] as unknown as [
      string,
      { prefsId: string },
    ];
    expect(idArg).toBe('cfg_one');
    expect(dataArg.prefsId).toBe('cfg_one');
  });
});
