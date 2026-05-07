/**
 * @module routes/identity/pre-key.controller.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Locale } from '../../i18n';
import type { RouteContext } from '../../router/types';
import { ObjectId } from 'mongodb';
import * as adieuuCrypto from '@adieuu/crypto';

const callerId = new ObjectId('64a1b2c3d4e5f60718293a4b');
const targetIdStr = '507f1f77bcf86cd799439011';
const targetOid = new ObjectId(targetIdStr);

const mockFindByIdentityId = mock((_id: string): Promise<unknown> => Promise.resolve(null));

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findByIdentityId: mockFindByIdentityId,
  }),
}));

const mockCanViewerAccess = mock(
  (_a: unknown, _b: unknown) => Promise.resolve(true),
);

mock.module('../../services/identity-keys-access.service', () => ({
  canViewerAccessTargetIdentityKeys: mockCanViewerAccess,
}));

mock.module('../../models/identity', () => ({
  toIdentityPublicKeys: (_doc: unknown, _opts?: unknown) => ({
    signingPublicKey: 'k',
    devices: [{ deviceId: 'devone', ecdhPublicKey: '', kemPublicKey: '' }],
  }),
}));

// Preserve real @adieuu/crypto exports so other test files in the same Bun run
// (e.g. subscription-grants) are not poisoned by a partial mock.
mock.module('@adieuu/crypto', () => ({
  ...adieuuCrypto,
  verifySignedPreKey: mock(() => true),
}));

const mockClaimPreKeys = mock(() => Promise.resolve([] as unknown[]));

mock.module('../../repositories/pre-key.repository', () => ({
  getPreKeyRepository: () => ({
    claimPreKeysForAllDevices: mockClaimPreKeys,
  }),
}));

import { claimPreKeysCtrl } from './pre-key.controller';

afterAll(() => {
  mock.restore();
});

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
  };
}

function ctxWithCaller(req: Request, params: Record<string, string>, body?: unknown): RouteContext {
  const url = new URL(req.url);
  const out: RouteContext = {
    request: req,
    url,
    params,
    query: url.searchParams,
    requestId: 't',
    locale: 'en' as Locale,
    errors: makeErrors(),
    identitySession: {
      identity: { _id: callerId } as never,
      sessionId: 's',
      maxVideoDurationSeconds: 300,
      subscriptions: [],
      entitlements: [],
      isLifetime: false,
    },
  };
  if (body !== undefined) out.body = body;
  return out;
}

describe('pre-key.controller', () => {
  beforeEach(() => {
    mockFindByIdentityId.mockReset();
    mockCanViewerAccess.mockReset();
    mockClaimPreKeys.mockReset();
    mockFindByIdentityId.mockImplementation((_id: string) =>
      _id === targetIdStr ? Promise.resolve({ _id: targetOid } as never) : Promise.resolve(null),
    );
    mockCanViewerAccess.mockImplementation(() => Promise.resolve(true));
    mockClaimPreKeys.mockImplementation(() => Promise.resolve([]));
  });

  test('claimPreKeysCtrl returns 400 when target identity id invalid', async () => {
    const req = new Request('http://x/');
    const res = await claimPreKeysCtrl(
      ctxWithCaller(req, { id: `bad\u200bid` }),
    );
    expect(res.status).toBe(400);
  });

  test('claimPreKeysCtrl returns 403 when access denied', async () => {
    mockCanViewerAccess.mockImplementationOnce(() => Promise.resolve(false));
    const req = new Request('http://x/');
    const res = await claimPreKeysCtrl(
      ctxWithCaller(req, { id: targetIdStr }),
    );
    expect(res.status).toBe(403);
    expect(mockClaimPreKeys).not.toHaveBeenCalled();
  });

  test('claimPreKeysCtrl passes sanitized device id list to repo', async () => {
    const devIdRaw = `dev\u200bone`;
    const body = { deviceIds: [devIdRaw] };
    const req = new Request('http://x/', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    const ctx = ctxWithCaller(req, { id: targetIdStr }, body);
    await claimPreKeysCtrl(ctx);
    expect(mockClaimPreKeys).toHaveBeenCalledWith(targetOid, ['devone']);
  });
});
