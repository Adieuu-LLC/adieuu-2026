import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { IdentityDocument } from '../../models/identity';
import { MAX_OTPK_PER_DEVICE } from '../../models/pre-key';
import type { ClaimedDevicePreKeys, PreKeyDocument } from '../../models/pre-key';

const ownerId = new ObjectId();
const callerId = new ObjectId();
const targetId = new ObjectId();

let currentIdentity = {
  _id: ownerId,
  signingPublicKey: 'signing-public-key-base64',
  devices: [{ deviceId: 'device-1' }],
};

const getIdentityFromSessionMock = mock(async () => currentIdentity);
const findByIdentityIdMock = mock(async (): Promise<IdentityDocument | null> => null);
const verifySignedPreKeyMock = mock(() => true);

const storeSignedPreKeyMock = mock(async () => {});
const countUnconsumedOneTimePreKeysMock = mock(async () => 0);
const storeOneTimePreKeysMock = mock(async () => 0);
const claimPreKeysForAllDevicesMock = mock(async (): Promise<ClaimedDevicePreKeys[]> => []);
const getActiveSignedPreKeyMock = mock(async (): Promise<PreKeyDocument | null> => null);
const getUnconsumedOtpkDigestMock = mock(async () => 'digest-placeholder');
const purgeUnconsumedOneTimePreKeysMock = mock(async () => 0);
const getConsumedOtpkKeyIdsMock = mock(async (): Promise<string[]> => []);

/** Claim tests use distinct caller/target ObjectIds; real access check needs friends/DB — allow for unit tests. */
const canViewerAccessTargetIdentityKeysMock = mock(() => Promise.resolve(true));

mock.module('../../services/identity-keys-access.service', () => ({
  canViewerAccessTargetIdentityKeys: canViewerAccessTargetIdentityKeysMock,
}));

mock.module('../../services/session.service', () => ({
  requireIdentitySession: mock((request: Request) => {
    const cookie = request.headers.get('Cookie') ?? '';
    if (cookie.includes('adieuu_session=')) {
      return Promise.resolve({
        type: 'identity',
        identityId: ownerId.toHexString(),
        accountHash: 'a'.repeat(64),
        lastActivityAt: Date.now(),
        expiresAt: Date.now() + 86_400_000,
      });
    }
    return Promise.resolve(null);
  }),
}));

mock.module('../../services/identity.service', () => ({
  getIdentityFromSession: getIdentityFromSessionMock,
}));

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findByIdentityId: findByIdentityIdMock,
  }),
}));

mock.module('../../repositories/pre-key.repository', () => ({
  getPreKeyRepository: () => ({
    storeSignedPreKey: storeSignedPreKeyMock,
    countUnconsumedOneTimePreKeys: countUnconsumedOneTimePreKeysMock,
    storeOneTimePreKeys: storeOneTimePreKeysMock,
    claimPreKeysForAllDevices: claimPreKeysForAllDevicesMock,
    getActiveSignedPreKey: getActiveSignedPreKeyMock,
    getUnconsumedOtpkDigest: getUnconsumedOtpkDigestMock,
    purgeUnconsumedOneTimePreKeys: purgeUnconsumedOneTimePreKeysMock,
    getConsumedOtpkKeyIds: getConsumedOtpkKeyIdsMock,
  }),
}));

mock.module('../../models/identity', () => ({
  toIdentityPublicKeys: (identity: { _id: ObjectId; signingPublicKey?: string; devices?: Array<{ deviceId: string }> }) => ({
    identityId: identity._id.toHexString(),
    signingPublicKey: identity.signingPublicKey ?? '',
    preferredCryptoProfile: 'default',
    devices: (identity.devices ?? []).map((d) => ({
      deviceId: d.deviceId,
      ecdhPublicKey: 'ecdh-public-key-base64',
      kemPublicKey: 'kem-public-key-base64',
      name: d.deviceId,
    })),
  }),
}));

mock.module('@adieuu/crypto', () => ({
  verifySignedPreKey: verifySignedPreKeyMock,
  fromBase64: (value: string) => new Uint8Array(Buffer.from(value)),
}));

import {
  uploadPreKeysCtrl,
  claimPreKeysCtrl,
  getPreKeyCountCtrl,
  purgeOneTimePreKeysCtrl,
} from './pre-key.controller';

function makeCtx(options: {
  params: Record<string, string>;
  body?: unknown;
  authenticated?: boolean;
}) {
  const request = new Request('http://localhost', {
    headers: options.authenticated === false
      ? undefined
      : { Cookie: 'adieuu_session=session' },
  });

  return {
    request,
    params: options.params,
    body: options.body ?? {},
    query: new URLSearchParams(),
    errors: {
      unauthorized: () => new Response(JSON.stringify({ success: false }), { status: 401 }),
      validationFailed: () => new Response(JSON.stringify({ success: false }), { status: 400 }),
    },
  } as unknown as import('../../router').RouteContext;
}

describe('pre-key.controller', () => {
  afterAll(() => {
    mock.restore();
  });
  beforeEach(() => {
    currentIdentity = {
      _id: ownerId,
      signingPublicKey: 'signing-public-key-base64',
      devices: [{ deviceId: 'device-1' }],
    };

    canViewerAccessTargetIdentityKeysMock.mockReset();
    canViewerAccessTargetIdentityKeysMock.mockImplementation(() => Promise.resolve(true));

    getIdentityFromSessionMock.mockReset();
    getIdentityFromSessionMock.mockImplementation(async () => currentIdentity);
    findByIdentityIdMock.mockReset();
    verifySignedPreKeyMock.mockReset();
    verifySignedPreKeyMock.mockReturnValue(true);

    storeSignedPreKeyMock.mockReset();
    countUnconsumedOneTimePreKeysMock.mockReset();
    countUnconsumedOneTimePreKeysMock.mockResolvedValue(0);
    storeOneTimePreKeysMock.mockReset();
    storeOneTimePreKeysMock.mockResolvedValue(0);
    claimPreKeysForAllDevicesMock.mockReset();
    claimPreKeysForAllDevicesMock.mockResolvedValue([]);
    getActiveSignedPreKeyMock.mockReset();
    getActiveSignedPreKeyMock.mockResolvedValue(null);
    getUnconsumedOtpkDigestMock.mockReset();
    getUnconsumedOtpkDigestMock.mockResolvedValue('digest-placeholder');
    purgeUnconsumedOneTimePreKeysMock.mockReset();
    purgeUnconsumedOneTimePreKeysMock.mockResolvedValue(0);
    getConsumedOtpkKeyIdsMock.mockReset();
    getConsumedOtpkKeyIdsMock.mockResolvedValue([]);
  });

  test('uploadPreKeys rejects invalid SPK signature', async () => {
    verifySignedPreKeyMock.mockReturnValue(false);

    const response = await uploadPreKeysCtrl(
      makeCtx({
        params: { id: ownerId.toHexString(), deviceId: 'device-1' },
        body: {
          signedPreKey: {
            keyId: '11111111-1111-4111-8111-111111111111',
            ecdhPublicKey: 'a'.repeat(64),
            kemPublicKey: 'b'.repeat(64),
            signature: 'c'.repeat(64),
          },
        },
      })
    );

    expect(response.status).toBe(400);
    expect(storeSignedPreKeyMock).not.toHaveBeenCalled();
  });

  test('uploadPreKeys requires authentication', async () => {
    const response = await uploadPreKeysCtrl(
      makeCtx({
        params: { id: ownerId.toHexString(), deviceId: 'device-1' },
        body: {},
        authenticated: false,
      })
    );

    expect(response.status).toBe(401);
  });

  test('uploadPreKeys rejects OTPK uploads over per-device limit', async () => {
    countUnconsumedOneTimePreKeysMock.mockResolvedValue(MAX_OTPK_PER_DEVICE);

    const response = await uploadPreKeysCtrl(
      makeCtx({
        params: { id: ownerId.toHexString(), deviceId: 'device-1' },
        body: {
          oneTimePreKeys: [
            {
              keyId: '22222222-2222-4222-8222-222222222222',
              ecdhPublicKey: 'd'.repeat(64),
              kemPublicKey: 'e'.repeat(64),
            },
          ],
        },
      })
    );

    expect(response.status).toBe(400);
    expect(storeOneTimePreKeysMock).not.toHaveBeenCalled();
  });

  test('uploadPreKeys returns 404 when device does not belong to identity', async () => {
    currentIdentity = {
      _id: ownerId,
      signingPublicKey: 'signing-public-key-base64',
      devices: [{ deviceId: 'other-device' }],
    };

    const response = await uploadPreKeysCtrl(
      makeCtx({
        params: { id: ownerId.toHexString(), deviceId: 'device-1' },
        body: {
          signedPreKey: {
            keyId: '11111111-1111-4111-8111-111111111111',
            ecdhPublicKey: 'a'.repeat(64),
            kemPublicKey: 'b'.repeat(64),
            signature: 'c'.repeat(64),
          },
        },
      })
    );

    expect(response.status).toBe(404);
    expect(storeSignedPreKeyMock).not.toHaveBeenCalled();
  });

  test('uploadPreKeys stores signed and one-time pre-keys', async () => {
    storeOneTimePreKeysMock.mockResolvedValue(2);

    const response = await uploadPreKeysCtrl(
      makeCtx({
        params: { id: ownerId.toHexString(), deviceId: 'device-1' },
        body: {
          signedPreKey: {
            keyId: '11111111-1111-4111-8111-111111111111',
            ecdhPublicKey: 'a'.repeat(64),
            kemPublicKey: 'b'.repeat(64),
            signature: 'c'.repeat(64),
          },
          oneTimePreKeys: [
            {
              keyId: '22222222-2222-4222-8222-222222222222',
              ecdhPublicKey: 'd'.repeat(64),
              kemPublicKey: 'e'.repeat(64),
            },
            {
              keyId: '33333333-3333-4333-8333-333333333333',
              ecdhPublicKey: 'f'.repeat(64),
              kemPublicKey: 'g'.repeat(64),
            },
          ],
        },
      })
    );

    expect(response.status).toBe(200);
    expect(storeSignedPreKeyMock).toHaveBeenCalledTimes(1);
    expect(storeOneTimePreKeysMock).toHaveBeenCalledTimes(1);
  });

  test('uploadPreKeys still succeeds for signed pre-key when OTPK capacity is full', async () => {
    countUnconsumedOneTimePreKeysMock.mockResolvedValue(MAX_OTPK_PER_DEVICE);

    const response = await uploadPreKeysCtrl(
      makeCtx({
        params: { id: ownerId.toHexString(), deviceId: 'device-1' },
        body: {
          signedPreKey: {
            keyId: '11111111-1111-4111-8111-111111111111',
            ecdhPublicKey: 'a'.repeat(64),
            kemPublicKey: 'b'.repeat(64),
            signature: 'c'.repeat(64),
          },
          oneTimePreKeys: [
            {
              keyId: '22222222-2222-4222-8222-222222222222',
              ecdhPublicKey: 'd'.repeat(64),
              kemPublicKey: 'e'.repeat(64),
            },
          ],
        },
      })
    );

    expect(response.status).toBe(200);
    expect(storeSignedPreKeyMock).toHaveBeenCalledTimes(1);
    expect(storeOneTimePreKeysMock).not.toHaveBeenCalled();
    const json = await response.json() as { data: { storedSignedPreKey: boolean; storedOneTimePreKeys: number } };
    expect(json.data.storedSignedPreKey).toBe(true);
    expect(json.data.storedOneTimePreKeys).toBe(0);
  });

  test('claimPreKeys requires authentication', async () => {
    const response = await claimPreKeysCtrl(
      makeCtx({
        params: { id: targetId.toHexString() },
        body: {},
        authenticated: false,
      })
    );

    expect(response.status).toBe(401);
  });

  test('claimPreKeys rejects invalid identity id format', async () => {
    const response = await claimPreKeysCtrl(
      makeCtx({
        params: { id: 'not-an-object-id' },
        body: {},
      })
    );

    expect(response.status).toBe(400);
    expect(findByIdentityIdMock).not.toHaveBeenCalled();
    expect(claimPreKeysForAllDevicesMock).not.toHaveBeenCalled();
  });

  test('claimPreKeys filters requested deviceIds and claims for target identity', async () => {
    currentIdentity = {
      _id: callerId,
      signingPublicKey: 'caller-signing',
      devices: [{ deviceId: 'caller-device' }],
    };
    findByIdentityIdMock.mockResolvedValue({
      _id: targetId,
      signingPublicKey: 'target-signing',
      devices: [{ deviceId: 'device-a' }, { deviceId: 'device-b' }],
    } as IdentityDocument);
    claimPreKeysForAllDevicesMock.mockResolvedValue([
      { deviceId: 'device-b', signedPreKey: null, oneTimePreKey: null },
    ]);

    const response = await claimPreKeysCtrl(
      makeCtx({
        params: { id: targetId.toHexString() },
        body: { deviceIds: ['device-b'] },
      })
    );

    expect(response.status).toBe(200);
    expect(claimPreKeysForAllDevicesMock).toHaveBeenCalledWith(
      targetId,
      ['device-b']
    );
  });

  test('claimPreKeys claims for all target devices when deviceIds filter is omitted', async () => {
    currentIdentity = {
      _id: callerId,
      signingPublicKey: 'caller-signing',
      devices: [{ deviceId: 'caller-device' }],
    };
    findByIdentityIdMock.mockResolvedValue({
      _id: targetId,
      signingPublicKey: 'target-signing',
      devices: [{ deviceId: 'device-a' }, { deviceId: 'device-b' }],
    } as IdentityDocument);

    const response = await claimPreKeysCtrl(
      makeCtx({
        params: { id: targetId.toHexString() },
        body: {},
      })
    );

    expect(response.status).toBe(200);
    expect(claimPreKeysForAllDevicesMock).toHaveBeenCalledWith(
      targetId,
      ['device-a', 'device-b']
    );
  });

  test('claimPreKeys rejects when requested deviceIds do not match target devices', async () => {
    currentIdentity = {
      _id: callerId,
      signingPublicKey: 'caller-signing',
      devices: [{ deviceId: 'caller-device' }],
    };
    findByIdentityIdMock.mockResolvedValue({
      _id: targetId,
      signingPublicKey: 'target-signing',
      devices: [{ deviceId: 'device-a' }],
    } as IdentityDocument);

    const response = await claimPreKeysCtrl(
      makeCtx({
        params: { id: targetId.toHexString() },
        body: { deviceIds: ['missing-device'] },
      })
    );

    expect(response.status).toBe(400);
    expect(claimPreKeysForAllDevicesMock).not.toHaveBeenCalled();
  });

  test('claimPreKeys returns 404 when target identity does not exist', async () => {
    findByIdentityIdMock.mockResolvedValue(null);

    const response = await claimPreKeysCtrl(
      makeCtx({
        params: { id: targetId.toHexString() },
        body: {},
      })
    );

    expect(response.status).toBe(404);
    expect(claimPreKeysForAllDevicesMock).not.toHaveBeenCalled();
  });

  test('getPreKeyCount blocks non-owner access', async () => {
    const response = await getPreKeyCountCtrl(
      makeCtx({
        params: { id: targetId.toHexString(), deviceId: 'device-1' },
      })
    );
    expect(response.status).toBe(403);
  });

  test('getPreKeyCount requires authentication', async () => {
    const response = await getPreKeyCountCtrl(
      makeCtx({
        params: { id: ownerId.toHexString(), deviceId: 'device-1' },
        authenticated: false,
      })
    );
    expect(response.status).toBe(401);
  });

  test('getPreKeyCount returns 404 when device does not belong to identity', async () => {
    currentIdentity = {
      _id: ownerId,
      signingPublicKey: 'signing-public-key-base64',
      devices: [{ deviceId: 'other-device' }],
    };

    const response = await getPreKeyCountCtrl(
      makeCtx({
        params: { id: ownerId.toHexString(), deviceId: 'device-1' },
      })
    );
    expect(response.status).toBe(404);
  });

  test('getPreKeyCount returns signed key + remaining OTPK count for owner', async () => {
    getActiveSignedPreKeyMock.mockResolvedValue({
      keyId: 'spk-123',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    } as PreKeyDocument);
    countUnconsumedOneTimePreKeysMock.mockResolvedValue(17);

    const response = await getPreKeyCountCtrl(
      makeCtx({
        params: { id: ownerId.toHexString(), deviceId: 'device-1' },
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json() as { data: { oneTimePreKeysRemaining: number; signedPreKey: { keyId: string } } };
    expect(json.data.oneTimePreKeysRemaining).toBe(17);
    expect(json.data.signedPreKey.keyId).toBe('spk-123');
  });

  test('getPreKeyCount includes otpkDigest in response', async () => {
    getUnconsumedOtpkDigestMock.mockResolvedValue('abc123digest');
    countUnconsumedOneTimePreKeysMock.mockResolvedValue(5);

    const response = await getPreKeyCountCtrl(
      makeCtx({
        params: { id: ownerId.toHexString(), deviceId: 'device-1' },
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json() as { data: { otpkDigest: string } };
    expect(json.data.otpkDigest).toBe('abc123digest');
    expect(getUnconsumedOtpkDigestMock).toHaveBeenCalledTimes(1);
  });

  test('getPreKeyCount includes consumedOtpkKeyIds in response', async () => {
    getConsumedOtpkKeyIdsMock.mockResolvedValue(['consumed-1', 'consumed-2']);
    countUnconsumedOneTimePreKeysMock.mockResolvedValue(8);

    const response = await getPreKeyCountCtrl(
      makeCtx({
        params: { id: ownerId.toHexString(), deviceId: 'device-1' },
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json() as { data: { consumedOtpkKeyIds: string[] } };
    expect(json.data.consumedOtpkKeyIds).toEqual(['consumed-1', 'consumed-2']);
    expect(getConsumedOtpkKeyIdsMock).toHaveBeenCalledTimes(1);
  });

  test('purgeOneTimePreKeys returns purged count and consumedKeyIds', async () => {
    purgeUnconsumedOneTimePreKeysMock.mockResolvedValue(12);
    getConsumedOtpkKeyIdsMock.mockResolvedValue(['key-1', 'key-2']);

    const response = await purgeOneTimePreKeysCtrl(
      makeCtx({
        params: { id: ownerId.toHexString(), deviceId: 'device-1' },
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json() as { data: { purged: number; consumedKeyIds: string[] } };
    expect(json.data.purged).toBe(12);
    expect(json.data.consumedKeyIds).toEqual(['key-1', 'key-2']);
  });

  test('purgeOneTimePreKeys returns empty consumedKeyIds when none exist', async () => {
    purgeUnconsumedOneTimePreKeysMock.mockResolvedValue(5);
    getConsumedOtpkKeyIdsMock.mockResolvedValue([]);

    const response = await purgeOneTimePreKeysCtrl(
      makeCtx({
        params: { id: ownerId.toHexString(), deviceId: 'device-1' },
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json() as { data: { purged: number; consumedKeyIds: string[] } };
    expect(json.data.purged).toBe(5);
    expect(json.data.consumedKeyIds).toEqual([]);
  });

  test('purgeOneTimePreKeys blocks non-owner access', async () => {
    const response = await purgeOneTimePreKeysCtrl(
      makeCtx({
        params: { id: targetId.toHexString(), deviceId: 'device-1' },
      })
    );
    expect(response.status).toBe(403);
  });
});

