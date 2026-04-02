import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const realPreKeyStorage = await import('./preKeyStorage');

const realStoreSignedPreKey = realPreKeyStorage.storeSignedPreKey;
const realStoreOneTimePreKeys = realPreKeyStorage.storeOneTimePreKeys;
const realGetActiveSignedPreKey = realPreKeyStorage.getActiveSignedPreKey;
const realGetRetiredSignedPreKeys = realPreKeyStorage.getRetiredSignedPreKeys;
const realRetireSignedPreKey = realPreKeyStorage.retireSignedPreKey;
const realDeleteSignedPreKey = realPreKeyStorage.deleteSignedPreKey;
const realGetOneTimePreKeyIds = realPreKeyStorage.getOneTimePreKeyIds;
const realClearOneTimePreKeysExcept = realPreKeyStorage.clearOneTimePreKeysExcept;

const storeSignedPreKeyMock = mock(realStoreSignedPreKey);
const storeOneTimePreKeysMock = mock(realStoreOneTimePreKeys);
const getActiveSignedPreKeyMock = mock(realGetActiveSignedPreKey);
const getRetiredSignedPreKeysMock = mock(realGetRetiredSignedPreKeys);
const retireSignedPreKeyMock = mock(realRetireSignedPreKey);
const deleteSignedPreKeyMock = mock(realDeleteSignedPreKey);
const getOneTimePreKeyIdsMock = mock(realGetOneTimePreKeyIds);
const clearOneTimePreKeysExceptMock = mock(realClearOneTimePreKeysExcept);

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
  getOneTimePreKeyIds: getOneTimePreKeyIdsMock,
  clearOneTimePreKeysExcept: clearOneTimePreKeysExceptMock,
}));

const preKeyService = await import('./preKeyService');

function stubMocksForIsolation(): void {
  storeSignedPreKeyMock.mockImplementation(async () => {});
  storeOneTimePreKeysMock.mockImplementation(async () => {});
  getActiveSignedPreKeyMock.mockImplementation(async () => null);
  getRetiredSignedPreKeysMock.mockImplementation(async () => []);
  retireSignedPreKeyMock.mockImplementation(async () => {});
  deleteSignedPreKeyMock.mockImplementation(async () => {});
  getOneTimePreKeyIdsMock.mockImplementation(async () => []);
  clearOneTimePreKeysExceptMock.mockImplementation(async () => 0);
}

function restoreRealImplementations(): void {
  storeSignedPreKeyMock.mockImplementation(realStoreSignedPreKey);
  storeOneTimePreKeysMock.mockImplementation(realStoreOneTimePreKeys);
  getActiveSignedPreKeyMock.mockImplementation(realGetActiveSignedPreKey);
  getRetiredSignedPreKeysMock.mockImplementation(realGetRetiredSignedPreKeys);
  retireSignedPreKeyMock.mockImplementation(realRetireSignedPreKey);
  deleteSignedPreKeyMock.mockImplementation(realDeleteSignedPreKey);
  getOneTimePreKeyIdsMock.mockImplementation(realGetOneTimePreKeyIds);
  clearOneTimePreKeysExceptMock.mockImplementation(realClearOneTimePreKeysExcept);
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
    getOneTimePreKeyIdsMock.mockReset();
    clearOneTimePreKeysExceptMock.mockReset();
    preKeyService.resetOtpkConsumedCounter();
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

  test('checkAndReplenishOtpks skips when threshold is satisfied and digests match', async () => {
    const matchingDigest = await preKeyService.computeLocalOtpkDigest('identity-1', 'device-1');

    const identityApi = {
      getPreKeyCount: mock(async () => ({
        success: true,
        data: {
          signedPreKey: null,
          oneTimePreKeysRemaining: 50,
          otpkDigest: matchingDigest,
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

  test('checkAndReplenishOtpks uploads new OTPKs when below threshold and digests match', async () => {
    const matchingDigest = await preKeyService.computeLocalOtpkDigest('identity-1', 'device-1');

    const identityApi = {
      getPreKeyCount: mock(async () => ({
        success: true,
        data: {
          signedPreKey: null,
          oneTimePreKeysRemaining: 2,
          otpkDigest: matchingDigest,
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

    expect(uploaded).toBe(25); // web batch size
    expect(storeOneTimePreKeysMock).toHaveBeenCalledTimes(1);
    expect(identityApi.uploadPreKeys).toHaveBeenCalledTimes(1);
  });

  test('checkAndReplenishOtpks triggers resync on digest mismatch', async () => {
    const identityApi = {
      getPreKeyCount: mock(async () => ({
        success: true,
        data: {
          signedPreKey: null,
          oneTimePreKeysRemaining: 50,
          otpkDigest: 'server-digest-that-does-not-match',
        },
      })),
      purgeOneTimePreKeys: mock(async () => ({
        success: true,
        data: { purged: 50, consumedKeyIds: [] },
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

    expect(uploaded).toBe(50); // desktop batch size (resync = purge + replenish)
    expect(identityApi.purgeOneTimePreKeys).toHaveBeenCalledTimes(1);
    expect(clearOneTimePreKeysExceptMock).toHaveBeenCalledTimes(1);
  });

  // ---- computeLocalOtpkDigest ----

  test('computeLocalOtpkDigest returns empty sentinel when no OTPKs exist', async () => {
    getOneTimePreKeyIdsMock.mockResolvedValue([]);

    const digest = await preKeyService.computeLocalOtpkDigest('id-1', 'dev-1');

    expect(digest).toHaveLength(64);
    // SHA-256 of empty string
    expect(digest).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  test('computeLocalOtpkDigest changes when a key is added', async () => {
    getOneTimePreKeyIdsMock.mockResolvedValue(['aaa']);
    const digest1 = await preKeyService.computeLocalOtpkDigest('id-1', 'dev-1');

    getOneTimePreKeyIdsMock.mockResolvedValue(['aaa', 'bbb']);
    const digest2 = await preKeyService.computeLocalOtpkDigest('id-1', 'dev-1');

    expect(digest1).not.toBe(digest2);
  });

  // ---- resyncOneTimePreKeys (selective purge) ----

  test('resyncOneTimePreKeys passes consumedKeyIds to clearOneTimePreKeysExcept', async () => {
    const identityApi = {
      purgeOneTimePreKeys: mock(async () => ({
        success: true,
        data: { purged: 10, consumedKeyIds: ['in-flight-1', 'in-flight-2'] },
      })),
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    await preKeyService.resyncOneTimePreKeys(
      {
        identityId: 'identity-1',
        deviceId: 'device-1',
        signingPrivateKey,
        wrappingKey,
        platform: 'desktop',
      },
      identityApi
    );

    expect(clearOneTimePreKeysExceptMock).toHaveBeenCalledWith(
      'identity-1', 'device-1', ['in-flight-1', 'in-flight-2']
    );
  });

  test('resyncOneTimePreKeys falls back to empty keep list when no consumedKeyIds', async () => {
    const identityApi = {
      purgeOneTimePreKeys: mock(async () => ({
        success: true,
        data: { purged: 5 },
      })),
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    await preKeyService.resyncOneTimePreKeys(
      {
        identityId: 'identity-1',
        deviceId: 'device-1',
        signingPrivateKey,
        wrappingKey,
        platform: 'desktop',
      },
      identityApi
    );

    expect(clearOneTimePreKeysExceptMock).toHaveBeenCalledWith(
      'identity-1', 'device-1', []
    );
  });

  // ---- Consumption counter ----

  test('notifyOtpkConsumed does not fire callback below threshold', () => {
    const callback = mock(async () => {});
    preKeyService.registerOtpkResyncCallback(callback);

    for (let i = 0; i < preKeyService.RESYNC_AFTER_N_OTPKS - 1; i++) {
      preKeyService.notifyOtpkConsumed();
    }

    expect(callback).not.toHaveBeenCalled();
  });

  test('notifyOtpkConsumed fires callback at threshold', async () => {
    const callback = mock(async () => {});
    preKeyService.registerOtpkResyncCallback(callback);

    for (let i = 0; i < preKeyService.RESYNC_AFTER_N_OTPKS; i++) {
      preKeyService.notifyOtpkConsumed();
    }

    // Callback is deferred via queueMicrotask
    await new Promise((r) => queueMicrotask(r));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('notifyOtpkConsumed resets counter after firing', async () => {
    const callback = mock(async () => {});
    preKeyService.registerOtpkResyncCallback(callback);

    for (let i = 0; i < preKeyService.RESYNC_AFTER_N_OTPKS; i++) {
      preKeyService.notifyOtpkConsumed();
    }
    await new Promise((r) => queueMicrotask(r));

    // Counter should be reset — another N-1 calls should not fire again
    for (let i = 0; i < preKeyService.RESYNC_AFTER_N_OTPKS - 1; i++) {
      preKeyService.notifyOtpkConsumed();
    }
    await new Promise((r) => queueMicrotask(r));

    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('notifyOtpkConsumed is a no-op when no callback is registered', () => {
    preKeyService.registerOtpkResyncCallback(null as unknown as () => Promise<void>);
    expect(() => {
      for (let i = 0; i < preKeyService.RESYNC_AFTER_N_OTPKS + 5; i++) {
        preKeyService.notifyOtpkConsumed();
      }
    }).not.toThrow();
  });

  test('resetOtpkConsumedCounter resets counter independently', async () => {
    const callback = mock(async () => {});
    preKeyService.registerOtpkResyncCallback(callback);

    for (let i = 0; i < preKeyService.RESYNC_AFTER_N_OTPKS - 1; i++) {
      preKeyService.notifyOtpkConsumed();
    }
    preKeyService.resetOtpkConsumedCounter();

    // One more call should NOT trigger (counter was reset)
    preKeyService.notifyOtpkConsumed();
    await new Promise((r) => queueMicrotask(r));

    expect(callback).not.toHaveBeenCalled();
  });

  // ---- FS config persistence ----

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

  // ---- generateAndUploadPreKeys ----

  test('generateAndUploadPreKeys stores SPK + OTPKs locally then uploads', async () => {
    const identityApi = {
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    const result = await preKeyService.generateAndUploadPreKeys(
      {
        identityId: 'identity-1',
        deviceId: 'device-1',
        signingPrivateKey,
        wrappingKey,
        platform: 'web',
      },
      identityApi
    );

    expect(result.signedPreKeyId).toBeTruthy();
    expect(storeSignedPreKeyMock).toHaveBeenCalledTimes(1);
    expect(storeOneTimePreKeysMock).toHaveBeenCalledTimes(1);
    expect(identityApi.uploadPreKeys).toHaveBeenCalledTimes(1);
  });

  test('generateAndUploadPreKeys returns signedPreKeyId and oneTimePreKeyCount', async () => {
    const identityApi = {
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    const result = await preKeyService.generateAndUploadPreKeys(
      {
        identityId: 'identity-1',
        deviceId: 'device-1',
        signingPrivateKey,
        wrappingKey,
        platform: 'desktop',
      },
      identityApi
    );

    expect(result.signedPreKeyId).toBeTruthy();
    expect(result.oneTimePreKeyCount).toBe(50);
  });

  test('generateAndUploadPreKeys generates 25 OTPKs on web, 50 on desktop', async () => {
    const identityApi = {
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    const webResult = await preKeyService.generateAndUploadPreKeys(
      { identityId: 'id-1', deviceId: 'd-1', signingPrivateKey, wrappingKey, platform: 'web' },
      identityApi
    );
    expect(webResult.oneTimePreKeyCount).toBe(25);

    const desktopResult = await preKeyService.generateAndUploadPreKeys(
      { identityId: 'id-2', deviceId: 'd-2', signingPrivateKey, wrappingKey, platform: 'desktop' },
      identityApi
    );
    expect(desktopResult.oneTimePreKeyCount).toBe(50);
  });

  test('generateAndUploadPreKeys throws when API upload fails', async () => {
    const identityApi = {
      uploadPreKeys: mock(async () => ({ success: false, error: { message: 'Server error' } })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    await expect(
      preKeyService.generateAndUploadPreKeys(
        { identityId: 'id-1', deviceId: 'd-1', signingPrivateKey, wrappingKey, platform: 'web' },
        identityApi
      )
    ).rejects.toThrow();
  });

  // ---- rotateSignedPreKey ----

  test('rotateSignedPreKey retires existing active SPK before generating new one', async () => {
    const createdAt = new Date().toISOString();
    getActiveSignedPreKeyMock.mockResolvedValueOnce({ keyId: 'spk-old', createdAt });

    const identityApi = {
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    const newKeyId = await preKeyService.rotateSignedPreKey(
      { identityId: 'identity-1', deviceId: 'device-1', signingPrivateKey, wrappingKey },
      identityApi
    );

    expect(retireSignedPreKeyMock).toHaveBeenCalledWith('spk-old', 'identity-1');
    expect(newKeyId).toBeTruthy();
    expect(newKeyId).not.toBe('spk-old');
  });

  test('rotateSignedPreKey stores and uploads new SPK', async () => {
    const identityApi = {
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    await preKeyService.rotateSignedPreKey(
      { identityId: 'identity-1', deviceId: 'device-1', signingPrivateKey, wrappingKey },
      identityApi
    );

    expect(storeSignedPreKeyMock).toHaveBeenCalledTimes(1);
    expect(identityApi.uploadPreKeys).toHaveBeenCalledTimes(1);
  });

  test('rotateSignedPreKey handles case where no active SPK exists', async () => {
    getActiveSignedPreKeyMock.mockResolvedValueOnce(null);

    const identityApi = {
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    const newKeyId = await preKeyService.rotateSignedPreKey(
      { identityId: 'identity-1', deviceId: 'device-1', signingPrivateKey, wrappingKey },
      identityApi
    );

    expect(retireSignedPreKeyMock).not.toHaveBeenCalled();
    expect(newKeyId).toBeTruthy();
  });

  test('rotateSignedPreKey returns the new keyId', async () => {
    const identityApi = {
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    const keyId = await preKeyService.rotateSignedPreKey(
      { identityId: 'identity-1', deviceId: 'device-1', signingPrivateKey, wrappingKey },
      identityApi
    );

    expect(typeof keyId).toBe('string');
    expect(keyId.length).toBeGreaterThan(0);
  });

  // ---- replenishOneTimePreKeys ----

  test('replenishOneTimePreKeys generates and uploads OTPKs only', async () => {
    const identityApi = {
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    const count = await preKeyService.replenishOneTimePreKeys(
      { identityId: 'identity-1', deviceId: 'device-1', signingPrivateKey, wrappingKey, platform: 'web' },
      identityApi
    );

    expect(count).toBe(25);
    expect(storeOneTimePreKeysMock).toHaveBeenCalledTimes(1);
    expect(storeSignedPreKeyMock).not.toHaveBeenCalled();
    expect(identityApi.uploadPreKeys).toHaveBeenCalledTimes(1);
  });

  test('replenishOneTimePreKeys respects platform batch size', async () => {
    const identityApi = {
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    const desktopCount = await preKeyService.replenishOneTimePreKeys(
      { identityId: 'id-1', deviceId: 'd-1', signingPrivateKey, wrappingKey, platform: 'desktop' },
      identityApi
    );
    expect(desktopCount).toBe(50);

    const webCount = await preKeyService.replenishOneTimePreKeys(
      { identityId: 'id-2', deviceId: 'd-2', signingPrivateKey, wrappingKey, platform: 'web' },
      identityApi
    );
    expect(webCount).toBe(25);
  });

  test('replenishOneTimePreKeys returns count uploaded', async () => {
    const identityApi = {
      uploadPreKeys: mock(async () => ({ success: true })),
    } as unknown as import('@adieuu/shared').IdentityApi;

    const count = await preKeyService.replenishOneTimePreKeys(
      { identityId: 'identity-1', deviceId: 'device-1', signingPrivateKey, wrappingKey, platform: 'web' },
      identityApi
    );

    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThan(0);
  });

  // ---- purgeRetiredKeys ----

  test('purgeRetiredKeys deletes all retired SPKs for a device', async () => {
    getRetiredSignedPreKeysMock.mockResolvedValueOnce([
      { keyId: 'spk-retired-1', status: 'retired', retiredAt: new Date().toISOString() },
      { keyId: 'spk-retired-2', status: 'retired', retiredAt: new Date().toISOString() },
    ]);

    const count = await preKeyService.purgeRetiredKeys('identity-1', 'device-1');

    expect(count).toBe(2);
    expect(deleteSignedPreKeyMock).toHaveBeenCalledTimes(2);
    expect(deleteSignedPreKeyMock).toHaveBeenCalledWith('spk-retired-1', 'identity-1');
    expect(deleteSignedPreKeyMock).toHaveBeenCalledWith('spk-retired-2', 'identity-1');
  });

  test('purgeRetiredKeys returns count of deleted keys', async () => {
    getRetiredSignedPreKeysMock.mockResolvedValueOnce([
      { keyId: 'spk-r', status: 'retired', retiredAt: new Date().toISOString() },
    ]);

    const count = await preKeyService.purgeRetiredKeys('identity-1', 'device-1');
    expect(count).toBe(1);
  });

  test('purgeRetiredKeys no-ops when no retired keys exist', async () => {
    getRetiredSignedPreKeysMock.mockResolvedValueOnce([]);

    const count = await preKeyService.purgeRetiredKeys('identity-1', 'device-1');
    expect(count).toBe(0);
    expect(deleteSignedPreKeyMock).not.toHaveBeenCalled();
  });

  // ---- localStorage preference helpers ----

  test('loadShowMessageArtifacts / saveShowMessageArtifacts round-trip', () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
      },
      configurable: true,
    });

    preKeyService.saveShowMessageArtifacts('id-1', true);
    expect(preKeyService.loadShowMessageArtifacts('id-1')).toBe(true);

    preKeyService.saveShowMessageArtifacts('id-1', false);
    expect(preKeyService.loadShowMessageArtifacts('id-1')).toBe(false);
  });

  test('loadShowMessageArtifacts returns false when not set', () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: (key: string) => store.get(key) ?? null, setItem: () => {}, removeItem: () => {} },
      configurable: true,
    });

    expect(preKeyService.loadShowMessageArtifacts('unknown')).toBe(false);
  });

  test('loadConversationFsDefault / saveConversationFsDefault round-trip', () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
      },
      configurable: true,
    });

    preKeyService.saveConversationFsDefault('conv-1', true);
    expect(preKeyService.loadConversationFsDefault('conv-1')).toBe(true);

    preKeyService.saveConversationFsDefault('conv-1', false);
    expect(preKeyService.loadConversationFsDefault('conv-1')).toBe(false);
  });

  test('saveConversationFsDefault with null clears the preference', () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => { store.set(key, value); },
        removeItem: (key: string) => { store.delete(key); },
      },
      configurable: true,
    });

    preKeyService.saveConversationFsDefault('conv-1', true);
    preKeyService.saveConversationFsDefault('conv-1', null);
    expect(preKeyService.loadConversationFsDefault('conv-1')).toBeNull();
  });
});
