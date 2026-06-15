/**
 * Tests for the identity login/unlock device key recovery logic.
 *
 * These tests verify the branching behavior that was introduced to fix
 * the critical bug where changing an alias passphrase from account mode
 * left device keys wrapped with the old passphrase, causing login to fail
 * with "Failed to decrypt ECDH key" and trigger an unwanted logout.
 *
 * The tests mock the device key storage operations to verify that the
 * correct recovery path is taken without needing full React rendering.
 */
import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { randomBytes, deriveEntropyWrappingKey } from '@adieuu/crypto';
import { DeviceKeyStorageError } from './deviceKeyStorage';

type MockApi = {
  identity: {
    getKeyBundle: ReturnType<typeof mock>;
    getPublicKeys: ReturnType<typeof mock>;
    registerDevice: ReturnType<typeof mock>;
    logout: ReturnType<typeof mock>;
  };
};

/**
 * Simulates the loginToIdentity device key handling logic.
 * Extracted from useIdentity.tsx to be testable without React.
 */
async function simulateLoginDeviceKeyFlow(params: {
  identityId: string;
  wrappingKey: Uint8Array;
  hasExistingDeviceKeys: () => Promise<boolean>;
  getDeviceKeysForIdentity: () => Promise<Array<{ deviceId: string }>>;
  decryptDeviceKeys: (stored: { deviceId: string }, wrappingKey: Uint8Array) => Promise<{ deviceId: string; ecdhPrivateKey: Uint8Array; kemPrivateKey: Uint8Array }>;
  deleteAllDeviceKeysForIdentity: () => Promise<number>;
  generateAndRegisterNewDevice: () => Promise<{ deviceId: string; success: boolean }>;
  logout: () => Promise<void>;
}) {
  const {
    identityId,
    wrappingKey,
    hasExistingDeviceKeys,
    getDeviceKeysForIdentity,
    decryptDeviceKeys,
    deleteAllDeviceKeysForIdentity,
    generateAndRegisterNewDevice,
    logout,
  } = params;

  let deviceId = '';
  const hasExisting = await hasExistingDeviceKeys();

  if (hasExisting) {
    try {
      const storedKeys = await getDeviceKeysForIdentity();
      if (storedKeys.length === 0) throw new Error('No device keys found');
      const deviceKeys = storedKeys[0]!;
      const decrypted = await decryptDeviceKeys(deviceKeys, wrappingKey);
      deviceId = decrypted.deviceId;
    } catch {
      // Recovery: clear stale keys and fall through
      try {
        await deleteAllDeviceKeysForIdentity();
      } catch {
        // Ignore clear errors
      }
    }
  }

  if (!deviceId) {
    const result = await generateAndRegisterNewDevice();
    if (!result.success) {
      return { success: false, error: 'Failed to register device', loggedOut: false };
    }
    deviceId = result.deviceId;
  }

  return { success: true, deviceId, loggedOut: false };
}

/**
 * Simulates the unlockIdentity device key handling logic.
 * Extracted from useIdentity.tsx to be testable without React.
 */
async function simulateUnlockDeviceKeyFlow(params: {
  identityId: string;
  passphrase: string;
  wrappingKey: Uint8Array;
  getDeviceKeysForIdentity: () => Promise<Array<{ deviceId: string }>>;
  decryptDeviceKeys: (stored: { deviceId: string }, wrappingKey: Uint8Array) => Promise<{ deviceId: string; ecdhPrivateKey: Uint8Array; kemPrivateKey: Uint8Array }>;
  deleteAllDeviceKeysForIdentity: () => Promise<number>;
  decryptKeyBundle: (passphrase: string) => Promise<{ success: boolean }>;
  generateAndRegisterNewDevice: () => Promise<{ deviceId: string; success: boolean }>;
}) {
  const {
    getDeviceKeysForIdentity,
    decryptDeviceKeys,
    deleteAllDeviceKeysForIdentity,
    decryptKeyBundle,
    generateAndRegisterNewDevice,
    wrappingKey,
    passphrase,
  } = params;

  let deviceId = '';
  let deviceKeysLoaded = false;

  try {
    const storedKeys = await getDeviceKeysForIdentity();
    if (storedKeys.length === 0) throw new Error('No device keys found');
    const decrypted = await decryptDeviceKeys(storedKeys[0]!, wrappingKey);
    deviceId = decrypted.deviceId;
    deviceKeysLoaded = true;
  } catch {
    // Clear stale keys, continue to bundle verification
    try {
      await deleteAllDeviceKeysForIdentity();
    } catch {
      // Ignore
    }
  }

  // Bundle decryption is the authoritative passphrase check
  const bundleResult = await decryptKeyBundle(passphrase);
  if (!bundleResult.success) {
    return { success: false, error: 'Invalid passphrase', errorCode: 'INVALID_PASSPHRASE' as const };
  }

  // If device keys weren't loaded, regenerate
  if (!deviceKeysLoaded) {
    const regResult = await generateAndRegisterNewDevice();
    if (!regResult.success) {
      return { success: false, error: 'Failed to register device', errorCode: 'DEVICE_REGISTRATION_FAILED' as const };
    }
    deviceId = regResult.deviceId;
  }

  return { success: true, deviceId };
}

describe('login device key recovery logic', () => {
  const identityId = 'test-identity';
  const wrappingKey = randomBytes(32);

  test('uses existing device keys when decryption succeeds', async () => {
    const mockDecrypt = mock(async () => ({
      deviceId: 'existing-device-123',
      ecdhPrivateKey: randomBytes(32),
      kemPrivateKey: randomBytes(2400),
    }));
    const mockDelete = mock(async () => 0);
    const mockGenerate = mock(async () => ({ deviceId: 'new-device', success: true }));

    const result = await simulateLoginDeviceKeyFlow({
      identityId,
      wrappingKey,
      hasExistingDeviceKeys: async () => true,
      getDeviceKeysForIdentity: async () => [{ deviceId: 'existing-device-123' }],
      decryptDeviceKeys: mockDecrypt,
      deleteAllDeviceKeysForIdentity: mockDelete,
      generateAndRegisterNewDevice: mockGenerate,
      logout: async () => {},
    });

    expect(result.success).toBe(true);
    expect(result.deviceId).toBe('existing-device-123');
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('regenerates device keys when decryption fails (passphrase changed)', async () => {
    const mockDecrypt = mock(async () => {
      throw new DeviceKeyStorageError('Failed to decrypt ECDH key. Check your passphrase.', 'ECDH_DECRYPTION_FAILED');
    });
    const mockDelete = mock(async () => 1);
    const mockGenerate = mock(async () => ({ deviceId: 'fresh-device-456', success: true }));

    const result = await simulateLoginDeviceKeyFlow({
      identityId,
      wrappingKey,
      hasExistingDeviceKeys: async () => true,
      getDeviceKeysForIdentity: async () => [{ deviceId: 'stale-device' }],
      decryptDeviceKeys: mockDecrypt,
      deleteAllDeviceKeysForIdentity: mockDelete,
      generateAndRegisterNewDevice: mockGenerate,
      logout: async () => {},
    });

    expect(result.success).toBe(true);
    expect(result.deviceId).toBe('fresh-device-456');
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  test('does NOT call logout when device key decryption fails', async () => {
    const mockLogout = mock(async () => {});
    const mockDecrypt = mock(async () => {
      throw new DeviceKeyStorageError('Failed to decrypt ECDH key.', 'ECDH_DECRYPTION_FAILED');
    });

    await simulateLoginDeviceKeyFlow({
      identityId,
      wrappingKey,
      hasExistingDeviceKeys: async () => true,
      getDeviceKeysForIdentity: async () => [{ deviceId: 'stale' }],
      decryptDeviceKeys: mockDecrypt,
      deleteAllDeviceKeysForIdentity: async () => 1,
      generateAndRegisterNewDevice: async () => ({ deviceId: 'new', success: true }),
      logout: mockLogout,
    });

    expect(mockLogout).not.toHaveBeenCalled();
  });

  test('generates new keys when no existing device keys found', async () => {
    const mockGenerate = mock(async () => ({ deviceId: 'brand-new-device', success: true }));

    const result = await simulateLoginDeviceKeyFlow({
      identityId,
      wrappingKey,
      hasExistingDeviceKeys: async () => false,
      getDeviceKeysForIdentity: async () => [],
      decryptDeviceKeys: mock(async () => { throw new Error('should not be called'); }),
      deleteAllDeviceKeysForIdentity: mock(async () => 0),
      generateAndRegisterNewDevice: mockGenerate,
      logout: async () => {},
    });

    expect(result.success).toBe(true);
    expect(result.deviceId).toBe('brand-new-device');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  test('handles deleteAllDeviceKeysForIdentity failure gracefully', async () => {
    const mockDelete = mock(async () => { throw new Error('IndexedDB unavailable'); });
    const mockGenerate = mock(async () => ({ deviceId: 'recovered', success: true }));

    const result = await simulateLoginDeviceKeyFlow({
      identityId,
      wrappingKey,
      hasExistingDeviceKeys: async () => true,
      getDeviceKeysForIdentity: async () => [{ deviceId: 'stale' }],
      decryptDeviceKeys: mock(async () => { throw new DeviceKeyStorageError('decrypt fail', 'FAIL'); }),
      deleteAllDeviceKeysForIdentity: mockDelete,
      generateAndRegisterNewDevice: mockGenerate,
      logout: async () => {},
    });

    // Should still succeed even if delete fails
    expect(result.success).toBe(true);
    expect(result.deviceId).toBe('recovered');
  });
});

describe('unlock device key recovery logic', () => {
  const identityId = 'test-identity';
  const wrappingKey = randomBytes(32);
  const passphrase = 'test-passphrase';

  test('uses existing device keys when decryption succeeds', async () => {
    const mockDelete = mock(async () => 0);
    const mockGenerate = mock(async () => ({ deviceId: 'new', success: true }));

    const result = await simulateUnlockDeviceKeyFlow({
      identityId,
      passphrase,
      wrappingKey,
      getDeviceKeysForIdentity: async () => [{ deviceId: 'existing-device' }],
      decryptDeviceKeys: async () => ({
        deviceId: 'existing-device',
        ecdhPrivateKey: randomBytes(32),
        kemPrivateKey: randomBytes(2400),
      }),
      deleteAllDeviceKeysForIdentity: mockDelete,
      decryptKeyBundle: async () => ({ success: true }),
      generateAndRegisterNewDevice: mockGenerate,
    });

    expect(result.success).toBe(true);
    expect(result.deviceId).toBe('existing-device');
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('regenerates device keys when bundle decrypts but device keys fail', async () => {
    const mockDelete = mock(async () => 1);
    const mockGenerate = mock(async () => ({ deviceId: 'regenerated-device', success: true }));

    const result = await simulateUnlockDeviceKeyFlow({
      identityId,
      passphrase,
      wrappingKey,
      getDeviceKeysForIdentity: async () => [{ deviceId: 'stale' }],
      decryptDeviceKeys: async () => {
        throw new DeviceKeyStorageError('Failed to decrypt ECDH key.', 'ECDH_DECRYPTION_FAILED');
      },
      deleteAllDeviceKeysForIdentity: mockDelete,
      decryptKeyBundle: async () => ({ success: true }),
      generateAndRegisterNewDevice: mockGenerate,
    });

    expect(result.success).toBe(true);
    expect(result.deviceId).toBe('regenerated-device');
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  test('returns INVALID_PASSPHRASE when both device keys AND bundle fail', async () => {
    const result = await simulateUnlockDeviceKeyFlow({
      identityId,
      passphrase,
      wrappingKey,
      getDeviceKeysForIdentity: async () => [{ deviceId: 'stale' }],
      decryptDeviceKeys: async () => {
        throw new DeviceKeyStorageError('decrypt fail', 'FAIL');
      },
      deleteAllDeviceKeysForIdentity: async () => 1,
      decryptKeyBundle: async () => ({ success: false }),
      generateAndRegisterNewDevice: async () => ({ deviceId: 'x', success: true }),
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_PASSPHRASE');
  });

  test('does NOT return INVALID_PASSPHRASE when only device keys fail but bundle succeeds', async () => {
    const result = await simulateUnlockDeviceKeyFlow({
      identityId,
      passphrase,
      wrappingKey,
      getDeviceKeysForIdentity: async () => [{ deviceId: 'stale' }],
      decryptDeviceKeys: async () => {
        throw new DeviceKeyStorageError('decrypt fail', 'FAIL');
      },
      deleteAllDeviceKeysForIdentity: async () => 1,
      decryptKeyBundle: async () => ({ success: true }),
      generateAndRegisterNewDevice: async () => ({ deviceId: 'new-dev', success: true }),
    });

    expect(result.success).toBe(true);
    expect(result.deviceId).toBe('new-dev');
  });

  test('returns DEVICE_REGISTRATION_FAILED when regeneration fails', async () => {
    const result = await simulateUnlockDeviceKeyFlow({
      identityId,
      passphrase,
      wrappingKey,
      getDeviceKeysForIdentity: async () => [{ deviceId: 'stale' }],
      decryptDeviceKeys: async () => {
        throw new DeviceKeyStorageError('decrypt fail', 'FAIL');
      },
      deleteAllDeviceKeysForIdentity: async () => 1,
      decryptKeyBundle: async () => ({ success: true }),
      generateAndRegisterNewDevice: async () => ({ deviceId: '', success: false }),
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('DEVICE_REGISTRATION_FAILED');
  });
});
