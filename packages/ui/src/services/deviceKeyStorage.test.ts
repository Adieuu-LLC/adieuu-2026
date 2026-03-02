import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test';

import {
  storeDeviceKeys,
  getStoredDeviceKeys,
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
  hasDeviceKeys,
  deleteDeviceKeys,
  deleteAllDeviceKeysForIdentity,
  clearAllDeviceKeys,
  getOrCreateWrappingSalt,
  DeviceKeyStorageError,
  type StoredDeviceKeys,
} from './deviceKeyStorage';
import { randomBytes, toBase64, fromBase64 } from '@adieuu/crypto';

/**
 * These tests require a browser environment with IndexedDB and Web Crypto.
 * When running in Node.js/Bun without browser APIs, tests will be skipped.
 *
 * In a real test environment, you would use:
 * - happy-dom or jsdom for DOM APIs
 * - fake-indexeddb for IndexedDB
 * - @peculiar/webcrypto for Web Crypto
 */

// Check if we have the required browser APIs
const hasIndexedDB = typeof globalThis.indexedDB !== 'undefined';
const hasCrypto = typeof globalThis.crypto?.subtle !== 'undefined';
const canRunTests = hasIndexedDB && hasCrypto;

const describeIfBrowser = canRunTests ? describe : describe.skip;

describeIfBrowser('services/deviceKeyStorage', () => {
  // Generate a wrapping key for tests
  const generateWrappingKey = (): Uint8Array => randomBytes(32);

  beforeEach(async () => {
    // Clear the database before each test
    if (hasIndexedDB) {
      try {
        await clearAllDeviceKeys();
      } catch {
        // Database might not exist yet
      }
    }
  });

  afterEach(async () => {
    // Clean up after tests
    if (hasIndexedDB) {
      try {
        await clearAllDeviceKeys();
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('storeDeviceKeys', () => {
    test('stores device keys successfully', async () => {
      const deviceId = crypto.randomUUID();
      const identityId = 'test-identity-123';
      const ecdhPrivateKey = randomBytes(32);
      const kemPrivateKey = randomBytes(2400);
      const wrappingKey = generateWrappingKey();

      // Store keys (this clears the original arrays)
      await storeDeviceKeys(
        deviceId,
        identityId,
        ecdhPrivateKey,
        kemPrivateKey,
        wrappingKey
      );

      // Verify stored
      const stored = await getStoredDeviceKeys(deviceId);
      expect(stored).not.toBeNull();
      expect(stored!.deviceId).toBe(deviceId);
      expect(stored!.identityId).toBe(identityId);
    });

    test('encrypts private keys before storage', async () => {
      const deviceId = crypto.randomUUID();
      const identityId = 'test-identity';
      const ecdhPrivateKey = randomBytes(32);
      const kemPrivateKey = randomBytes(2400);
      const wrappingKey = generateWrappingKey();

      // Copy keys for comparison
      const originalEcdh = new Uint8Array(ecdhPrivateKey);
      const originalKem = new Uint8Array(kemPrivateKey);

      await storeDeviceKeys(
        deviceId,
        identityId,
        ecdhPrivateKey,
        kemPrivateKey,
        wrappingKey
      );

      const stored = await getStoredDeviceKeys(deviceId);
      expect(stored).not.toBeNull();

      // Encrypted data should be different from original
      const encryptedEcdh = fromBase64(stored!.ecdhPrivateKeyEncrypted.ciphertext);
      expect(encryptedEcdh.length).not.toBe(originalEcdh.length);
    });

    test('clears original key arrays after storage', async () => {
      const deviceId = crypto.randomUUID();
      const identityId = 'test-identity';
      const ecdhPrivateKey = randomBytes(32);
      const kemPrivateKey = randomBytes(2400);
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys(
        deviceId,
        identityId,
        ecdhPrivateKey,
        kemPrivateKey,
        wrappingKey
      );

      // Original arrays should be zeroed
      expect(ecdhPrivateKey.every((b) => b === 0)).toBe(true);
      expect(kemPrivateKey.every((b) => b === 0)).toBe(true);
    });

    test('stores creation timestamp', async () => {
      const deviceId = crypto.randomUUID();
      const identityId = 'test-identity';
      const wrappingKey = generateWrappingKey();

      const beforeStore = new Date().toISOString();

      await storeDeviceKeys(
        deviceId,
        identityId,
        randomBytes(32),
        randomBytes(2400),
        wrappingKey
      );

      const afterStore = new Date().toISOString();

      const stored = await getStoredDeviceKeys(deviceId);
      expect(stored).not.toBeNull();
      expect(stored!.createdAt).toBeDefined();

      // Timestamp should be between before and after
      expect(stored!.createdAt >= beforeStore).toBe(true);
      expect(stored!.createdAt <= afterStore).toBe(true);
    });
  });

  describe('getStoredDeviceKeys', () => {
    test('returns null for non-existent device', async () => {
      const stored = await getStoredDeviceKeys('non-existent-id');
      expect(stored).toBeNull();
    });

    test('returns stored keys for existing device', async () => {
      const deviceId = crypto.randomUUID();
      const identityId = 'test-identity';
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
    });
  });

  describe('getDeviceKeysForIdentity', () => {
    test('returns empty array for identity with no keys', async () => {
      const keys = await getDeviceKeysForIdentity('no-keys-identity');
      expect(keys).toEqual([]);
    });

    test('returns all devices for identity', async () => {
      const identityId = 'multi-device-identity';
      const wrappingKey = generateWrappingKey();

      // Store 3 devices
      const deviceIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

      for (const deviceId of deviceIds) {
        await storeDeviceKeys(
          deviceId,
          identityId,
          randomBytes(32),
          randomBytes(2400),
          wrappingKey
        );
      }

      const keys = await getDeviceKeysForIdentity(identityId);
      expect(keys.length).toBe(3);
      expect(keys.map((k) => k.deviceId).sort()).toEqual(deviceIds.sort());
    });

    test('does not return devices for other identities', async () => {
      const identity1 = 'identity-1';
      const identity2 = 'identity-2';
      const wrappingKey = generateWrappingKey();

      // Store device for identity1
      const device1 = crypto.randomUUID();
      await storeDeviceKeys(device1, identity1, randomBytes(32), randomBytes(2400), wrappingKey);

      // Store device for identity2
      const device2 = crypto.randomUUID();
      await storeDeviceKeys(device2, identity2, randomBytes(32), randomBytes(2400), wrappingKey);

      const keys1 = await getDeviceKeysForIdentity(identity1);
      expect(keys1.length).toBe(1);
      expect(keys1[0]?.deviceId).toBe(device1);

      const keys2 = await getDeviceKeysForIdentity(identity2);
      expect(keys2.length).toBe(1);
      expect(keys2[0]?.deviceId).toBe(device2);
    });
  });

  describe('decryptDeviceKeys', () => {
    test('decrypts stored keys with correct wrapping key', async () => {
      const deviceId = crypto.randomUUID();
      const identityId = 'test-identity';
      const ecdhPrivateKey = randomBytes(32);
      const kemPrivateKey = randomBytes(2400);
      const wrappingKey = generateWrappingKey();

      // Copy for comparison
      const originalEcdh = new Uint8Array(ecdhPrivateKey);
      const originalKem = new Uint8Array(kemPrivateKey);

      await storeDeviceKeys(
        deviceId,
        identityId,
        ecdhPrivateKey,
        kemPrivateKey,
        wrappingKey
      );

      const stored = await getStoredDeviceKeys(deviceId);
      expect(stored).not.toBeNull();

      const decrypted = await decryptDeviceKeys(stored!, wrappingKey);

      expect(decrypted.deviceId).toBe(deviceId);
      expect(decrypted.identityId).toBe(identityId);

      // Decrypted keys should match originals
      expect(decrypted.ecdhPrivateKey.length).toBe(originalEcdh.length);
      expect(decrypted.kemPrivateKey.length).toBe(originalKem.length);

      // Compare byte-by-byte
      for (let i = 0; i < originalEcdh.length; i++) {
        expect(decrypted.ecdhPrivateKey[i]).toBe(originalEcdh[i]);
      }
      for (let i = 0; i < originalKem.length; i++) {
        expect(decrypted.kemPrivateKey[i]).toBe(originalKem[i]);
      }
    });

    test('throws on wrong wrapping key', async () => {
      const deviceId = crypto.randomUUID();
      const identityId = 'test-identity';
      const wrappingKey = generateWrappingKey();
      const wrongKey = generateWrappingKey();

      await storeDeviceKeys(
        deviceId,
        identityId,
        randomBytes(32),
        randomBytes(2400),
        wrappingKey
      );

      const stored = await getStoredDeviceKeys(deviceId);
      expect(stored).not.toBeNull();

      await expect(decryptDeviceKeys(stored!, wrongKey)).rejects.toThrow(
        DeviceKeyStorageError
      );
    });
  });

  describe('hasDeviceKeys', () => {
    test('returns false for identity with no keys', async () => {
      const result = await hasDeviceKeys('no-keys');
      expect(result).toBe(false);
    });

    test('returns true for identity with keys', async () => {
      const identityId = 'has-keys';
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys(
        crypto.randomUUID(),
        identityId,
        randomBytes(32),
        randomBytes(2400),
        wrappingKey
      );

      const result = await hasDeviceKeys(identityId);
      expect(result).toBe(true);
    });
  });

  describe('deleteDeviceKeys', () => {
    test('deletes existing device keys', async () => {
      const deviceId = crypto.randomUUID();
      const identityId = 'test-identity';
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys(
        deviceId,
        identityId,
        randomBytes(32),
        randomBytes(2400),
        wrappingKey
      );

      // Verify exists
      let stored = await getStoredDeviceKeys(deviceId);
      expect(stored).not.toBeNull();

      // Delete
      await deleteDeviceKeys(deviceId);

      // Verify deleted
      stored = await getStoredDeviceKeys(deviceId);
      expect(stored).toBeNull();
    });

    test('does not throw for non-existent device', async () => {
      // Should not throw
      await deleteDeviceKeys('non-existent');
    });
  });

  describe('deleteAllDeviceKeysForIdentity', () => {
    test('deletes all devices for identity', async () => {
      const identityId = 'multi-device';
      const wrappingKey = generateWrappingKey();

      // Store 3 devices
      const deviceIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

      for (const deviceId of deviceIds) {
        await storeDeviceKeys(
          deviceId,
          identityId,
          randomBytes(32),
          randomBytes(2400),
          wrappingKey
        );
      }

      // Verify all exist
      let keys = await getDeviceKeysForIdentity(identityId);
      expect(keys.length).toBe(3);

      // Delete all
      const deletedCount = await deleteAllDeviceKeysForIdentity(identityId);
      expect(deletedCount).toBe(3);

      // Verify all deleted
      keys = await getDeviceKeysForIdentity(identityId);
      expect(keys.length).toBe(0);
    });

    test('returns 0 for identity with no devices', async () => {
      const count = await deleteAllDeviceKeysForIdentity('no-devices');
      expect(count).toBe(0);
    });

    test('does not delete devices from other identities', async () => {
      const identity1 = 'identity-1';
      const identity2 = 'identity-2';
      const wrappingKey = generateWrappingKey();

      // Store devices for both identities
      await storeDeviceKeys(
        crypto.randomUUID(),
        identity1,
        randomBytes(32),
        randomBytes(2400),
        wrappingKey
      );
      await storeDeviceKeys(
        crypto.randomUUID(),
        identity2,
        randomBytes(32),
        randomBytes(2400),
        wrappingKey
      );

      // Delete identity1's devices
      await deleteAllDeviceKeysForIdentity(identity1);

      // identity2's devices should still exist
      const keys2 = await getDeviceKeysForIdentity(identity2);
      expect(keys2.length).toBe(1);
    });
  });

  describe('clearAllDeviceKeys', () => {
    test('clears all device keys', async () => {
      const wrappingKey = generateWrappingKey();

      // Store multiple devices across identities
      await storeDeviceKeys(
        crypto.randomUUID(),
        'identity-1',
        randomBytes(32),
        randomBytes(2400),
        wrappingKey
      );
      await storeDeviceKeys(
        crypto.randomUUID(),
        'identity-2',
        randomBytes(32),
        randomBytes(2400),
        wrappingKey
      );

      // Clear all
      await clearAllDeviceKeys();

      // Verify all cleared
      const keys1 = await getDeviceKeysForIdentity('identity-1');
      const keys2 = await getDeviceKeysForIdentity('identity-2');

      expect(keys1.length).toBe(0);
      expect(keys2.length).toBe(0);
    });
  });

  describe('getOrCreateWrappingSalt', () => {
    test('creates and returns a salt when none exists', async () => {
      const salt = await getOrCreateWrappingSalt('identity-new');
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBeGreaterThan(0);
    });

    test('returns the same salt on subsequent calls', async () => {
      const identityId = 'identity-stable';
      const salt1 = await getOrCreateWrappingSalt(identityId);
      const salt2 = await getOrCreateWrappingSalt(identityId);
      expect(new Uint8Array(salt1)).toEqual(new Uint8Array(salt2));
    });

    test('returns different salts for different identities', async () => {
      const salt1 = await getOrCreateWrappingSalt('identity-a');
      const salt2 = await getOrCreateWrappingSalt('identity-b');
      expect(new Uint8Array(salt1)).not.toEqual(new Uint8Array(salt2));
    });
  });

  describe('DeviceKeyStorageError', () => {
    test('is instanceof Error', () => {
      const error = new DeviceKeyStorageError('test', 'TEST_CODE');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DeviceKeyStorageError);
    });

    test('has correct properties', () => {
      const error = new DeviceKeyStorageError('test message', 'TEST_CODE');
      expect(error.message).toBe('test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('DeviceKeyStorageError');
    });
  });
});

// Tests that can run without browser APIs
describe('services/deviceKeyStorage (unit)', () => {
  describe('DeviceKeyStorageError', () => {
    test('is instanceof Error', () => {
      const error = new DeviceKeyStorageError('test', 'TEST_CODE');
      expect(error).toBeInstanceOf(Error);
    });

    test('preserves error code', () => {
      const error = new DeviceKeyStorageError('message', 'MY_ERROR_CODE');
      expect(error.code).toBe('MY_ERROR_CODE');
    });
  });
});
