/**
 * Device Key Storage Service
 *
 * Stores device private keys using either:
 *   - A platform-provided SecureStorage backend (desktop: safeStorage + local file)
 *   - IndexedDB with AES-GCM encryption (web fallback)
 *
 * On desktop, all device keys are stored as a single JSON blob under the key
 * 'adieuu-device-keys' via the SecureStorage interface. The main process
 * encrypts that blob with safeStorage (OS keychain / DPAPI / libsecret) and
 * writes it to a file under userData, so keys survive browser cache clears.
 *
 * On web, keys are stored in IndexedDB encrypted with a passphrase-derived
 * wrapping key (unchanged from the original implementation).
 *
 * In both cases, the private key material itself is encrypted with an
 * AES-GCM wrapping key derived from the identity passphrase via Argon2id.
 *
 * @module services/deviceKeyStorage
 */

import { toBase64, fromBase64, clearBytes } from '@adieuu/crypto';
import type { SecureStorage } from '../config/types';

const DB_NAME = 'adieuu-device-keys';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const BACKEND_KEY_ID = 'adieuu-device-keys';

// ============================================================================
// Types
// ============================================================================

/**
 * Stored device key record (persisted in IndexedDB or SecureStorage blob).
 */
export interface StoredDeviceKeys {
  /** Unique device identifier */
  deviceId: string;
  /** Associated identity ID */
  identityId: string;
  /** X25519 private key encrypted with wrapping key */
  ecdhPrivateKeyEncrypted: {
    ciphertext: string;
    nonce: string;
  };
  /** ML-KEM private key encrypted with wrapping key */
  kemPrivateKeyEncrypted: {
    ciphertext: string;
    nonce: string;
  };
  /** When the keys were stored */
  createdAt: string;
}

/**
 * Decrypted device keys for runtime use.
 */
export interface DecryptedDeviceKeys {
  deviceId: string;
  identityId: string;
  ecdhPrivateKey: Uint8Array;
  kemPrivateKey: Uint8Array;
}

/**
 * Custom error class for device key storage errors.
 */
export class DeviceKeyStorageError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'DeviceKeyStorageError';
  }
}

// ============================================================================
// SecureStorage Backend (Desktop)
// ============================================================================

let storageBackend: SecureStorage | null = null;

/**
 * Sets the storage backend for device keys.
 *
 * When a backend is provided (desktop), all device key operations use a single
 * JSON blob persisted via the SecureStorage interface. When null (web), the
 * existing IndexedDB implementation is used.
 *
 * Call this once at app init before any identity/login operations.
 */
export function setDeviceKeyStorageBackend(backend: SecureStorage | null): void {
  storageBackend = backend;
}

type DeviceKeyStore = Record<string, StoredDeviceKeys[]>;

async function getFullStore(): Promise<DeviceKeyStore> {
  if (!storageBackend) throw new Error('No storage backend set');
  const raw = await storageBackend.getKey(BACKEND_KEY_ID);
  if (!raw) return {};
  const json = new TextDecoder().decode(raw);
  return JSON.parse(json) as DeviceKeyStore;
}

async function saveFullStore(store: DeviceKeyStore): Promise<void> {
  if (!storageBackend) throw new Error('No storage backend set');
  const json = JSON.stringify(store);
  const data = new TextEncoder().encode(json);
  await storageBackend.setKey(BACKEND_KEY_ID, data);
}

// ============================================================================
// IndexedDB Helpers (Web)
// ============================================================================

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new DeviceKeyStorageError(
        'IndexedDB is not available',
        'INDEXEDDB_UNAVAILABLE'
      ));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new DeviceKeyStorageError(
        `Failed to open database: ${request.error?.message ?? 'Unknown error'}`,
        'DATABASE_OPEN_FAILED'
      ));
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'deviceId' });
        store.createIndex('identityId', 'identityId', { unique: false });
      }
    };
  });
}

function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(arr.length);
  copy.set(arr);
  return copy.buffer as ArrayBuffer;
}

async function encryptWithWrappingKey(
  data: Uint8Array,
  wrappingKey: Uint8Array
): Promise<{ ciphertext: string; nonce: string }> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(wrappingKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cryptoKey,
    toArrayBuffer(data)
  );

  return {
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    nonce: toBase64(nonce),
  };
}

async function decryptWithWrappingKey(
  encrypted: { ciphertext: string; nonce: string },
  wrappingKey: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(wrappingKey),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const ciphertext = fromBase64(encrypted.ciphertext);
  const nonce = fromBase64(encrypted.nonce);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(nonce) },
    cryptoKey,
    toArrayBuffer(ciphertext)
  );

  return new Uint8Array(plaintext);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Stores device keys.
 *
 * The private keys are encrypted with the wrapping key before storage.
 * The original key arrays are cleared from memory after encryption.
 */
export async function storeDeviceKeys(
  deviceId: string,
  identityId: string,
  ecdhPrivateKey: Uint8Array,
  kemPrivateKey: Uint8Array,
  wrappingKey: Uint8Array
): Promise<void> {
  const ecdhEncrypted = await encryptWithWrappingKey(ecdhPrivateKey, wrappingKey);
  const kemEncrypted = await encryptWithWrappingKey(kemPrivateKey, wrappingKey);

  clearBytes(ecdhPrivateKey);
  clearBytes(kemPrivateKey);

  const record: StoredDeviceKeys = {
    deviceId,
    identityId,
    ecdhPrivateKeyEncrypted: ecdhEncrypted,
    kemPrivateKeyEncrypted: kemEncrypted,
    createdAt: new Date().toISOString(),
  };

  if (storageBackend) {
    const store = await getFullStore();
    const identityKeys = store[identityId] ?? [];
    const existingIdx = identityKeys.findIndex((k) => k.deviceId === deviceId);
    if (existingIdx >= 0) {
      identityKeys[existingIdx] = record;
    } else {
      identityKeys.push(record);
    }
    store[identityId] = identityKeys;
    await saveFullStore(store);
    return;
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const objectStore = tx.objectStore(STORE_NAME);
    const request = objectStore.put(record);

    request.onerror = () => {
      reject(new DeviceKeyStorageError(
        'Failed to store device keys',
        'STORAGE_FAILED'
      ));
    };

    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieves stored device keys by device ID.
 */
export async function getStoredDeviceKeys(
  deviceId: string
): Promise<StoredDeviceKeys | null> {
  if (storageBackend) {
    const store = await getFullStore();
    for (const keys of Object.values(store)) {
      const found = keys.find((k) => k.deviceId === deviceId);
      if (found) return found;
    }
    return null;
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const objectStore = tx.objectStore(STORE_NAME);
    const request = objectStore.get(deviceId);

    request.onerror = () => {
      reject(new DeviceKeyStorageError(
        'Failed to retrieve device keys',
        'RETRIEVAL_FAILED'
      ));
    };

    request.onsuccess = () => {
      resolve(request.result ?? null);
    };

    tx.oncomplete = () => db.close();
  });
}

/**
 * Gets all stored device keys for an identity.
 */
export async function getDeviceKeysForIdentity(
  identityId: string
): Promise<StoredDeviceKeys[]> {
  if (storageBackend) {
    const store = await getFullStore();
    return store[identityId] ?? [];
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const objectStore = tx.objectStore(STORE_NAME);
    const index = objectStore.index('identityId');
    const request = index.getAll(identityId);

    request.onerror = () => {
      reject(new DeviceKeyStorageError(
        'Failed to retrieve device keys',
        'RETRIEVAL_FAILED'
      ));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    tx.oncomplete = () => db.close();
  });
}

/**
 * Decrypts device keys using the wrapping key.
 *
 * @throws DeviceKeyStorageError if decryption fails
 */
export async function decryptDeviceKeys(
  stored: StoredDeviceKeys,
  wrappingKey: Uint8Array
): Promise<DecryptedDeviceKeys> {
  let ecdhPrivateKey: Uint8Array;
  let kemPrivateKey: Uint8Array;

  try {
    ecdhPrivateKey = await decryptWithWrappingKey(
      stored.ecdhPrivateKeyEncrypted,
      wrappingKey
    );
  } catch {
    throw new DeviceKeyStorageError(
      'Failed to decrypt ECDH key. Check your passphrase.',
      'ECDH_DECRYPTION_FAILED'
    );
  }

  try {
    kemPrivateKey = await decryptWithWrappingKey(
      stored.kemPrivateKeyEncrypted,
      wrappingKey
    );
  } catch {
    clearBytes(ecdhPrivateKey);
    throw new DeviceKeyStorageError(
      'Failed to decrypt KEM key. Check your passphrase.',
      'KEM_DECRYPTION_FAILED'
    );
  }

  return {
    deviceId: stored.deviceId,
    identityId: stored.identityId,
    ecdhPrivateKey,
    kemPrivateKey,
  };
}

/**
 * Checks if device keys exist for an identity.
 */
export async function hasDeviceKeys(identityId: string): Promise<boolean> {
  const keys = await getDeviceKeysForIdentity(identityId);
  return keys.length > 0;
}

/**
 * Deletes device keys by device ID.
 */
export async function deleteDeviceKeys(deviceId: string): Promise<void> {
  if (storageBackend) {
    const store = await getFullStore();
    let found = false;
    for (const [identityId, keys] of Object.entries(store)) {
      const filtered = keys.filter((k) => k.deviceId !== deviceId);
      if (filtered.length !== keys.length) {
        found = true;
        if (filtered.length === 0) {
          delete store[identityId];
        } else {
          store[identityId] = filtered;
        }
      }
    }
    if (found) {
      await saveFullStore(store);
    }
    return;
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const objectStore = tx.objectStore(STORE_NAME);
    const request = objectStore.delete(deviceId);

    request.onerror = () => {
      reject(new DeviceKeyStorageError(
        'Failed to delete device keys',
        'DELETE_FAILED'
      ));
    };

    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Deletes all device keys for an identity.
 *
 * @returns Number of keys deleted
 */
export async function deleteAllDeviceKeysForIdentity(
  identityId: string
): Promise<number> {
  if (storageBackend) {
    const store = await getFullStore();
    const existing = store[identityId];
    if (!existing || existing.length === 0) return 0;
    const count = existing.length;
    delete store[identityId];
    await saveFullStore(store);
    return count;
  }

  const keys = await getDeviceKeysForIdentity(identityId);

  if (keys.length === 0) {
    return 0;
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const objectStore = tx.objectStore(STORE_NAME);

    let deletedCount = 0;
    let completedCount = 0;

    for (const key of keys) {
      const request = objectStore.delete(key.deviceId);

      request.onerror = () => {
        completedCount++;
        if (completedCount === keys.length) {
          resolve(deletedCount);
        }
      };

      request.onsuccess = () => {
        deletedCount++;
        completedCount++;
        if (completedCount === keys.length) {
          resolve(deletedCount);
        }
      };
    }

    tx.oncomplete = () => db.close();
  });
}

/**
 * Clears all device keys from the database.
 *
 * WARNING: This removes all keys for all identities. Use with caution.
 */
export async function clearAllDeviceKeys(): Promise<void> {
  if (storageBackend) {
    await storageBackend.deleteKey(BACKEND_KEY_ID);
    return;
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const objectStore = tx.objectStore(STORE_NAME);
    const request = objectStore.clear();

    request.onerror = () => {
      reject(new DeviceKeyStorageError(
        'Failed to clear device keys',
        'CLEAR_FAILED'
      ));
    };

    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

// ============================================================================
// Migration: IndexedDB -> SecureStorage backend
// ============================================================================

/**
 * Migrates device keys from IndexedDB to the SecureStorage backend.
 *
 * This should be called once on desktop startup after setting the backend.
 * It reads all records from the IndexedDB store, writes them to the backend
 * as a single blob, then clears the IndexedDB store. If the backend already
 * has data, this is a no-op.
 *
 * @returns Number of records migrated (0 if nothing to migrate or backend has data)
 */
export async function migrateIndexedDbToBackend(): Promise<number> {
  if (!storageBackend) return 0;

  const backendHasData = await storageBackend.hasKey(BACKEND_KEY_ID);
  if (backendHasData) return 0;

  if (typeof indexedDB === 'undefined') return 0;

  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch {
    return 0;
  }

  const allRecords: StoredDeviceKeys[] = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const objectStore = tx.objectStore(STORE_NAME);
    const request = objectStore.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? []);
    tx.oncomplete = () => db.close();
  });

  if (allRecords.length === 0) return 0;

  const store: DeviceKeyStore = {};
  for (const record of allRecords) {
    const list = store[record.identityId] ?? [];
    list.push(record);
    store[record.identityId] = list;
  }

  await saveFullStore(store);

  try {
    const clearDb = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = clearDb.transaction(STORE_NAME, 'readwrite');
      const objectStore = tx.objectStore(STORE_NAME);
      const request = objectStore.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => clearDb.close();
    });
  } catch {
    // Non-fatal: migration succeeded even if IndexedDB cleanup fails
  }

  return allRecords.length;
}
