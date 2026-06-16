/**
 * Phase 2 tests for remote passphrase-change handling on other devices.
 *
 * Covers:
 *  - lastIdentityUnlockAt persistence + privacy (stored under an opaque hashed
 *    key, never the raw identityId)
 *  - needsPassphraseMigration timestamp gating
 *  - targeted migration mode used by the remote-change migration prompt
 *
 * Real crypto, no mocks. Runs against fake-indexeddb (web backend).
 */
import { describe, expect, test, beforeEach } from 'bun:test';
import {
  storeDeviceKeys,
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
  getOrCreateWrappingSalt,
  setLastIdentityUnlockAt,
  getLastIdentityUnlockAt,
  needsPassphraseMigration,
} from './deviceKeyStorage';
import { storeSessionKey, getPersistedSessionKey } from './preKeyStorage';
import { reWrapPassphraseProtectedStores } from './passphraseLocalMigration';
import { randomBytes, deriveEntropyWrappingKey } from '@adieuu/crypto';

const OLD_PASSPHRASE = 'old-secret-passphrase-2024';
const NEW_PASSPHRASE = 'new-secret-passphrase-2025';
const WRONG_PASSPHRASE = 'totally-wrong-passphrase';

const DB_NAMES = [
  'adieuu-device-keys',
  'adieuu-pre-keys',
  'adieuu-session-keys',
  'adieuu-wrapping-keys',
  'adieuu-ciphers',
  'adieuu-identity-meta',
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

function getAllMetaKeys(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('adieuu-identity-meta');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('unlock')) {
        db.close();
        resolve([]);
        return;
      }
      const tx = db.transaction('unlock', 'readonly');
      const keysReq = tx.objectStore('unlock').getAllKeys();
      keysReq.onerror = () => reject(keysReq.error);
      keysReq.onsuccess = () => {
        resolve((keysReq.result as IDBValidKey[]).map((k) => String(k)));
        db.close();
      };
    };
  });
}

describe('lastIdentityUnlockAt persistence', () => {
  beforeEach(async () => {
    await wipeAll();
  });

  test('returns null before anything is recorded', async () => {
    expect(await getLastIdentityUnlockAt('identity-a')).toBeNull();
  });

  test('round-trips an ISO timestamp', async () => {
    const when = new Date('2026-03-04T05:06:07.000Z');
    await setLastIdentityUnlockAt('identity-a', when);
    expect(await getLastIdentityUnlockAt('identity-a')).toBe(when.toISOString());
  });

  test('is scoped per identity', async () => {
    await setLastIdentityUnlockAt('identity-a', new Date('2026-01-01T00:00:00.000Z'));
    expect(await getLastIdentityUnlockAt('identity-b')).toBeNull();
  });

  test('PRIVACY: stores under an opaque hashed key, not the raw identityId', async () => {
    const identityId = 'super-secret-identity-id-12345';
    await setLastIdentityUnlockAt(identityId);

    const keys = await getAllMetaKeys();
    expect(keys.length).toBe(1);
    const key = keys[0]!;
    // The raw identity ID must NOT appear anywhere in the storage key.
    expect(key).not.toContain(identityId);
    // It is the opaque hashed form.
    expect(key.startsWith('iunlock-')).toBe(true);
  });
});

describe('needsPassphraseMigration gating', () => {
  beforeEach(async () => {
    await wipeAll();
  });

  test('false when server has no passphraseChangedAt', async () => {
    expect(await needsPassphraseMigration('identity-a', null)).toBe(false);
    expect(await needsPassphraseMigration('identity-a', undefined)).toBe(false);
  });

  test('true when changed but never unlocked locally', async () => {
    expect(await needsPassphraseMigration('identity-a', '2026-01-01T00:00:00.000Z')).toBe(true);
  });

  test('true when passphraseChangedAt is newer than last unlock', async () => {
    await setLastIdentityUnlockAt('identity-a', new Date('2026-01-01T00:00:00.000Z'));
    expect(await needsPassphraseMigration('identity-a', '2026-02-01T00:00:00.000Z')).toBe(true);
  });

  test('false when last unlock is newer (already migrated)', async () => {
    await setLastIdentityUnlockAt('identity-a', new Date('2026-03-01T00:00:00.000Z'));
    expect(await needsPassphraseMigration('identity-a', '2026-02-01T00:00:00.000Z')).toBe(false);
  });
});

describe('reWrapPassphraseProtectedStores targeted mode', () => {
  const IDENTITY = 'target-identity-xyz';

  beforeEach(async () => {
    await wipeAll();
  });

  async function seed(oldKey: Uint8Array): Promise<string> {
    const deviceId = crypto.randomUUID();
    await storeDeviceKeys(deviceId, IDENTITY, randomBytes(32), randomBytes(2400), oldKey);
    const messageId = crypto.randomUUID();
    await storeSessionKey(messageId, IDENTITY, randomBytes(32), oldKey, 'spk-1');
    return deviceId;
  }

  test('re-wraps the targeted identity with the correct old passphrase', async () => {
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE, IDENTITY);
    const deviceId = await seed(oldKey);

    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      currentPassphrase: OLD_PASSPHRASE,
      targetIdentityId: IDENTITY,
    });

    expect(result.status).toBe('migrated');
    expect(result.identityId).toBe(IDENTITY);
    expect(result.newWrappingKey).toBeDefined();

    // Device keys must now decrypt with the NEW key, not the old one.
    const newKey = await deriveKeyFor(NEW_PASSPHRASE, IDENTITY);
    const stored = await getDeviceKeysForIdentity(IDENTITY);
    const decrypted = await decryptDeviceKeys(stored[0]!, newKey);
    expect(decrypted.deviceId).toBe(deviceId);
  });

  test('returns no-match for a wrong old passphrase and leaves material untouched', async () => {
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE, IDENTITY);
    await seed(oldKey);

    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      currentPassphrase: WRONG_PASSPHRASE,
      targetIdentityId: IDENTITY,
    });

    expect(result.status).toBe('no-match');

    // Original (old-key) material must remain decryptable with the old key.
    const stored = await getDeviceKeysForIdentity(IDENTITY);
    const decrypted = await decryptDeviceKeys(stored[0]!, oldKey);
    expect(decrypted.deviceId).toBeDefined();
  });

  test('re-wraps persisted session keys for the targeted identity', async () => {
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE, IDENTITY);
    const deviceId = crypto.randomUUID();
    await storeDeviceKeys(deviceId, IDENTITY, randomBytes(32), randomBytes(2400), oldKey);
    const messageId = crypto.randomUUID();
    const sessionKeyBytes = randomBytes(32);
    await storeSessionKey(messageId, IDENTITY, sessionKeyBytes, oldKey, 'spk-1');

    const result = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      currentPassphrase: OLD_PASSPHRASE,
      targetIdentityId: IDENTITY,
    });
    expect(result.status).toBe('migrated');

    const newKey = await deriveKeyFor(NEW_PASSPHRASE, IDENTITY);
    const recovered = await getPersistedSessionKey(messageId, IDENTITY, newKey);
    expect(recovered).not.toBeNull();
    expect(Array.from(recovered!)).toEqual(Array.from(sessionKeyBytes));
  });

  test('is idempotent: a second run is a no-op that keeps keys decryptable', async () => {
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE, IDENTITY);
    const deviceId = await seed(oldKey);

    const first = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      currentPassphrase: OLD_PASSPHRASE,
      targetIdentityId: IDENTITY,
    });
    expect(first.status).toBe('migrated');

    // Second run with the old passphrase no longer matches (already migrated).
    const second = await reWrapPassphraseProtectedStores({
      newPassphrase: NEW_PASSPHRASE,
      currentPassphrase: OLD_PASSPHRASE,
      targetIdentityId: IDENTITY,
    });
    expect(second.status).toBe('no-match');

    // Keys still decrypt with the new key.
    const newKey = await deriveKeyFor(NEW_PASSPHRASE, IDENTITY);
    const stored = await getDeviceKeysForIdentity(IDENTITY);
    const decrypted = await decryptDeviceKeys(stored[0]!, newKey);
    expect(decrypted.deviceId).toBe(deviceId);
  });
});
