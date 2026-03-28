import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const realPreKeyStorage = await import('./preKeyStorage');

const realStoreSignedPreKey = realPreKeyStorage.storeSignedPreKey;
const realStoreOneTimePreKeys = realPreKeyStorage.storeOneTimePreKeys;
const realGetActiveSignedPreKey = realPreKeyStorage.getActiveSignedPreKey;
const realGetRetiredSignedPreKeys = realPreKeyStorage.getRetiredSignedPreKeys;
const realRetireSignedPreKey = realPreKeyStorage.retireSignedPreKey;
const realDeleteSignedPreKey = realPreKeyStorage.deleteSignedPreKey;

const storeSignedPreKeyMock = mock(realStoreSignedPreKey);
const storeOneTimePreKeysMock = mock(realStoreOneTimePreKeys);
const getActiveSignedPreKeyMock = mock(realGetActiveSignedPreKey);
const getRetiredSignedPreKeysMock = mock(realGetRetiredSignedPreKeys);
const retireSignedPreKeyMock = mock(realRetireSignedPreKey);
const deleteSignedPreKeyMock = mock(realDeleteSignedPreKey);

mock.module('./preKeyStorage', () => ({
  ...Object.fromEntries(Object.keys(realPreKeyStorage).map(
    (k) => [k, (realPreKeyStorage as Record<string, unknown>)[k]]
  )),
  storeSignedPreKey: storeSignedPreKeyMock,
  storeOneTimePreKeys: storeOneTimePreKeysMock,
  getActiveSignedPreKey: getActiveSignedPreKeyMock,
  getRetiredSignedPreKeys: getRetiredSignedPreKeysMock,
  retireSignedPreKey: retireSignedPreKeyMock,
  deleteSignedPreKey: deleteSignedPreKeyMock,
}));

const preKeyService = await import('./preKeyService');

function stubMocksForIsolation(): void {
  storeSignedPreKeyMock.mockImplementation(async () => {});
  storeOneTimePreKeysMock.mockImplementation(async () => {});
  getActiveSignedPreKeyMock.mockImplementation(async () => null);
  getRetiredSignedPreKeysMock.mockImplementation(async () => []);
  retireSignedPreKeyMock.mockImplementation(async () => {});
  deleteSignedPreKeyMock.mockImplementation(async () => {});
}

function restoreRealImplementations(): void {
  storeSignedPreKeyMock.mockImplementation(realStoreSignedPreKey);
  storeOneTimePreKeysMock.mockImplementation(realStoreOneTimePreKeys);
  getActiveSignedPreKeyMock.mockImplementation(realGetActiveSignedPreKey);
  getRetiredSignedPreKeysMock.mockImplementation(realGetRetiredSignedPreKeys);
  retireSignedPreKeyMock.mockImplementation(realRetireSignedPreKey);
  deleteSignedPreKeyMock.mockImplementation(realDeleteSignedPreKey);
}

describe('services/preKeyService', () => {
  const signingPrivateKey = new Uint8Array(32).fill(7);
  const wrappingKey = new Uint8Array(32).fill(9);

  beforeEach(() => {
    storeSignedPreKeyMock.mockReset();
    storeOneTimePreKeysMock.mockReset();
    getActiveSignedPreKeyMock.mockReset();
    getRetiredSignedPreKeysMock.mockReset();
    retireSignedPreKeyMock.mockReset();
    deleteSignedPreKeyMock.mockReset();
    stubMocksForIsolation();
  });

  afterEach(() => {
    restoreRealImplementations();
  });

  test('checkAndRotateSpk does not rotate when SPK is fresh', async () => {
    const createdAt = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h old
    getActiveSignedPreKeyMock.mockResolvedValueOnce({ keyId: 'spk-fresh', createdAt });

    const identityApi = {
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    const result = await preKeyService.checkAndRotateSpk(
      {
        identityId: 'identity-1',
        deviceId: 'device-1',
        signingPrivateKey,
        wrappingKey,
      },
      identityApi,
      {
        securityLevel: 'standard',
        spkDeletionPolicy: 'after-sync',
        clearCacheOnRotation: false,
      }
    );

    expect(result.rotated).toBe(false);
    expect(result.nextRotationMs).toBeGreaterThan(0);
    expect(identityApi.uploadPreKeys).not.toHaveBeenCalled();
  });

  test('checkAndRotateSpk rotates when SPK is overdue', async () => {
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(); // 8 days old (standard = 7d)
    getActiveSignedPreKeyMock
      .mockResolvedValueOnce({ keyId: 'spk-old', createdAt })
      .mockResolvedValueOnce({ keyId: 'spk-old', createdAt });

    const identityApi = {
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    const result = await preKeyService.checkAndRotateSpk(
      {
        identityId: 'identity-1',
        deviceId: 'device-1',
        signingPrivateKey,
        wrappingKey,
      },
      identityApi,
      {
        securityLevel: 'standard',
        spkDeletionPolicy: 'after-sync',
        clearCacheOnRotation: false,
      }
    );

    expect(result.rotated).toBe(true);
    expect(result.newKeyId).toBeDefined();
    expect(retireSignedPreKeyMock).toHaveBeenCalledWith('spk-old', 'identity-1');
    expect(storeSignedPreKeyMock).toHaveBeenCalledTimes(1);
    expect(identityApi.uploadPreKeys).toHaveBeenCalledTimes(1);
  });

  test('cleanupRetiredSpks timed policy deletes keys older than rotation interval', async () => {
    const now = Date.now();
    getRetiredSignedPreKeysMock.mockResolvedValueOnce([
      { keyId: 'spk-young', retiredAt: new Date(now - 30 * 60 * 1000).toISOString() },
      { keyId: 'spk-old', retiredAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() },
    ]);

    const deleted = await preKeyService.cleanupRetiredSpks(
      'identity-1',
      'device-1',
      {
        securityLevel: 'maximum', // 1h
        spkDeletionPolicy: 'timed',
        clearCacheOnRotation: false,
      }
    );

    expect(deleted).toBe(1);
    expect(deleteSignedPreKeyMock).toHaveBeenCalledWith('spk-old', 'identity-1');
  });

  test('cleanupRetiredSpks after-sync enforces max-retained cap', async () => {
    const base = Date.now() - 60 * 1000;
    const retired = Array.from({ length: 8 }, (_, i) => ({
      keyId: `spk-${i + 1}`,
      retiredAt: new Date(base + i * 1000).toISOString(),
    }));

    getRetiredSignedPreKeysMock
      .mockResolvedValueOnce(retired)
      .mockResolvedValueOnce(retired); // re-read after hard-cap step

    const deleted = await preKeyService.cleanupRetiredSpks(
      'identity-1',
      'device-1',
      {
        securityLevel: 'standard', // maxRetiredSpks = 5
        spkDeletionPolicy: 'after-sync',
        clearCacheOnRotation: false,
      }
    );

    expect(deleted).toBe(3);
    expect(deleteSignedPreKeyMock).toHaveBeenCalledTimes(3);
    expect(deleteSignedPreKeyMock).toHaveBeenNthCalledWith(1, 'spk-1', 'identity-1');
    expect(deleteSignedPreKeyMock).toHaveBeenNthCalledWith(2, 'spk-2', 'identity-1');
    expect(deleteSignedPreKeyMock).toHaveBeenNthCalledWith(3, 'spk-3', 'identity-1');
  });

  test('checkAndReplenishOtpks skips when threshold is satisfied', async () => {
    const identityApi = {
      getPreKeyCount: mock(async () => ({
        success: true,
        data: {
          signedPreKey: null,
          oneTimePreKeysRemaining: 50,
        },
      })),
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    const uploaded = await preKeyService.checkAndReplenishOtpks(
      {
        identityId: 'identity-1',
        deviceId: 'device-1',
        signingPrivateKey,
        wrappingKey,
        platform: 'desktop',
      },
      identityApi
    );

    expect(uploaded).toBe(0);
    expect(identityApi.uploadPreKeys).not.toHaveBeenCalled();
  });

  test('checkAndReplenishOtpks uploads new OTPKs when below threshold', async () => {
    const identityApi = {
      getPreKeyCount: mock(async () => ({
        success: true,
        data: {
          signedPreKey: null,
          oneTimePreKeysRemaining: 2,
        },
      })),
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    const uploaded = await preKeyService.checkAndReplenishOtpks(
      {
        identityId: 'identity-1',
        deviceId: 'device-1',
        signingPrivateKey,
        wrappingKey,
        platform: 'web',
      },
      identityApi
    );

    expect(uploaded).toBe(10); // web batch size
    expect(storeOneTimePreKeysMock).toHaveBeenCalledTimes(1);
    expect(identityApi.uploadPreKeys).toHaveBeenCalledTimes(1);
  });

  test('load/save FS config merges defaults and persists', () => {
    const store = new Map<string, string>();
    const localStorageMock = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };

    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    });

    const identityId = 'identity-1';
    preKeyService.saveFsConfig(identityId, {
      securityLevel: 'high',
      spkDeletionPolicy: 'timed',
      clearCacheOnRotation: false,
    });

    const loaded = preKeyService.loadFsConfig(identityId);
    expect(loaded.securityLevel).toBe('high');
    expect(loaded.spkDeletionPolicy).toBe('timed');
  });
});
