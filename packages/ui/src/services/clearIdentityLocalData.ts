/**
 * Tier-2 local wipe: removes all locally persisted data for one identity.
 *
 * Logout tiers:
 * - Tier 1 (basic logout): server session ends, local data kept.
 * - Tier 2 (this module): wipes local message caches, device keys, pre-keys,
 *   session keys, wrapping salts, unlock metadata, stored ciphers, search
 *   index, media outbox, TOFU verification records, and per-identity
 *   localStorage preferences. The device registration on the server is kept.
 * - Tier 3 (panic wipe, `panicWipeLocalClientData`): wipes everything for the
 *   origin so the installation looks brand new.
 *
 * Every step is best-effort: a failure in one store must not prevent the
 * remaining stores from being wiped.
 *
 * @module services/clearIdentityLocalData
 */

import {
  deleteAllDeviceKeysForIdentity,
  deleteWrappingSalt,
  deleteLastIdentityUnlockAt,
} from './deviceKeyStorage';
import {
  deleteAllPreKeysForIdentity,
  clearAllSessionKeys,
} from './preKeyStorage';
import { getStoredCiphers, deleteStoredCipher } from './cipherStoreDb';
import { messageSearchCacheDeleteAll } from './messageSearch/messageSearchCacheDb';
import { clearSpaceCipherState } from './spaceCipherService';

/**
 * IndexedDB databases that are not identity-scoped internally and are wiped
 * whole during a tier-2 clear. Both hold only local, reproducible state
 * (pending uploads, peer fingerprint verification records).
 */
const NON_SCOPED_DATABASES_TO_DELETE: readonly string[] = [
  'adieuu-media-outbox',
  'adieuu-device-signature-verification',
];

/** Per-identity localStorage key prefixes (suffix = identityId). */
const IDENTITY_LOCALSTORAGE_PREFIXES: readonly string[] = [
  'adieuu-fs-config-',
  'adieuu-show-artifacts-',
];

/** localStorage key prefixes removed wholesale (per-conversation, not enumerable by identity). */
const GLOBAL_LOCALSTORAGE_PREFIXES: readonly string[] = [
  'adieuu-conv-fs-',
];

function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'));
    req.onblocked = () => resolve();
  });
}

function clearLocalStorageKeys(identityId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem('adieuu-device-id');
    for (const prefix of IDENTITY_LOCALSTORAGE_PREFIXES) {
      localStorage.removeItem(prefix + identityId);
    }
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && GLOBAL_LOCALSTORAGE_PREFIXES.some((p) => key.startsWith(p))) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // best-effort
  }
}

async function deleteStoredCiphersForIdentity(identityId: string): Promise<void> {
  const ciphers = await getStoredCiphers(identityId);
  await Promise.all(ciphers.map((c) => deleteStoredCipher(c.id).catch(() => {})));
}

/**
 * Wipes all locally persisted data for an identity (tier-2 logout).
 *
 * Does NOT end the server session or remove the device registration; the
 * caller is responsible for logging out afterwards.
 */
export async function clearIdentityLocalData(identityId: string): Promise<void> {
  await Promise.all([
    deleteAllDeviceKeysForIdentity(identityId).catch(() => {}),
    deleteAllPreKeysForIdentity(identityId).catch(() => {}),
    clearAllSessionKeys(identityId).catch(() => {}),
    deleteWrappingSalt(identityId).catch(() => {}),
    deleteLastIdentityUnlockAt(identityId).catch(() => {}),
    deleteStoredCiphersForIdentity(identityId).catch(() => {}),
    messageSearchCacheDeleteAll().catch(() => {}),
    ...NON_SCOPED_DATABASES_TO_DELETE.map((n) => deleteIndexedDb(n).catch(() => {})),
  ]);

  clearSpaceCipherState();
  clearLocalStorageKeys(identityId);
}
