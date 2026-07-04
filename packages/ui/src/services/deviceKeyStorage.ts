/**
 * Device Key Storage Service
 *
 * Stores device private keys using either:
 *   - A platform-provided SecureStorage backend (desktop: safeStorage + local file)
 *   - IndexedDB with AES-GCM encryption (web fallback)
 *
 * On desktop, each identity's device keys are stored in a separate file under
 * userData. Filenames are SHA-256 hashes of the identity ID so they cannot be
 * enumerated to reveal which identities are present on the device. When
 * safeStorage (OS keychain / DPAPI / libsecret) is available, file contents
 * are additionally encrypted with OS-level keys.
 *
 * On web, keys are stored in IndexedDB encrypted with a passphrase-derived
 * wrapping key (unchanged from the original implementation).
 *
 * In both cases, the private key material itself is encrypted with an
 * AES-GCM wrapping key derived from the identity passphrase via Argon2id.
 *
 * @module services/deviceKeyStorage
 */

import { toBase64, fromBase64, clearBytes, generateWrappingSalt } from '@adieuu/crypto';
import type { SecureStorage } from '../config/types';

const DB_NAME = 'adieuu-device-keys';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

const IDENTITY_KEY_PREFIX = 'dkeys-';
const WRAPPING_SALT_KEY_PREFIX = 'wsalt-';
const OLD_SINGLE_BLOB_KEY = 'adieuu-device-keys';
const MIGRATION_MARKER_KEY = 'dkeys-migration-v2';

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
  /**
   * Key-fingerprint routing tag for multi-device wrapped key lookup.
   * Computed at key generation time from the device's public keys.
   * Absent on records created before this field was introduced.
   */
  routingTag?: string;
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
  routingTag?: string;
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
// SecureStorage Backend (Desktop) -- Per-Identity Files
// ============================================================================

// HMR-safe state: survives Vite hot-module replacement of this file.
const DK_HMR_KEY = '__adieuu_deviceKeyStorage__' as const;

function getDkBackend(): SecureStorage | null {
  const g = globalThis as Record<string, unknown>;
  return (g[DK_HMR_KEY] as SecureStorage | null | undefined) ?? null;
}

/**
 * Sets the storage backend for device keys.
 *
 * When a backend is provided (desktop), each identity's device keys are stored
 * in a separate file with a SHA-256 hashed filename. When null (web), the
 * existing IndexedDB implementation is used.
 *
 * Call this once at app init before any identity/login operations.
 */
export function setDeviceKeyStorageBackend(backend: SecureStorage | null): void {
  (globalThis as Record<string, unknown>)[DK_HMR_KEY] = backend;
}

/**
 * Returns true when a SecureStorage backend is configured (desktop).
 * When false, the app is running in web-only mode with IndexedDB.
 */
export function hasSecureStorageBackend(): boolean {
  return getDkBackend() !== null;
}

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Derives an opaque key ID from an identity ID using SHA-256.
 * Filenames reveal no information about the identity.
 */
async function identityKeyId(identityId: string): Promise<string> {
  const data = new TextEncoder().encode(identityId);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return `${IDENTITY_KEY_PREFIX}${toHex(new Uint8Array(hash)).slice(0, 32)}`;
}

async function getIdentityStore(identityId: string): Promise<StoredDeviceKeys[]> {
  const dkBackend = getDkBackend();
  if (!dkBackend) throw new Error('No storage backend set');
  const keyId = await identityKeyId(identityId);
  const raw = await dkBackend.getKey(keyId);
  if (!raw) return [];
  const json = new TextDecoder().decode(raw);
  return JSON.parse(json) as StoredDeviceKeys[];
}

async function saveIdentityStore(identityId: string, keys: StoredDeviceKeys[]): Promise<void> {
  const dkBackend = getDkBackend();
  if (!dkBackend) throw new Error('No storage backend set');
  const keyId = await identityKeyId(identityId);
  if (keys.length === 0) {
    await dkBackend.deleteKey(keyId);
    return;
  }
  const json = JSON.stringify(keys);
  const data = new TextEncoder().encode(json);
  await dkBackend.setKey(keyId, data);
}

async function getAllIdentityKeyIds(): Promise<string[]> {
  const dkBackend = getDkBackend();
  if (!dkBackend?.listKeys) return [];
  return dkBackend.listKeys(IDENTITY_KEY_PREFIX);
}

/**
 * Derives an opaque salt key ID from an identity ID using SHA-256.
 */
async function wrappingSaltKeyId(identityId: string): Promise<string> {
  const data = new TextEncoder().encode(identityId);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return `${WRAPPING_SALT_KEY_PREFIX}${toHex(new Uint8Array(hash)).slice(0, 32)}`;
}

// ============================================================================
// Wrapping Salt Storage
// ============================================================================

const WRAPPING_SALT_IDB_NAME = 'adieuu-wrapping-keys';
const WRAPPING_SALT_IDB_VERSION = 1;
const WRAPPING_SALT_IDB_STORE = 'salts';

function openWrappingSaltDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new DeviceKeyStorageError('IndexedDB is not available', 'INDEXEDDB_UNAVAILABLE'));
      return;
    }
    const request = indexedDB.open(WRAPPING_SALT_IDB_NAME, WRAPPING_SALT_IDB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(WRAPPING_SALT_IDB_STORE)) {
        db.createObjectStore(WRAPPING_SALT_IDB_STORE, { keyPath: 'identityId' });
      }
    };
  });
}

async function getWrappingSaltFromIndexedDb(identityId: string): Promise<Uint8Array | null> {
  const db = await openWrappingSaltDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WRAPPING_SALT_IDB_STORE, 'readonly');
    const store = tx.objectStore(WRAPPING_SALT_IDB_STORE);
    const request = store.get(identityId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result?.salt ? fromBase64(request.result.salt) : null);
    };
    tx.oncomplete = () => db.close();
  });
}

async function storeWrappingSaltInIndexedDb(identityId: string, salt: Uint8Array): Promise<void> {
  const db = await openWrappingSaltDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WRAPPING_SALT_IDB_STORE, 'readwrite');
    const store = tx.objectStore(WRAPPING_SALT_IDB_STORE);
    const request = store.put({ identityId, salt: toBase64(salt) });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Gets or creates the Argon2id wrapping salt for an identity.
 *
 * On desktop (SecureStorage backend available), the salt is persisted
 * alongside the device keys so it survives browser cache clears.
 * On web, IndexedDB is used.
 */
export async function getOrCreateWrappingSalt(identityId: string): Promise<Uint8Array> {
  if (getDkBackend()) {
    const keyId = await wrappingSaltKeyId(identityId);
    const raw = await getDkBackend()!.getKey(keyId);
    if (raw) {
      return fromBase64(new TextDecoder().decode(raw));
    }

    const salt = generateWrappingSalt();
    await getDkBackend()!.setKey(keyId, new TextEncoder().encode(toBase64(salt)));
    return salt;
  }

  const existing = await getWrappingSaltFromIndexedDb(identityId);
  if (existing) return existing;

  const salt = generateWrappingSalt();
  await storeWrappingSaltInIndexedDb(identityId, salt);
  return salt;
}

/**
 * Deletes the stored Argon2id wrapping salt for an identity.
 * Part of the tier-2 identity-scoped local wipe.
 */
export async function deleteWrappingSalt(identityId: string): Promise<void> {
  if (getDkBackend()) {
    const keyId = await wrappingSaltKeyId(identityId);
    await getDkBackend()!.deleteKey(keyId);
    return;
  }

  const db = await openWrappingSaltDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WRAPPING_SALT_IDB_STORE, 'readwrite');
    const request = tx.objectStore(WRAPPING_SALT_IDB_STORE).delete(identityId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

// ============================================================================
// Per-identity unlock timestamp (lastIdentityUnlockAt)
//
// Records the last time an identity was successfully unlocked / re-wrapped on
// this device. Compared against the server's `passphraseChangedAt` to decide
// whether a remote passphrase change requires re-wrapping local keys.
//
// PRIVACY: the storage key is the SAME opaque SHA-256 hash used for device-key
// filenames so that disk/IndexedDB inspection cannot enumerate which identities
// exist on the device. The stored value is a plaintext ISO timestamp (not
// secret); only the key must be non-identifying.
// ============================================================================

const UNLOCK_META_KEY_PREFIX = 'iunlock-';
const UNLOCK_META_IDB_NAME = 'adieuu-identity-meta';
const UNLOCK_META_IDB_VERSION = 1;
const UNLOCK_META_IDB_STORE = 'unlock';

async function unlockMetaKeyId(identityId: string): Promise<string> {
  const data = new TextEncoder().encode(identityId);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return `${UNLOCK_META_KEY_PREFIX}${toHex(new Uint8Array(hash)).slice(0, 32)}`;
}

function openUnlockMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new DeviceKeyStorageError('IndexedDB is not available', 'INDEXEDDB_UNAVAILABLE'));
      return;
    }
    const request = indexedDB.open(UNLOCK_META_IDB_NAME, UNLOCK_META_IDB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(UNLOCK_META_IDB_STORE)) {
        db.createObjectStore(UNLOCK_META_IDB_STORE, { keyPath: 'keyId' });
      }
    };
  });
}

/**
 * Records that the identity was successfully unlocked / re-wrapped now (or at
 * the given time). Stored under an opaque hashed key for enumeration
 * resistance. Failures are swallowed: this is best-effort metadata.
 */
export async function setLastIdentityUnlockAt(identityId: string, when: Date = new Date()): Promise<void> {
  const iso = when.toISOString();
  const keyId = await unlockMetaKeyId(identityId);

  if (getDkBackend()) {
    await getDkBackend()!.setKey(keyId, new TextEncoder().encode(iso));
    return;
  }

  const db = await openUnlockMetaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(UNLOCK_META_IDB_STORE, 'readwrite');
    const request = tx.objectStore(UNLOCK_META_IDB_STORE).put({ keyId, lastUnlockAt: iso });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Returns the ISO timestamp of the last successful unlock/re-wrap for an
 * identity on this device, or null if never recorded.
 */
export async function getLastIdentityUnlockAt(identityId: string): Promise<string | null> {
  const keyId = await unlockMetaKeyId(identityId);

  if (getDkBackend()) {
    const raw = await getDkBackend()!.getKey(keyId);
    return raw ? new TextDecoder().decode(raw) : null;
  }

  const db = await openUnlockMetaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(UNLOCK_META_IDB_STORE, 'readonly');
    const request = tx.objectStore(UNLOCK_META_IDB_STORE).get(keyId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result?.lastUnlockAt as string | undefined) ?? null);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Deletes the recorded last-unlock timestamp for an identity.
 * Part of the tier-2 identity-scoped local wipe.
 */
export async function deleteLastIdentityUnlockAt(identityId: string): Promise<void> {
  const keyId = await unlockMetaKeyId(identityId);

  if (getDkBackend()) {
    await getDkBackend()!.deleteKey(keyId);
    return;
  }

  const db = await openUnlockMetaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(UNLOCK_META_IDB_STORE, 'readwrite');
    const request = tx.objectStore(UNLOCK_META_IDB_STORE).delete(keyId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Whether a remote passphrase change requires re-wrapping local keys: true when
 * the server's passphraseChangedAt is newer than this device's last unlock.
 */
export async function needsPassphraseMigration(
  identityId: string,
  passphraseChangedAt: string | null | undefined,
): Promise<boolean> {
  if (!passphraseChangedAt) return false;
  const lastUnlock = await getLastIdentityUnlockAt(identityId);
  if (!lastUnlock) return true;
  return new Date(passphraseChangedAt).getTime() > new Date(lastUnlock).getTime();
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
  wrappingKey: Uint8Array,
  routingTag?: string
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
    routingTag,
    createdAt: new Date().toISOString(),
  };

  if (getDkBackend()) {
    const keys = await getIdentityStore(identityId);
    const existingIdx = keys.findIndex((k) => k.deviceId === deviceId);
    if (existingIdx >= 0) {
      keys[existingIdx] = record;
    } else {
      keys.push(record);
    }
    await saveIdentityStore(identityId, keys);
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
 * Stores a pre-encrypted StoredDeviceKeys record directly.
 *
 * Used by key backup import where records are already encrypted with
 * the identity passphrase wrapping key. No additional encryption is applied.
 */
export async function storePreEncryptedDeviceKeys(
  record: StoredDeviceKeys
): Promise<void> {
  if (getDkBackend()) {
    const keys = await getIdentityStore(record.identityId);
    const existingIdx = keys.findIndex((k) => k.deviceId === record.deviceId);
    if (existingIdx >= 0) {
      keys[existingIdx] = record;
    } else {
      keys.push(record);
    }
    await saveIdentityStore(record.identityId, keys);
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
 *
 * When identityId is provided (recommended), only that identity's file is
 * read. Otherwise all identity files are scanned.
 */
export async function getStoredDeviceKeys(
  deviceId: string,
  identityId?: string
): Promise<StoredDeviceKeys | null> {
  if (getDkBackend()) {
    if (identityId) {
      const keys = await getIdentityStore(identityId);
      return keys.find((k) => k.deviceId === deviceId) ?? null;
    }
    const allKeyIds = await getAllIdentityKeyIds();
    for (const keyId of allKeyIds) {
      const raw = await getDkBackend()!.getKey(keyId);
      if (!raw) continue;
      const keys = JSON.parse(new TextDecoder().decode(raw)) as StoredDeviceKeys[];
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
  if (getDkBackend()) {
    return getIdentityStore(identityId);
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
    routingTag: stored.routingTag,
  };
}

type EncryptedField = { ciphertext: string; nonce: string };

type ReWrapFieldResult =
  | { status: 'rewrapped'; field: EncryptedField }
  | { status: 'already'; field: EncryptedField }
  | { status: 'failed'; field: EncryptedField };

/**
 * Re-wraps a single encrypted field from the old wrapping key to the new one.
 *
 * Idempotent and tolerant: if the field cannot be decrypted with the old key
 * but CAN be decrypted with the new key, it is treated as already migrated and
 * left untouched. If it decrypts with neither key, it is reported as failed and
 * left untouched (so a partially-corrupt store never blocks the rest).
 */
async function reWrapEncryptedField(
  field: EncryptedField,
  oldWrappingKey: Uint8Array,
  newWrappingKey: Uint8Array,
): Promise<ReWrapFieldResult> {
  try {
    const plain = await decryptWithWrappingKey(field, oldWrappingKey);
    const reEncrypted = await encryptWithWrappingKey(plain, newWrappingKey);
    clearBytes(plain);
    return { status: 'rewrapped', field: reEncrypted };
  } catch {
    // Old key failed — check whether it is already wrapped with the new key.
  }

  try {
    const plain = await decryptWithWrappingKey(field, newWrappingKey);
    clearBytes(plain);
    return { status: 'already', field };
  } catch {
    return { status: 'failed', field };
  }
}

/**
 * Re-wraps all device keys for an identity with a new wrapping key.
 *
 * Each stored key is decrypted with the old wrapping key and re-encrypted
 * with the new one. Used during passphrase change (the wrapping key is
 * derived from the passphrase).
 *
 * Idempotent: records already wrapped with the new key are skipped, so the
 * operation can be safely retried after a partial failure. Records that
 * decrypt with neither key are left untouched and logged.
 *
 * @returns Number of device key records newly re-wrapped (old -> new)
 */
export async function reWrapDeviceKeys(
  identityId: string,
  oldWrappingKey: Uint8Array,
  newWrappingKey: Uint8Array,
): Promise<number> {
  const storedKeys = await getDeviceKeysForIdentity(identityId);
  if (storedKeys.length === 0) return 0;

  let reWrapped = 0;
  let changed = false;

  for (const stored of storedKeys) {
    const ecdh = await reWrapEncryptedField(stored.ecdhPrivateKeyEncrypted, oldWrappingKey, newWrappingKey);
    const kem = await reWrapEncryptedField(stored.kemPrivateKeyEncrypted, oldWrappingKey, newWrappingKey);

    if (ecdh.status === 'failed' || kem.status === 'failed') {
      console.warn(
        '[DeviceKeyStorage] Skipping device key that decrypts with neither old nor new key for device',
        stored.deviceId.slice(0, 8)
      );
      continue;
    }

    if (ecdh.status === 'rewrapped' || kem.status === 'rewrapped') {
      stored.ecdhPrivateKeyEncrypted = ecdh.field;
      stored.kemPrivateKeyEncrypted = kem.field;
      reWrapped++;
      changed = true;
    }
  }

  if (!changed) return 0;

  // Persist back
  if (getDkBackend()) {
    await saveIdentityStore(identityId, storedKeys);
  } else {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const objectStore = tx.objectStore(STORE_NAME);
      for (const record of storedKeys) {
        objectStore.put(record);
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { reject(tx.error); };
    });
  }

  return reWrapped;
}

/**
 * Returns true if any of the identity's stored device keys can be decrypted
 * with the given wrapping key. Returns null when no device keys are stored for
 * the identity (so callers can fall back to other key categories).
 *
 * Used by passphrase-change local identity discovery to probe which local
 * identity a candidate wrapping key belongs to.
 */
export async function deviceKeysDecryptWith(
  identityId: string,
  wrappingKey: Uint8Array,
): Promise<boolean | null> {
  const stored = await getDeviceKeysForIdentity(identityId);
  if (stored.length === 0) return null;

  for (const record of stored) {
    try {
      const plain = await decryptWithWrappingKey(record.ecdhPrivateKeyEncrypted, wrappingKey);
      clearBytes(plain);
      return true;
    } catch {
      // try next record
    }
  }
  return false;
}

/**
 * Enumerates the identity IDs that have device keys stored locally.
 *
 * The identity ID is read from the (plaintext) record metadata, never the
 * private key material. On desktop the per-identity blob filenames are hashed,
 * so the IDs are recovered from the blob contents instead.
 */
export async function getAllDeviceKeyIdentityIds(): Promise<string[]> {
  const ids = new Set<string>();

  if (getDkBackend()) {
    const allKeyIds = await getAllIdentityKeyIds();
    for (const keyId of allKeyIds) {
      const raw = await getDkBackend()!.getKey(keyId);
      if (!raw) continue;
      try {
        const keys = JSON.parse(new TextDecoder().decode(raw)) as StoredDeviceKeys[];
        for (const k of keys) {
          if (k.identityId) ids.add(k.identityId);
        }
      } catch {
        // skip corrupt blob
      }
    }
    return [...ids];
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const objectStore = tx.objectStore(STORE_NAME);
    const request = objectStore.getAll();
    request.onerror = () => {
      reject(new DeviceKeyStorageError('Failed to enumerate device keys', 'RETRIEVAL_FAILED'));
    };
    request.onsuccess = () => {
      for (const k of request.result as StoredDeviceKeys[]) {
        if (k.identityId) ids.add(k.identityId);
      }
      resolve([...ids]);
    };
    tx.oncomplete = () => db.close();
  });
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
 *
 * When identityId is provided (recommended), only that identity's file is
 * read. Otherwise all identity files are scanned.
 */
export async function deleteDeviceKeys(
  deviceId: string,
  identityId?: string
): Promise<void> {
  if (getDkBackend()) {
    if (identityId) {
      const keys = await getIdentityStore(identityId);
      const filtered = keys.filter((k) => k.deviceId !== deviceId);
      if (filtered.length !== keys.length) {
        await saveIdentityStore(identityId, filtered);
      }
      return;
    }
    const allKeyIds = await getAllIdentityKeyIds();
    for (const keyId of allKeyIds) {
      const raw = await getDkBackend()!.getKey(keyId);
      if (!raw) continue;
      const keys = JSON.parse(new TextDecoder().decode(raw)) as StoredDeviceKeys[];
      const filtered = keys.filter((k) => k.deviceId !== deviceId);
      if (filtered.length !== keys.length) {
        if (filtered.length === 0) {
          await getDkBackend()!.deleteKey(keyId);
        } else {
          const json = JSON.stringify(filtered);
          await getDkBackend()!.setKey(keyId, new TextEncoder().encode(json));
        }
        return;
      }
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
  if (getDkBackend()) {
    const keys = await getIdentityStore(identityId);
    if (keys.length === 0) return 0;
    const count = keys.length;
    await saveIdentityStore(identityId, []);
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
  if (getDkBackend()) {
    const allKeyIds = await getAllIdentityKeyIds();
    for (const keyId of allKeyIds) {
      await getDkBackend()!.deleteKey(keyId);
    }
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
// Migration
// ============================================================================

type LegacyDeviceKeyStore = Record<string, StoredDeviceKeys[]>;

/**
 * Migrates the old single-blob format (adieuu-device-keys) to per-identity
 * files with hashed filenames.
 */
async function migrateSingleBlobToPerIdentity(): Promise<number> {
  if (!getDkBackend()) return 0;

  const hasOldBlob = await getDkBackend()!.hasKey(OLD_SINGLE_BLOB_KEY);
  if (!hasOldBlob) return 0;

  const raw = await getDkBackend()!.getKey(OLD_SINGLE_BLOB_KEY);
  if (!raw) return 0;

  let store: LegacyDeviceKeyStore;
  try {
    store = JSON.parse(new TextDecoder().decode(raw)) as LegacyDeviceKeyStore;
  } catch {
    console.error('[DeviceKeyStorage] Corrupt legacy single-blob, skipping migration');
    return 0;
  }

  let totalMigrated = 0;

  for (const [iid, keys] of Object.entries(store)) {
    if (keys.length > 0) {
      await saveIdentityStore(iid, keys);
      totalMigrated += keys.length;
    }
  }

  await getDkBackend()!.deleteKey(OLD_SINGLE_BLOB_KEY);

  return totalMigrated;
}

/**
 * Migrates device keys from older storage formats to the current per-identity
 * file model.
 *
 * Migration order:
 *   1. Single-blob file -> per-identity files (desktop users from Phase 3)
 *   2. IndexedDB -> per-identity files (desktop users upgrading from web-only)
 *
 * Each step is idempotent. A marker key prevents re-running after success.
 *
 * @returns Number of records migrated (0 if nothing to migrate)
 */
export async function migrateIndexedDbToBackend(): Promise<number> {
  if (!getDkBackend()) return 0;

  const markerExists = await getDkBackend()!.hasKey(MIGRATION_MARKER_KEY);
  if (markerExists) return 0;

  let totalMigrated = 0;

  // Step 1: single-blob -> per-identity
  totalMigrated += await migrateSingleBlobToPerIdentity();

  // Step 2: IndexedDB -> per-identity (for fresh upgrades from web-only)
  if (typeof indexedDB !== 'undefined') {
    let db: IDBDatabase;
    try {
      db = await openDatabase();
    } catch {
      // No IndexedDB data to migrate
      await getDkBackend()!.setKey(MIGRATION_MARKER_KEY, new TextEncoder().encode('done'));
      return totalMigrated;
    }

    const allRecords: StoredDeviceKeys[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const objectStore = tx.objectStore(STORE_NAME);
      const request = objectStore.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? []);
      tx.oncomplete = () => db.close();
    });

    if (allRecords.length > 0) {
      const byIdentity: Record<string, StoredDeviceKeys[]> = {};
      for (const record of allRecords) {
        const list = byIdentity[record.identityId] ?? [];
        list.push(record);
        byIdentity[record.identityId] = list;
      }

      for (const [iid, keys] of Object.entries(byIdentity)) {
        const existing = await getIdentityStore(iid);
        if (existing.length === 0) {
          await saveIdentityStore(iid, keys);
          totalMigrated += keys.length;
        }
      }

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
    }
  }

  // Write marker so we don't re-run
  await getDkBackend()!.setKey(MIGRATION_MARKER_KEY, new TextEncoder().encode('done'));

  return totalMigrated;
}
