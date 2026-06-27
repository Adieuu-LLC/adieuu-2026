/**
 * Regression tests for the passphrase-change → device-key-recovery flow.
 *
 * When a user changes their alias passphrase (especially from account mode),
 * existing device keys stored in IndexedDB become un-decryptable because
 * they were wrapped with a key derived from the OLD passphrase. The login/
 * unlock flows must gracefully regenerate device keys rather than treating
 * this as a fatal authentication failure.
 *
 * These tests exercise the full device key lifecycle across passphrase changes
 * using real crypto (no mocks) to guarantee correctness.
 */
import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import {
  storeDeviceKeys,
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
  hasDeviceKeys,
  deleteAllDeviceKeysForIdentity,
  clearAllDeviceKeys,
  getOrCreateWrappingSalt,
  reWrapDeviceKeys,
  DeviceKeyStorageError,
} from './deviceKeyStorage';
import { randomBytes, deriveEntropyWrappingKey } from '@adieuu/crypto';

const IDENTITY_ID = 'test-identity-passphrase-change';
const OLD_PASSPHRASE = 'old-secret-passphrase-2024';
const NEW_PASSPHRASE = 'new-secret-passphrase-2025';

async function deriveWrappingKeyForPassphrase(passphrase: string, identityId: string) {
  const salt = await getOrCreateWrappingSalt(identityId);
  return deriveEntropyWrappingKey(passphrase, salt);
}

async function storeTestDeviceKeys(identityId: string, wrappingKey: Uint8Array) {
  const deviceId = crypto.randomUUID();
  const ecdhPrivateKey = randomBytes(32);
  const kemPrivateKey = randomBytes(2400);

  await storeDeviceKeys(deviceId, identityId, ecdhPrivateKey, kemPrivateKey, wrappingKey);
  return deviceId;
}

describe('device key recovery after passphrase change', () => {
  beforeEach(async () => {
    try { await clearAllDeviceKeys(); } catch { /* db might not exist */ }
  });

  afterEach(async () => {
    try { await clearAllDeviceKeys(); } catch { /* ignore */ }
  });

  test('device keys stored with old passphrase CANNOT be decrypted with new passphrase wrapping key', async () => {
    const oldWrappingKey = await deriveWrappingKeyForPassphrase(OLD_PASSPHRASE, IDENTITY_ID);
    await storeTestDeviceKeys(IDENTITY_ID, oldWrappingKey);

    const newWrappingKey = await deriveWrappingKeyForPassphrase(NEW_PASSPHRASE, IDENTITY_ID);
    const storedKeys = await getDeviceKeysForIdentity(IDENTITY_ID);
    expect(storedKeys.length).toBe(1);

    await expect(
      decryptDeviceKeys(storedKeys[0]!, newWrappingKey)
    ).rejects.toThrow(DeviceKeyStorageError);
  });

  test('deleteAllDeviceKeysForIdentity clears stale keys after passphrase change', async () => {
    const oldWrappingKey = await deriveWrappingKeyForPassphrase(OLD_PASSPHRASE, IDENTITY_ID);
    await storeTestDeviceKeys(IDENTITY_ID, oldWrappingKey);
    await storeTestDeviceKeys(IDENTITY_ID, oldWrappingKey);

    expect(await hasDeviceKeys(IDENTITY_ID)).toBe(true);
    const keysBeforeClear = await getDeviceKeysForIdentity(IDENTITY_ID);
    expect(keysBeforeClear.length).toBe(2);

    const deleted = await deleteAllDeviceKeysForIdentity(IDENTITY_ID);
    expect(deleted).toBe(2);
    expect(await hasDeviceKeys(IDENTITY_ID)).toBe(false);
  });

  test('fresh device keys can be stored and decrypted with new passphrase after clearing stale ones', async () => {
    // Simulate: device keys stored with old passphrase
    const oldWrappingKey = await deriveWrappingKeyForPassphrase(OLD_PASSPHRASE, IDENTITY_ID);
    await storeTestDeviceKeys(IDENTITY_ID, oldWrappingKey);

    // Simulate: passphrase changed, old keys can't decrypt
    const newWrappingKey = await deriveWrappingKeyForPassphrase(NEW_PASSPHRASE, IDENTITY_ID);
    const staleKeys = await getDeviceKeysForIdentity(IDENTITY_ID);
    await expect(decryptDeviceKeys(staleKeys[0]!, newWrappingKey)).rejects.toThrow();

    // Simulate: login flow clears stale keys
    await deleteAllDeviceKeysForIdentity(IDENTITY_ID);

    // Simulate: login flow generates and stores fresh keys with new wrapping key
    const newDeviceId = await storeTestDeviceKeys(IDENTITY_ID, newWrappingKey);

    // Verify: fresh keys decrypt correctly with new wrapping key
    const freshKeys = await getDeviceKeysForIdentity(IDENTITY_ID);
    expect(freshKeys.length).toBe(1);
    const decrypted = await decryptDeviceKeys(freshKeys[0]!, newWrappingKey);
    expect(decrypted.deviceId).toBe(newDeviceId);
    expect(decrypted.ecdhPrivateKey).toBeInstanceOf(Uint8Array);
    expect(decrypted.ecdhPrivateKey.length).toBe(32);
    expect(decrypted.kemPrivateKey).toBeInstanceOf(Uint8Array);
    expect(decrypted.kemPrivateKey.length).toBe(2400);
  });

  test('full passphrase change recovery flow (end-to-end simulation)', async () => {
    // Step 1: Initial alias login — device keys stored with wrapping key from original passphrase
    const oldWrappingKey = await deriveWrappingKeyForPassphrase(OLD_PASSPHRASE, IDENTITY_ID);
    const originalDeviceId = await storeTestDeviceKeys(IDENTITY_ID, oldWrappingKey);

    // Verify original keys work
    const originalStored = await getDeviceKeysForIdentity(IDENTITY_ID);
    const originalDecrypted = await decryptDeviceKeys(originalStored[0]!, oldWrappingKey);
    expect(originalDecrypted.deviceId).toBe(originalDeviceId);

    // Step 2: Passphrase changed from account mode (device keys NOT re-wrapped)
    // This is the critical scenario — no re-wrapping happens because
    // ChangePassphrasePanel has identity=null in account mode.

    // Step 3: Login with new passphrase
    const newWrappingKey = await deriveWrappingKeyForPassphrase(NEW_PASSPHRASE, IDENTITY_ID);

    // Step 3a: Try to decrypt existing device keys → FAILS
    const staleKeys = await getDeviceKeysForIdentity(IDENTITY_ID);
    expect(staleKeys.length).toBe(1);
    let decryptionFailed = false;
    try {
      await decryptDeviceKeys(staleKeys[0]!, newWrappingKey);
    } catch (err) {
      decryptionFailed = true;
      expect(err).toBeInstanceOf(DeviceKeyStorageError);
    }
    expect(decryptionFailed).toBe(true);

    // Step 3b: Clear stale device keys (what loginToIdentity now does)
    await deleteAllDeviceKeysForIdentity(IDENTITY_ID);
    expect(await hasDeviceKeys(IDENTITY_ID)).toBe(false);

    // Step 3c: Generate fresh device keys and store with new wrapping key
    const freshDeviceId = await storeTestDeviceKeys(IDENTITY_ID, newWrappingKey);

    // Step 4: Verify fresh keys are functional
    const freshStored = await getDeviceKeysForIdentity(IDENTITY_ID);
    expect(freshStored.length).toBe(1);
    const freshDecrypted = await decryptDeviceKeys(freshStored[0]!, newWrappingKey);
    expect(freshDecrypted.deviceId).toBe(freshDeviceId);
    expect(freshDecrypted.ecdhPrivateKey.length).toBe(32);
    expect(freshDecrypted.kemPrivateKey.length).toBe(2400);
  });

  test('reWrapDeviceKeys allows decryption with new key and prevents decryption with old key', async () => {
    // This covers the identity-mode path where re-wrapping IS performed
    const oldWrappingKey = await deriveWrappingKeyForPassphrase(OLD_PASSPHRASE, IDENTITY_ID);
    const deviceId = await storeTestDeviceKeys(IDENTITY_ID, oldWrappingKey);

    const newWrappingKey = await deriveWrappingKeyForPassphrase(NEW_PASSPHRASE, IDENTITY_ID);
    const reWrapped = await reWrapDeviceKeys(IDENTITY_ID, oldWrappingKey, newWrappingKey);
    expect(reWrapped).toBe(1);

    // New wrapping key works
    const stored = await getDeviceKeysForIdentity(IDENTITY_ID);
    const decrypted = await decryptDeviceKeys(stored[0]!, newWrappingKey);
    expect(decrypted.deviceId).toBe(deviceId);

    // Old wrapping key fails
    await expect(
      decryptDeviceKeys(stored[0]!, oldWrappingKey)
    ).rejects.toThrow(DeviceKeyStorageError);
  });

  test('wrapping salt persists across passphrase changes (deterministic derivation)', async () => {
    // The wrapping salt is per-identity and does NOT change when the passphrase changes.
    // This is critical: same salt + new passphrase = different wrapping key.
    const salt1 = await getOrCreateWrappingSalt(IDENTITY_ID);
    const salt2 = await getOrCreateWrappingSalt(IDENTITY_ID);
    expect(new Uint8Array(salt1)).toEqual(new Uint8Array(salt2));

    // Different passphrases with same salt → different wrapping keys
    const key1 = await deriveEntropyWrappingKey(OLD_PASSPHRASE, salt1);
    const key2 = await deriveEntropyWrappingKey(NEW_PASSPHRASE, salt2);
    expect(new Uint8Array(key1)).not.toEqual(new Uint8Array(key2));
  });

  test('deleteAllDeviceKeysForIdentity does not affect other identities', async () => {
    const otherIdentityId = 'other-identity-unaffected';
    const wrappingKey = await deriveWrappingKeyForPassphrase(OLD_PASSPHRASE, IDENTITY_ID);
    const otherWrappingKey = await deriveWrappingKeyForPassphrase(OLD_PASSPHRASE, otherIdentityId);

    await storeTestDeviceKeys(IDENTITY_ID, wrappingKey);
    const otherDeviceId = await storeTestDeviceKeys(otherIdentityId, otherWrappingKey);

    // Clear only the target identity
    await deleteAllDeviceKeysForIdentity(IDENTITY_ID);

    // Target identity cleared
    expect(await hasDeviceKeys(IDENTITY_ID)).toBe(false);

    // Other identity untouched
    expect(await hasDeviceKeys(otherIdentityId)).toBe(true);
    const otherKeys = await getDeviceKeysForIdentity(otherIdentityId);
    const decrypted = await decryptDeviceKeys(otherKeys[0]!, otherWrappingKey);
    expect(decrypted.deviceId).toBe(otherDeviceId);
  });

  test('multiple sequential passphrase changes with recovery each time', async () => {
    const passphrases = [
      'passphrase-generation-1',
      'passphrase-generation-2',
      'passphrase-generation-3',
    ];

    // Initial store with first passphrase
    let currentWrappingKey = await deriveWrappingKeyForPassphrase(passphrases[0]!, IDENTITY_ID);
    let currentDeviceId = await storeTestDeviceKeys(IDENTITY_ID, currentWrappingKey);

    for (let i = 1; i < passphrases.length; i++) {
      // Simulate passphrase change (no re-wrap)
      const newWrappingKey = await deriveWrappingKeyForPassphrase(passphrases[i]!, IDENTITY_ID);

      // Old keys fail to decrypt with new key
      const staleKeys = await getDeviceKeysForIdentity(IDENTITY_ID);
      await expect(decryptDeviceKeys(staleKeys[0]!, newWrappingKey)).rejects.toThrow();

      // Recovery: clear and regenerate
      await deleteAllDeviceKeysForIdentity(IDENTITY_ID);
      currentDeviceId = await storeTestDeviceKeys(IDENTITY_ID, newWrappingKey);
      currentWrappingKey = newWrappingKey;

      // Verify new keys work
      const freshKeys = await getDeviceKeysForIdentity(IDENTITY_ID);
      const decrypted = await decryptDeviceKeys(freshKeys[0]!, currentWrappingKey);
      expect(decrypted.deviceId).toBe(currentDeviceId);
    }
  });

  test('decryptDeviceKeys throws DeviceKeyStorageError (not generic Error) on wrong key', async () => {
    const wrappingKey = await deriveWrappingKeyForPassphrase(OLD_PASSPHRASE, IDENTITY_ID);
    await storeTestDeviceKeys(IDENTITY_ID, wrappingKey);

    const wrongKey = randomBytes(32);
    const stored = await getDeviceKeysForIdentity(IDENTITY_ID);

    try {
      await decryptDeviceKeys(stored[0]!, wrongKey);
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(DeviceKeyStorageError);
      expect((err as DeviceKeyStorageError).message).toContain('decrypt');
    }
  });
});
