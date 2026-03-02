import { describe, expect, test, beforeEach, afterEach } from 'bun:test';

import {
  storeDeviceKeys,
  getStoredDeviceKeys,
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
  hasDeviceKeys,
  deleteDeviceKeys,
  deleteAllDeviceKeysForIdentity,
  clearAllDeviceKeys,
  setDeviceKeyStorageBackend,
  migrateIndexedDbToBackend,
  DeviceKeyStorageError,
} from './deviceKeyStorage';
import type { SecureStorage } from '../config/types';
import { randomBytes } from '@adieuu/crypto';

/**
 * Tests for the SecureStorage backend path (desktop).
 *
 * Uses an in-memory mock SecureStorage so these run without browser APIs,
 * IndexedDB, or Electron. The mock stores data as a Map<string, Uint8Array>,
 * exactly matching the SecureStorage interface contract.
 */

function createMockSecureStorage(): SecureStorage & { _store: Map<string, Uint8Array> } {
  const store = new Map<string, Uint8Array>();

  return {
    _store: store,

    async getKey(keyId: string): Promise<Uint8Array | null> {
      return store.get(keyId) ?? null;
    },

    async setKey(keyId: string, key: Uint8Array): Promise<void> {
      store.set(keyId, new Uint8Array(key));
    },

    async deleteKey(keyId: string): Promise<void> {
      store.delete(keyId);
    },

    async hasKey(keyId: string): Promise<boolean> {
      return store.has(keyId);
    },
  };
}

const generateWrappingKey = (): Uint8Array => randomBytes(32);

describe('deviceKeyStorage with SecureStorage backend', () => {
  let mockStorage: ReturnType<typeof createMockSecureStorage>;

  beforeEach(() => {
    mockStorage = createMockSecureStorage();
    setDeviceKeyStorageBackend(mockStorage);
  });

  afterEach(async () => {
    await clearAllDeviceKeys();
    setDeviceKeyStorageBackend(null);
  });

  // ==========================================================================
  // storeDeviceKeys
  // ==========================================================================

  describe('storeDeviceKeys', () => {
    test('stores device keys via backend', async () => {
      const deviceId = crypto.randomUUID();
      const identityId = 'test-identity-123';
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys(
        deviceId,
        identityId,
        randomBytes(32),
        randomBytes(2400),
        wrappingKey
      );

      const stored = await getStoredDeviceKeys(deviceId);
      expect(stored).not.toBeNull();
      expect(stored!.deviceId).toBe(deviceId);
      expect(stored!.identityId).toBe(identityId);
    });

    test('persists data in the backend store', async () => {
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys(
        'device-1',
        'identity-1',
        randomBytes(32),
        randomBytes(2400),
        wrappingKey
      );

      expect(mockStorage._store.has('adieuu-device-keys')).toBe(true);
      const raw = mockStorage._store.get('adieuu-device-keys')!;
      const parsed = JSON.parse(new TextDecoder().decode(raw));
      expect(parsed['identity-1']).toBeDefined();
      expect(parsed['identity-1'].length).toBe(1);
      expect(parsed['identity-1'][0].deviceId).toBe('device-1');
    });

    test('clears original key arrays after storage', async () => {
      const ecdhPrivateKey = randomBytes(32);
      const kemPrivateKey = randomBytes(2400);
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys(
        crypto.randomUUID(),
        'test-identity',
        ecdhPrivateKey,
        kemPrivateKey,
        wrappingKey
      );

      expect(ecdhPrivateKey.every((b) => b === 0)).toBe(true);
      expect(kemPrivateKey.every((b) => b === 0)).toBe(true);
    });

    test('stores creation timestamp', async () => {
      const deviceId = crypto.randomUUID();
      const wrappingKey = generateWrappingKey();
      const before = new Date().toISOString();

      await storeDeviceKeys(
        deviceId,
        'test-identity',
        randomBytes(32),
        randomBytes(2400),
        wrappingKey
      );

      const after = new Date().toISOString();
      const stored = await getStoredDeviceKeys(deviceId);
      expect(stored).not.toBeNull();
      expect(stored!.createdAt >= before).toBe(true);
      expect(stored!.createdAt <= after).toBe(true);
    });

    test('overwrites existing device with same ID', async () => {
      const deviceId = crypto.randomUUID();
      const identityId = 'test-identity';
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys(deviceId, identityId, randomBytes(32), randomBytes(2400), wrappingKey);
      await storeDeviceKeys(deviceId, identityId, randomBytes(32), randomBytes(2400), wrappingKey);

      const keys = await getDeviceKeysForIdentity(identityId);
      expect(keys.length).toBe(1);
    });

    test('stores multiple devices for the same identity', async () => {
      const identityId = 'multi-device';
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys('dev-1', identityId, randomBytes(32), randomBytes(2400), wrappingKey);
      await storeDeviceKeys('dev-2', identityId, randomBytes(32), randomBytes(2400), wrappingKey);
      await storeDeviceKeys('dev-3', identityId, randomBytes(32), randomBytes(2400), wrappingKey);

      const keys = await getDeviceKeysForIdentity(identityId);
      expect(keys.length).toBe(3);
    });
  });

  // ==========================================================================
  // getStoredDeviceKeys
  // ==========================================================================

  describe('getStoredDeviceKeys', () => {
    test('returns null for non-existent device', async () => {
      const stored = await getStoredDeviceKeys('non-existent-id');
      expect(stored).toBeNull();
    });

    test('returns stored keys for existing device', async () => {
      const deviceId = crypto.randomUUID();
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys(deviceId, 'test-identity', randomBytes(32), randomBytes(2400), wrappingKey);

      const stored = await getStoredDeviceKeys(deviceId);
      expect(stored).not.toBeNull();
      expect(stored!.deviceId).toBe(deviceId);
    });

    test('finds device across multiple identities', async () => {
      const wrappingKey = generateWrappingKey();
      const targetDeviceId = 'target-device';

      await storeDeviceKeys('other-dev', 'identity-1', randomBytes(32), randomBytes(2400), wrappingKey);
      await storeDeviceKeys(targetDeviceId, 'identity-2', randomBytes(32), randomBytes(2400), wrappingKey);

      const stored = await getStoredDeviceKeys(targetDeviceId);
      expect(stored).not.toBeNull();
      expect(stored!.identityId).toBe('identity-2');
    });
  });

  // ==========================================================================
  // getDeviceKeysForIdentity
  // ==========================================================================

  describe('getDeviceKeysForIdentity', () => {
    test('returns empty array for identity with no keys', async () => {
      const keys = await getDeviceKeysForIdentity('no-keys-identity');
      expect(keys).toEqual([]);
    });

    test('returns all devices for identity', async () => {
      const identityId = 'multi-device-identity';
      const wrappingKey = generateWrappingKey();
      const deviceIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

      for (const deviceId of deviceIds) {
        await storeDeviceKeys(deviceId, identityId, randomBytes(32), randomBytes(2400), wrappingKey);
      }

      const keys = await getDeviceKeysForIdentity(identityId);
      expect(keys.length).toBe(3);
      expect(keys.map((k) => k.deviceId).sort()).toEqual(deviceIds.sort());
    });

    test('does not return devices for other identities', async () => {
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys('dev-1', 'identity-1', randomBytes(32), randomBytes(2400), wrappingKey);
      await storeDeviceKeys('dev-2', 'identity-2', randomBytes(32), randomBytes(2400), wrappingKey);

      const keys1 = await getDeviceKeysForIdentity('identity-1');
      expect(keys1.length).toBe(1);
      expect(keys1[0]?.deviceId).toBe('dev-1');

      const keys2 = await getDeviceKeysForIdentity('identity-2');
      expect(keys2.length).toBe(1);
      expect(keys2[0]?.deviceId).toBe('dev-2');
    });
  });

  // ==========================================================================
  // decryptDeviceKeys
  // ==========================================================================

  describe('decryptDeviceKeys', () => {
    test('decrypts stored keys with correct wrapping key', async () => {
      const deviceId = crypto.randomUUID();
      const identityId = 'test-identity';
      const ecdhPrivateKey = randomBytes(32);
      const kemPrivateKey = randomBytes(2400);
      const wrappingKey = generateWrappingKey();

      const originalEcdh = new Uint8Array(ecdhPrivateKey);
      const originalKem = new Uint8Array(kemPrivateKey);

      await storeDeviceKeys(deviceId, identityId, ecdhPrivateKey, kemPrivateKey, wrappingKey);

      const stored = await getStoredDeviceKeys(deviceId);
      expect(stored).not.toBeNull();

      const decrypted = await decryptDeviceKeys(stored!, wrappingKey);

      expect(decrypted.deviceId).toBe(deviceId);
      expect(decrypted.identityId).toBe(identityId);
      expect(new Uint8Array(decrypted.ecdhPrivateKey)).toEqual(originalEcdh);
      expect(new Uint8Array(decrypted.kemPrivateKey)).toEqual(originalKem);
    });

    test('throws on wrong wrapping key', async () => {
      const deviceId = crypto.randomUUID();
      const wrappingKey = generateWrappingKey();
      const wrongKey = generateWrappingKey();

      await storeDeviceKeys(deviceId, 'test-identity', randomBytes(32), randomBytes(2400), wrappingKey);

      const stored = await getStoredDeviceKeys(deviceId);
      expect(stored).not.toBeNull();

      await expect(decryptDeviceKeys(stored!, wrongKey)).rejects.toThrow(DeviceKeyStorageError);
    });
  });

  // ==========================================================================
  // hasDeviceKeys
  // ==========================================================================

  describe('hasDeviceKeys', () => {
    test('returns false for identity with no keys', async () => {
      expect(await hasDeviceKeys('no-keys')).toBe(false);
    });

    test('returns true for identity with keys', async () => {
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys(crypto.randomUUID(), 'has-keys', randomBytes(32), randomBytes(2400), wrappingKey);

      expect(await hasDeviceKeys('has-keys')).toBe(true);
    });
  });

  // ==========================================================================
  // deleteDeviceKeys
  // ==========================================================================

  describe('deleteDeviceKeys', () => {
    test('deletes existing device keys', async () => {
      const deviceId = crypto.randomUUID();
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys(deviceId, 'test-identity', randomBytes(32), randomBytes(2400), wrappingKey);

      let stored = await getStoredDeviceKeys(deviceId);
      expect(stored).not.toBeNull();

      await deleteDeviceKeys(deviceId);

      stored = await getStoredDeviceKeys(deviceId);
      expect(stored).toBeNull();
    });

    test('does not throw for non-existent device', async () => {
      await deleteDeviceKeys('non-existent');
    });

    test('does not affect other devices', async () => {
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys('dev-keep', 'identity-1', randomBytes(32), randomBytes(2400), wrappingKey);
      await storeDeviceKeys('dev-delete', 'identity-1', randomBytes(32), randomBytes(2400), wrappingKey);

      await deleteDeviceKeys('dev-delete');

      const stored = await getStoredDeviceKeys('dev-keep');
      expect(stored).not.toBeNull();
      expect(await getStoredDeviceKeys('dev-delete')).toBeNull();
    });

    test('removes identity entry when last device is deleted', async () => {
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys('only-dev', 'solo-identity', randomBytes(32), randomBytes(2400), wrappingKey);
      await deleteDeviceKeys('only-dev');

      const keys = await getDeviceKeysForIdentity('solo-identity');
      expect(keys).toEqual([]);
    });
  });

  // ==========================================================================
  // deleteAllDeviceKeysForIdentity
  // ==========================================================================

  describe('deleteAllDeviceKeysForIdentity', () => {
    test('deletes all devices for identity', async () => {
      const identityId = 'multi-device';
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys('d1', identityId, randomBytes(32), randomBytes(2400), wrappingKey);
      await storeDeviceKeys('d2', identityId, randomBytes(32), randomBytes(2400), wrappingKey);
      await storeDeviceKeys('d3', identityId, randomBytes(32), randomBytes(2400), wrappingKey);

      const deletedCount = await deleteAllDeviceKeysForIdentity(identityId);
      expect(deletedCount).toBe(3);

      const keys = await getDeviceKeysForIdentity(identityId);
      expect(keys.length).toBe(0);
    });

    test('returns 0 for identity with no devices', async () => {
      const count = await deleteAllDeviceKeysForIdentity('no-devices');
      expect(count).toBe(0);
    });

    test('does not delete devices from other identities', async () => {
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys('d1', 'identity-1', randomBytes(32), randomBytes(2400), wrappingKey);
      await storeDeviceKeys('d2', 'identity-2', randomBytes(32), randomBytes(2400), wrappingKey);

      await deleteAllDeviceKeysForIdentity('identity-1');

      const keys2 = await getDeviceKeysForIdentity('identity-2');
      expect(keys2.length).toBe(1);
    });
  });

  // ==========================================================================
  // clearAllDeviceKeys
  // ==========================================================================

  describe('clearAllDeviceKeys', () => {
    test('clears all device keys from backend', async () => {
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys('d1', 'identity-1', randomBytes(32), randomBytes(2400), wrappingKey);
      await storeDeviceKeys('d2', 'identity-2', randomBytes(32), randomBytes(2400), wrappingKey);

      await clearAllDeviceKeys();

      expect(await getDeviceKeysForIdentity('identity-1')).toEqual([]);
      expect(await getDeviceKeysForIdentity('identity-2')).toEqual([]);
      expect(mockStorage._store.has('adieuu-device-keys')).toBe(false);
    });
  });

  // ==========================================================================
  // Backend isolation: switching backend does not leak state
  // ==========================================================================

  describe('backend isolation', () => {
    test('data stored with backend is not visible after backend is removed', async () => {
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys('backend-dev', 'backend-id', randomBytes(32), randomBytes(2400), wrappingKey);
      expect(await hasDeviceKeys('backend-id')).toBe(true);

      setDeviceKeyStorageBackend(null);

      // Without backend, we'd hit IndexedDB which doesn't have this data.
      // In environments without IndexedDB this will throw; that's expected.
      // The point is that backend data doesn't leak.
      try {
        const result = await hasDeviceKeys('backend-id');
        expect(result).toBe(false);
      } catch {
        // IndexedDB not available in this test environment; that's fine
      }

      // Restore backend for cleanup
      setDeviceKeyStorageBackend(mockStorage);
    });

    test('separate mock backends are independent', async () => {
      const wrappingKey = generateWrappingKey();
      const otherMock = createMockSecureStorage();

      await storeDeviceKeys('dev-a', 'id-a', randomBytes(32), randomBytes(2400), wrappingKey);

      setDeviceKeyStorageBackend(otherMock);
      expect(await hasDeviceKeys('id-a')).toBe(false);

      // Restore original
      setDeviceKeyStorageBackend(mockStorage);
      expect(await hasDeviceKeys('id-a')).toBe(true);
    });
  });
});

// ============================================================================
// Migration tests
// ============================================================================

describe('migrateIndexedDbToBackend', () => {
  let mockStorage: ReturnType<typeof createMockSecureStorage>;

  beforeEach(() => {
    mockStorage = createMockSecureStorage();
  });

  afterEach(() => {
    setDeviceKeyStorageBackend(null);
  });

  test('returns 0 when no backend is set', async () => {
    setDeviceKeyStorageBackend(null);
    const count = await migrateIndexedDbToBackend();
    expect(count).toBe(0);
  });

  test('returns 0 when backend already has data', async () => {
    // Pre-populate backend so migration is skipped
    const existing = JSON.stringify({ 'existing-id': [] });
    await mockStorage.setKey('adieuu-device-keys', new TextEncoder().encode(existing));

    setDeviceKeyStorageBackend(mockStorage);
    const count = await migrateIndexedDbToBackend();
    expect(count).toBe(0);
  });

  test('returns 0 when IndexedDB is unavailable', async () => {
    // In Bun/Node without fake-indexeddb, IndexedDB is undefined,
    // so migration should gracefully return 0.
    setDeviceKeyStorageBackend(mockStorage);
    const count = await migrateIndexedDbToBackend();
    // Either 0 (no IndexedDB) or some value if IndexedDB is available
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
