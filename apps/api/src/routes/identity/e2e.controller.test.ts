/**
 * @module routes/identity/e2e.controller.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Locale } from '../../i18n';
import type { RouteContext } from '../../router/types';
import { ObjectId } from 'mongodb';

const identityOid = new ObjectId('507f1f77bcf86cd799439011');
const identityHex = identityOid.toHexString();
const deviceId = '550e8400-e29b-41d4-a716-446655440000';
const keyMaterial = 'A'.repeat(44);

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const mockGetDevices = mock(() => Promise.resolve([])) as AnyMock;
const mockAddDevice = mock(() => Promise.resolve(true)) as AnyMock;
const mockFindByIdentityId = mock(() => Promise.resolve(null)) as AnyMock;
const mockSetSigningPublicKey = mock(() => Promise.resolve()) as AnyMock;

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    getDevices: mockGetDevices,
    addDevice: mockAddDevice,
    findByIdentityId: mockFindByIdentityId,
    setSigningPublicKey: mockSetSigningPublicKey,
  }),
}));

const mockCanViewerAccess = mock(() => Promise.resolve(true)) as AnyMock;

mock.module('../../services/identity-keys-access.service', () => ({
  canViewerAccessTargetIdentityKeys: mockCanViewerAccess,
}));

const mockFindByBundleId = mock(() => Promise.resolve(null)) as AnyMock;
const mockCreateBundle = mock(() => Promise.resolve()) as AnyMock;
const mockUpdateBundle = mock(() => Promise.resolve()) as AnyMock;

mock.module('../../repositories/key-bundle.repository', () => ({
  getKeyBundleRepository: () => ({
    findByBundleId: mockFindByBundleId,
    create: mockCreateBundle,
    updateBundle: mockUpdateBundle,
  }),
}));

mock.module('../../services/device-static-attestation.service', () => ({
  verifyDeviceStoredStaticKeyAttestation: mock(() => true),
}));

mock.module('../../repositories/pre-key.repository', () => ({
  getPreKeyRepository: () => ({
    getActiveSignedPreKeysForIdentity: mock(() => Promise.resolve([])),
    getActiveSignedPreKey: mock(() => Promise.resolve(null)),
  }),
}));

mock.module('../../models/identity', () => ({
  toIdentityPublicKeys: (_doc: unknown, _opts?: unknown) => ({
    identityId: identityHex,
    signingPublicKey: keyMaterial,
    preferredCryptoProfile: 'default',
    devices: [{ deviceId, name: 'Phone', ecdhPublicKey: keyMaterial, kemPublicKey: keyMaterial }],
  }),
}));

mock.module('../../db', () => ({
  withTransaction: async (fn: (session: unknown) => Promise<unknown>) => fn(undefined),
}));

import {
  registerDeviceCtrl,
  getIdentityKeysCtrl,
  storeKeyBundleCtrl,
  getKeyBundleCtrl,
  listDevicesCtrl,
  initializeE2ECtrl,
} from './controller';

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

function makeIdentitySession(devices: Array<{ deviceId: string; name: string }> = []) {
  return {
    identity: {
      _id: identityOid,
      ident: 'ident-hash',
      username: 'user',
      displayName: 'User',
      signingPublicKey: keyMaterial,
      devices,
    } as never,
    sessionId: 'sess',
    maxVideoDurationSeconds: 300,
    subscriptions: [],
    entitlements: [],
    isLifetime: false,
  };
}

function ctxWithSession(
  params: Record<string, string>,
  body?: unknown,
  identitySession = makeIdentitySession(),
): RouteContext {
  const req = new Request('http://x/', {
    method: body !== undefined ? 'POST' : 'GET',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const out: RouteContext = {
    request: req,
    url: new URL(req.url),
    params,
    query: new URL(req.url).searchParams,
    requestId: 't',
    locale: 'en' as Locale,
    errors: makeErrors(),
    identitySession,
  };
  if (body !== undefined) out.body = body;
  return out;
}

describe('identity e2e controllers', () => {
  beforeEach(() => {
    mockGetDevices.mockReset();
    mockAddDevice.mockReset();
    mockFindByIdentityId.mockReset();
    mockSetSigningPublicKey.mockReset();
    mockCanViewerAccess.mockReset();
    mockFindByBundleId.mockReset();
    mockCreateBundle.mockReset();
    mockUpdateBundle.mockReset();

    mockGetDevices.mockImplementation(() => Promise.resolve([]));
    mockAddDevice.mockImplementation(() => Promise.resolve(true));
    mockFindByIdentityId.mockImplementation(() =>
      Promise.resolve({
        _id: identityOid,
        ident: 'ident-hash',
        signingPublicKey: keyMaterial,
        devices: [],
      }),
    );
    mockCanViewerAccess.mockImplementation(() => Promise.resolve(true));
    mockFindByBundleId.mockImplementation(() => Promise.resolve(null));
  });

  test('registerDeviceCtrl returns 401 without identity session', async () => {
    const ctx = ctxWithSession({ id: identityHex }, {}, undefined as never);
    ctx.identitySession = null;
    expect((await registerDeviceCtrl(ctx)).status).toBe(401);
  });

  test('registerDeviceCtrl returns 403 for another identity', async () => {
    const body = {
      deviceId,
      name: 'Phone',
      ecdhPublicKey: keyMaterial,
      kemPublicKey: keyMaterial,
    };
    const ctx = ctxWithSession({ id: new ObjectId().toHexString() }, body);
    expect((await registerDeviceCtrl(ctx)).status).toBe(403);
  });

  test('registerDeviceCtrl registers a new device', async () => {
    const body = {
      deviceId,
      name: 'Phone',
      ecdhPublicKey: keyMaterial,
      kemPublicKey: keyMaterial,
    };
    const res = await registerDeviceCtrl(ctxWithSession({ id: identityHex }, body));
    expect(res.status).toBe(200);
    expect(mockAddDevice).toHaveBeenCalled();
  });

  test('getIdentityKeysCtrl returns 403 when access denied', async () => {
    mockCanViewerAccess.mockImplementationOnce(() => Promise.resolve(false));
    const res = await getIdentityKeysCtrl(ctxWithSession({ id: identityHex }));
    expect(res.status).toBe(403);
  });

  test('getIdentityKeysCtrl returns keys when access allowed', async () => {
    const res = await getIdentityKeysCtrl(ctxWithSession({ id: identityHex }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { signingPublicKey: string } };
    expect(body.data.signingPublicKey).toBe(keyMaterial);
  });

  test('storeKeyBundleCtrl creates bundle when none exists', async () => {
    const body = {
      encryptedBundle: 'encrypted-bundle-data-min-32-chars-long',
      salt: 'salt-value-16chars',
      nonce: 'nonce-value-16chars',
    };
    const res = await storeKeyBundleCtrl(ctxWithSession({ id: identityHex }, body));
    expect(res.status).toBe(200);
    expect(mockCreateBundle).toHaveBeenCalled();
  });

  test('getKeyBundleCtrl returns 404 when bundle missing', async () => {
    mockFindByBundleId.mockImplementation(() => Promise.resolve(null));
    expect((await getKeyBundleCtrl(ctxWithSession({ id: identityHex }))).status).toBe(404);
  });

  test('listDevicesCtrl returns device list for owner', async () => {
    const now = new Date();
    mockGetDevices.mockImplementation(() =>
      Promise.resolve([{
        deviceId,
        name: 'Phone',
        ecdhPublicKey: keyMaterial,
        registeredAt: now,
        lastActiveAt: now,
      }]),
    );
    const res = await listDevicesCtrl(ctxWithSession({ id: identityHex }));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { devices: Array<{ deviceId: string }> } };
    expect(body.data.devices[0]?.deviceId).toBe(deviceId);
  });

  test('initializeE2ECtrl rejects when e2e already initialized', async () => {
    const body = {
      signingPublicKey: keyMaterial,
      device: { deviceId, name: 'Phone', ecdhPublicKey: keyMaterial, kemPublicKey: keyMaterial },
      bundle: {
        encryptedBundle: 'encrypted-bundle-data-min-32-chars-long',
        salt: 'salt-value-16chars',
        nonce: 'nonce-value-16chars',
      },
    };
    const session = makeIdentitySession([]);
    (session.identity as { signingPublicKey?: string }).signingPublicKey = keyMaterial;
    const res = await initializeE2ECtrl(ctxWithSession({ id: identityHex }, body, session));
    expect(res.status).toBe(400);
  });

  test('initializeE2ECtrl initializes e2e for fresh identity', async () => {
    const body = {
      signingPublicKey: keyMaterial,
      device: { deviceId, name: 'Phone', ecdhPublicKey: keyMaterial, kemPublicKey: keyMaterial },
      bundle: {
        encryptedBundle: 'encrypted-bundle-data-min-32-chars-long',
        salt: 'salt-value-16chars',
        nonce: 'nonce-value-16chars',
      },
    };
    const session = makeIdentitySession([]);
    (session.identity as { signingPublicKey?: string }).signingPublicKey = undefined;
    const res = await initializeE2ECtrl(ctxWithSession({ id: identityHex }, body, session));
    expect(res.status).toBe(200);
    expect(mockSetSigningPublicKey).toHaveBeenCalled();
    expect(mockCreateBundle).toHaveBeenCalled();
    expect(mockAddDevice).toHaveBeenCalled();
  });
});
