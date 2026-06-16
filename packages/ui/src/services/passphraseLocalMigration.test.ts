/**
 * Phase 1 tests for the passphrase-change local re-wrap orchestrator.
 *
 * These verify the core guarantee: after a passphrase change, all locally
 * stored cryptographic material (device keys, signed/one-time pre-keys,
 * persisted session keys, and cipher entropy) is re-wrapped from the old
 * wrapping key to the new one so message history stays decryptable, while the
 * underlying key material is unchanged.
 *
 * Real crypto, no mocks. Runs against fake-indexeddb (web backend).
 */
import { describe, expect, test, beforeEach } from 'bun:test';
import {
  storeDeviceKeys,
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
  getOrCreateWrappingSalt,
  reWrapDeviceKeys,
  DeviceKeyStorageError,
} from './deviceKeyStorage';
import {
  storeSignedPreKey,
  getActiveSignedPreKey,
  decryptSignedPreKey,
  retireSignedPreKey,
  getRetiredSignedPreKeys,
  storeOneTimePreKeys,
  findAndDecryptOneTimePreKey,
  storeSessionKey,
  getPersistedSessionKey,
} from './preKeyStorage';
import { getStoredCiphers, saveStoredCipher } from './cipherStoreDb';
import { reWrapPassphraseProtectedStores } from './passphraseLocalMigration';
import type { StoredCipher } from '../hooks/useCipherStore';
import {
  randomBytes,
  deriveEntropyWrappingKey,
  wrapEntropy,
  unwrapEntropy,
  type EntropyPiece,
} from '@adieuu/crypto';

const OLD_PASSPHRASE = 'old-secret-passphrase-2024';
const NEW_PASSPHRASE = 'new-secret-passphrase-2025';

const DB_NAMES = [
  'adieuu-device-keys',
  'adieuu-pre-keys',
  'adieuu-session-keys',
  'adieuu-wrapping-keys',
  'adieuu-ciphers',
];

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

async function wipeAll(): Promise<void> {
  for (const name of DB_NAMES) await deleteDb(name);
}

async function deriveKeyFor(passphrase: string, identityId: string): Promise<Uint8Array> {
  const salt = await getOrCreateWrappingSalt(identityId);
  return deriveEntropyWrappingKey(passphrase, salt);
}

const ENTROPY_PIECES: EntropyPiece[] = [{ type: 'text', value: 'shared-secret-entropy' }];

interface SeedHandles {
  deviceId: string;
  spkId: string;
  otpkId: string;
  messageId: string;
  cipherId: string;
}

/**
 * Seeds one stored item in every passphrase-protected category for an identity,
 * all wrapped with the given wrapping key.
 */
async function seedAllStores(identityId: string, wrappingKey: Uint8Array): Promise<SeedHandles> {
  const deviceId = crypto.randomUUID();
  await storeDeviceKeys(deviceId, identityId, randomBytes(32), randomBytes(2400), wrappingKey);

  const spkId = crypto.randomUUID();
  await storeSignedPreKey(spkId, identityId, deviceId, randomBytes(32), randomBytes(2400), wrappingKey);

  const otpkId = crypto.randomUUID();
  await storeOneTimePreKeys(
    [{ keyId: otpkId, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) }],
    identityId,
    deviceId,
    wrappingKey,
  );

  const messageId = crypto.randomUUID();
  await storeSessionKey(messageId, identityId, randomBytes(32), wrappingKey, spkId);

  const salt = await getOrCreateWrappingSalt(identityId);
  const encryptedEntropy = await wrapEntropy(ENTROPY_PIECES, wrappingKey, salt);
  const cipherId = crypto.randomUUID();
  const cipher: StoredCipher = {
    id: cipherId,
    name: 'test-cipher',
    identityId,
    encryptedEntropy,
    cipherId: 'cid-' + cipherId.slice(0, 8),
    shortId: cipherId.slice(0, 6),
    profile: 'default',
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };
  await saveStoredCipher(cipher);

  return { deviceId, spkId, otpkId, messageId, cipherId };
}

async function expectAllDecryptableWith(
  identityId: string,
  handles: SeedHandles,
  wrappingKey: Uint8Array,
): Promise<void> {
  const devices = await getDeviceKeysForIdentity(identityId);
  const device = devices.find((d) => d.deviceId === handles.deviceId)!;
  const decryptedDevice = await decryptDeviceKeys(device, wrappingKey);
  expect(decryptedDevice.ecdhPrivateKey.length).toBe(32);

  const spk = await getActiveSignedPreKey(identityId, handles.deviceId);
  expect(spk).not.toBeNull();
  const decryptedSpk = await decryptSignedPreKey(spk!, wrappingKey);
  expect(decryptedSpk.ecdhPrivateKey.length).toBe(32);

  const otpk = await findAndDecryptOneTimePreKey(handles.otpkId, identityId, wrappingKey);
  expect(otpk).not.toBeNull();
  expect(otpk!.ecdhPrivateKey.length).toBe(32);

  const sessionKey = await getPersistedSessionKey(handles.messageId, identityId, wrappingKey);
  expect(sessionKey).not.toBeNull();
  expect(sessionKey!.length).toBe(32);

  const ciphers = await getStoredCiphers(identityId);
  const cipher = ciphers.find((c) => c.id === handles.cipherId)!;
  const entropy = await unwrapEntropy(cipher.encryptedEntropy, wrappingKey);
  expect(entropy[0]!.value).toBe(ENTROPY_PIECES[0]!.value);
}

describe('reWrapPassphraseProtectedStores - direct mode', () => {
  beforeEach(async () => { await wipeAll(); });

  test('re-wraps every category so the new key works and the old key no longer does', async () => {
    const identityId = 'identity-direct';
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE, identityId);
    const handles = await seedAllStores(identityId, oldKey);

    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      identityId,
      oldWrappingKey: oldKey,
    });

    expect(result.status).toBe('migrated');
    expect(result.identityId).toBe(identityId);
    expect(result.newWrappingKey).toBeInstanceOf(Uint8Array);
    expect(result.counts).toEqual({
      deviceKeys: 1,
      signedPreKeys: 1,
      oneTimePreKeys: 1,
      sessionKeys: 1,
      ciphers: 1,
    });

    // Everything decrypts with the new key.
    const newKey = result.newWrappingKey!;
    await expectAllDecryptableWith(identityId, handles, newKey);

    // The old key can no longer read device keys.
    const devices = await getDeviceKeysForIdentity(identityId);
    await expect(decryptDeviceKeys(devices[0]!, oldKey)).rejects.toThrow(DeviceKeyStorageError);
  });

  test('is idempotent: a second run re-wraps nothing and data stays decryptable', async () => {
    const identityId = 'identity-idempotent';
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE, identityId);
    const handles = await seedAllStores(identityId, oldKey);

    const first = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      identityId,
      oldWrappingKey: oldKey,
    });
    expect(first.status).toBe('migrated');
    const newKey = first.newWrappingKey!;

    // Run again with the SAME old key (simulating a retry after partial commit).
    const second = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      identityId,
      oldWrappingKey: oldKey,
    });
    expect(second.status).toBe('migrated');
    expect(second.counts).toEqual({
      deviceKeys: 0,
      signedPreKeys: 0,
      oneTimePreKeys: 0,
      sessionKeys: 0,
      ciphers: 0,
    });

    await expectAllDecryptableWith(identityId, handles, newKey);
  });

  test('does not touch other identities stored on the same device', async () => {
    const targetId = 'identity-target';
    const otherId = 'identity-other';
    const targetOldKey = await deriveKeyFor(OLD_PASSPHRASE, targetId);
    const otherKey = await deriveKeyFor(OLD_PASSPHRASE, otherId);

    await seedAllStores(targetId, targetOldKey);
    const otherHandles = await seedAllStores(otherId, otherKey);

    await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      identityId: targetId,
      oldWrappingKey: targetOldKey,
    });

    // The other identity is untouched: still decryptable with its original key.
    await expectAllDecryptableWith(otherId, otherHandles, otherKey);
  });
});

describe('reWrapPassphraseProtectedStores - discovery mode', () => {
  beforeEach(async () => { await wipeAll(); });

  test('finds the single matching identity by probing with the current passphrase', async () => {
    const identityId = 'identity-discovery';
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE, identityId);
    const handles = await seedAllStores(identityId, oldKey);

    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      currentPassphrase: OLD_PASSPHRASE,
    });

    expect(result.status).toBe('migrated');
    expect(result.identityId).toBe(identityId);

    const newKey = result.newWrappingKey!;
    await expectAllDecryptableWith(identityId, handles, newKey);

    const devices = await getDeviceKeysForIdentity(identityId);
    await expect(decryptDeviceKeys(devices[0]!, oldKey)).rejects.toThrow();
  });

  test('returns no-local-data when nothing is stored locally', async () => {
    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      currentPassphrase: OLD_PASSPHRASE,
    });
    expect(result.status).toBe('no-local-data');
    expect(result.candidateCount).toBe(0);
  });

  test('returns no-match when the current passphrase unlocks no local store', async () => {
    const identityId = 'identity-nomatch';
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE, identityId);
    const handles = await seedAllStores(identityId, oldKey);

    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      currentPassphrase: 'a-completely-different-passphrase',
    });

    expect(result.status).toBe('no-match');
    // Original data must be untouched.
    await expectAllDecryptableWith(identityId, handles, oldKey);
  });

  test('aborts safely (ambiguous) when two local identities share the same passphrase', async () => {
    const idA = 'identity-shared-a';
    const idB = 'identity-shared-b';
    // Same passphrase string, different per-identity salts -> different keys.
    const keyA = await deriveKeyFor(OLD_PASSPHRASE, idA);
    const keyB = await deriveKeyFor(OLD_PASSPHRASE, idB);
    const handlesA = await seedAllStores(idA, keyA);
    const handlesB = await seedAllStores(idB, keyB);

    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      currentPassphrase: OLD_PASSPHRASE,
    });

    expect(result.status).toBe('ambiguous');
    expect(result.candidateCount).toBeGreaterThanOrEqual(2);

    // Neither identity's material was modified.
    await expectAllDecryptableWith(idA, handlesA, keyA);
    await expectAllDecryptableWith(idB, handlesB, keyB);
  });

  test('uses the identity hint to disambiguate is NOT done; hint only widens candidates', async () => {
    // A hint that has no local data should still allow discovery of the real
    // local identity by passphrase probe.
    const realId = 'identity-real';
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE, realId);
    const handles = await seedAllStores(realId, oldKey);

    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      currentPassphrase: OLD_PASSPHRASE,
      identityId: 'identity-hint-with-no-local-data',
    });

    expect(result.status).toBe('migrated');
    expect(result.identityId).toBe(realId);
    await expectAllDecryptableWith(realId, handles, result.newWrappingKey!);
  });

  test('discovers an identity that only has ciphers (no device keys or pre-keys)', async () => {
    const identityId = 'identity-cipher-only';
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE, identityId);
    const salt = await getOrCreateWrappingSalt(identityId);
    const encryptedEntropy = await wrapEntropy(ENTROPY_PIECES, oldKey, salt);
    const cipherId = crypto.randomUUID();
    await saveStoredCipher({
      id: cipherId,
      name: 'cipher-only',
      identityId,
      encryptedEntropy,
      cipherId: 'cid-' + cipherId.slice(0, 8),
      shortId: cipherId.slice(0, 6),
      profile: 'default',
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    });

    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      currentPassphrase: OLD_PASSPHRASE,
    });

    expect(result.status).toBe('migrated');
    expect(result.identityId).toBe(identityId);
    expect(result.counts).toEqual({
      deviceKeys: 0,
      signedPreKeys: 0,
      oneTimePreKeys: 0,
      sessionKeys: 0,
      ciphers: 1,
    });

    const ciphers = await getStoredCiphers(identityId);
    const entropy = await unwrapEntropy(ciphers[0]!.encryptedEntropy, result.newWrappingKey!);
    expect(entropy[0]!.value).toBe(ENTROPY_PIECES[0]!.value);
  });
});

describe('reWrapPassphraseProtectedStores - edge cases', () => {
  beforeEach(async () => { await wipeAll(); });

  test('re-wraps multiple records in every category', async () => {
    const identityId = 'identity-multi';
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE, identityId);
    const deviceId = crypto.randomUUID();

    // 2 device keys (distinct device IDs)
    await storeDeviceKeys(deviceId, identityId, randomBytes(32), randomBytes(2400), oldKey);
    const deviceId2 = crypto.randomUUID();
    await storeDeviceKeys(deviceId2, identityId, randomBytes(32), randomBytes(2400), oldKey);

    // 2 SPKs
    const spk1 = crypto.randomUUID();
    const spk2 = crypto.randomUUID();
    await storeSignedPreKey(spk1, identityId, deviceId, randomBytes(32), randomBytes(2400), oldKey);
    await storeSignedPreKey(spk2, identityId, deviceId2, randomBytes(32), randomBytes(2400), oldKey);

    // 3 OTPKs
    const otpkIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await storeOneTimePreKeys(
      otpkIds.map((keyId) => ({ keyId, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) })),
      identityId,
      deviceId,
      oldKey,
    );

    // 2 session keys
    const msg1 = crypto.randomUUID();
    const msg2 = crypto.randomUUID();
    await storeSessionKey(msg1, identityId, randomBytes(32), oldKey, spk1);
    await storeSessionKey(msg2, identityId, randomBytes(32), oldKey, spk1);

    // 2 ciphers
    const salt = await getOrCreateWrappingSalt(identityId);
    for (let i = 0; i < 2; i++) {
      const id = crypto.randomUUID();
      await saveStoredCipher({
        id,
        name: `cipher-${i}`,
        identityId,
        encryptedEntropy: await wrapEntropy(ENTROPY_PIECES, oldKey, salt),
        cipherId: 'cid-' + id.slice(0, 8),
        shortId: id.slice(0, 6),
        profile: 'default',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
      });
    }

    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      identityId,
      oldWrappingKey: oldKey,
    });

    expect(result.status).toBe('migrated');
    expect(result.counts).toEqual({
      deviceKeys: 2,
      signedPreKeys: 2,
      oneTimePreKeys: 3,
      sessionKeys: 2,
      ciphers: 2,
    });

    const newKey = result.newWrappingKey!;
    // Every OTPK reads with the new key.
    for (const keyId of otpkIds) {
      const otpk = await findAndDecryptOneTimePreKey(keyId, identityId, newKey);
      expect(otpk).not.toBeNull();
    }
    // Both session keys read with the new key.
    expect(await getPersistedSessionKey(msg1, identityId, newKey)).not.toBeNull();
    expect(await getPersistedSessionKey(msg2, identityId, newKey)).not.toBeNull();
    // Both device keys read with the new key.
    const devices = await getDeviceKeysForIdentity(identityId);
    expect(devices.length).toBe(2);
    for (const d of devices) {
      const dec = await decryptDeviceKeys(d, newKey);
      expect(dec.ecdhPrivateKey.length).toBe(32);
    }
  });

  test('re-wraps retired signed pre-keys (needed to read pending/old messages)', async () => {
    const identityId = 'identity-retired-spk';
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE, identityId);
    const deviceId = crypto.randomUUID();
    const spkId = crypto.randomUUID();
    await storeSignedPreKey(spkId, identityId, deviceId, randomBytes(32), randomBytes(2400), oldKey);
    await retireSignedPreKey(spkId, identityId);

    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      identityId,
      oldWrappingKey: oldKey,
    });

    expect(result.status).toBe('migrated');
    expect(result.counts!.signedPreKeys).toBe(1);

    const retired = await getRetiredSignedPreKeys(identityId, deviceId);
    expect(retired.length).toBe(1);
    const decrypted = await decryptSignedPreKey(retired[0]!, result.newWrappingKey!);
    expect(decrypted.ecdhPrivateKey.length).toBe(32);
  });

  test('recovers from a partial migration (crash after only device keys were re-wrapped)', async () => {
    const identityId = 'identity-partial';
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE, identityId);
    const handles = await seedAllStores(identityId, oldKey);

    // Simulate a crash mid-migration: only device keys got re-wrapped.
    const salt = await getOrCreateWrappingSalt(identityId);
    const newKey = await deriveEntropyWrappingKey(NEW_PASSPHRASE, salt);
    const partial = await reWrapDeviceKeys(identityId, oldKey, newKey);
    expect(partial).toBe(1);

    // Re-run the full migrator with the SAME old key (idempotent retry).
    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      identityId,
      oldWrappingKey: oldKey,
    });

    expect(result.status).toBe('migrated');
    // Device keys already migrated -> 0; the rest complete now.
    expect(result.counts).toEqual({
      deviceKeys: 0,
      signedPreKeys: 1,
      oneTimePreKeys: 1,
      sessionKeys: 1,
      ciphers: 1,
    });

    await expectAllDecryptableWith(identityId, handles, result.newWrappingKey!);
  });

  test('direct mode with a wrong old key changes nothing (no corruption)', async () => {
    const identityId = 'identity-wrong-key';
    const realOldKey = await deriveKeyFor(OLD_PASSPHRASE, identityId);
    const handles = await seedAllStores(identityId, realOldKey);

    const wrongKey = randomBytes(32);
    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      identityId,
      oldWrappingKey: wrongKey,
    });

    // Nothing decrypts with the wrong key, so nothing is re-wrapped.
    expect(result.status).toBe('migrated');
    expect(result.counts).toEqual({
      deviceKeys: 0,
      signedPreKeys: 0,
      oneTimePreKeys: 0,
      sessionKeys: 0,
      ciphers: 0,
    });

    // Original material is untouched and still readable with the real old key.
    await expectAllDecryptableWith(identityId, handles, realOldKey);
  });
});
