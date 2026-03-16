/**
 * Pre-Key Storage Service
 *
 * Stores SPK and OTPK private keys locally using the same dual-backend
 * architecture as device key storage:
 *   - Desktop: SecureStorage (safeStorage + local file)
 *   - Web: IndexedDB with AES-GCM encryption
 *
 * Pre-key private keys are encrypted at rest with the same passphrase-derived
 * wrapping key used for device keys (Argon2id). The backend is shared with
 * deviceKeyStorage via `setDeviceKeyStorageBackend`.
 *
 * @module services/preKeyStorage
 */

import { toBase64, fromBase64, clearBytes } from '@adieuu/crypto';
import type { SecureStorage } from '../config/types';

const DB_NAME = 'adieuu-pre-keys';
const DB_VERSION = 1;
const SPK_STORE = 'signedPreKeys';
const OTPK_STORE = 'oneTimePreKeys';

const PREKEY_KEY_PREFIX = 'pkeys-';

// ============================================================================
// Types
// ============================================================================

export type SpkStatus = 'active' | 'retired';

/**
 * A signed pre-key stored locally with encrypted private keys.
 */
export interface StoredSignedPreKey {
  keyId: string;
  identityId: string;
  deviceId: string;
  ecdhPrivateKeyEncrypted: { ciphertext: string; nonce: string };
  kemPrivateKeyEncrypted: { ciphertext: string; nonce: string };
  status: SpkStatus;
  createdAt: string;
  retiredAt?: string;
}

/**
 * A one-time pre-key stored locally with encrypted private keys.
 */
export interface StoredOneTimePreKey {
  keyId: string;
  identityId: string;
  deviceId: string;
  ecdhPrivateKeyEncrypted: { ciphertext: string; nonce: string };
  kemPrivateKeyEncrypted: { ciphertext: string; nonce: string };
  createdAt: string;
}

/**
 * Decrypted pre-key private keys for runtime use.
 */
export interface DecryptedPreKeyPair {
  keyId: string;
  ecdhPrivateKey: Uint8Array;
  kemPrivateKey: Uint8Array;
}

/**
 * The full pre-key store blob for a single identity (used by SecureStorage backend).
 */
interface PreKeyStoreBlob {
  signedPreKeys: StoredSignedPreKey[];
  oneTimePreKeys: StoredOneTimePreKey[];
}

export class PreKeyStorageError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'PreKeyStorageError';
  }
}

// ============================================================================
// Backend Reference (shared with deviceKeyStorage)
// ============================================================================

let storageBackend: SecureStorage | null = null;

/**
 * Sets the storage backend for pre-keys.
 * Should be called with the same backend as deviceKeyStorage at app init.
 */
export function setPreKeyStorageBackend(backend: SecureStorage | null): void {
  storageBackend = backend;
}

// ============================================================================
// SecureStorage Backend (Desktop) -- Per-Identity Blobs
// ============================================================================

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

async function preKeyStoreId(identityId: string): Promise<string> {
  const data = new TextEncoder().encode(identityId);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return `${PREKEY_KEY_PREFIX}${toHex(new Uint8Array(hash)).slice(0, 32)}`;
}

async function getPreKeyBlob(identityId: string): Promise<PreKeyStoreBlob> {
  if (!storageBackend) throw new Error('No storage backend set');
  const keyId = await preKeyStoreId(identityId);
  const raw = await storageBackend.getKey(keyId);
  if (!raw) return { signedPreKeys: [], oneTimePreKeys: [] };
  return JSON.parse(new TextDecoder().decode(raw)) as PreKeyStoreBlob;
}

async function savePreKeyBlob(identityId: string, blob: PreKeyStoreBlob): Promise<void> {
  if (!storageBackend) throw new Error('No storage backend set');
  const keyId = await preKeyStoreId(identityId);
  if (blob.signedPreKeys.length === 0 && blob.oneTimePreKeys.length === 0) {
    await storageBackend.deleteKey(keyId);
    return;
  }
  const json = JSON.stringify(blob);
  await storageBackend.setKey(keyId, new TextEncoder().encode(json));
}

// ============================================================================
// IndexedDB Helpers (Web)
// ============================================================================

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new PreKeyStorageError('IndexedDB is not available', 'INDEXEDDB_UNAVAILABLE'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new PreKeyStorageError(
        `Failed to open pre-key database: ${request.error?.message ?? 'Unknown error'}`,
        'DATABASE_OPEN_FAILED'
      ));
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SPK_STORE)) {
        const spkStore = db.createObjectStore(SPK_STORE, { keyPath: 'keyId' });
        spkStore.createIndex('identityId', 'identityId', { unique: false });
        spkStore.createIndex('deviceId', 'deviceId', { unique: false });
        spkStore.createIndex('identity_device', ['identityId', 'deviceId'], { unique: false });
      }
      if (!db.objectStoreNames.contains(OTPK_STORE)) {
        const otpkStore = db.createObjectStore(OTPK_STORE, { keyPath: 'keyId' });
        otpkStore.createIndex('identityId', 'identityId', { unique: false });
        otpkStore.createIndex('deviceId', 'deviceId', { unique: false });
        otpkStore.createIndex('identity_device', ['identityId', 'deviceId'], { unique: false });
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
// Signed Pre-Key (SPK) Storage
// ============================================================================

/**
 * Stores a signed pre-key. Private keys are encrypted with the wrapping key
 * and the original arrays are cleared from memory.
 */
export async function storeSignedPreKey(
  keyId: string,
  identityId: string,
  deviceId: string,
  ecdhPrivateKey: Uint8Array,
  kemPrivateKey: Uint8Array,
  wrappingKey: Uint8Array
): Promise<void> {
  const ecdhEncrypted = await encryptWithWrappingKey(ecdhPrivateKey, wrappingKey);
  const kemEncrypted = await encryptWithWrappingKey(kemPrivateKey, wrappingKey);

  clearBytes(ecdhPrivateKey);
  clearBytes(kemPrivateKey);

  const record: StoredSignedPreKey = {
    keyId,
    identityId,
    deviceId,
    ecdhPrivateKeyEncrypted: ecdhEncrypted,
    kemPrivateKeyEncrypted: kemEncrypted,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  if (storageBackend) {
    const blob = await getPreKeyBlob(identityId);
    blob.signedPreKeys.push(record);
    await savePreKeyBlob(identityId, blob);
    return;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SPK_STORE, 'readwrite');
    const store = tx.objectStore(SPK_STORE);
    const request = store.put(record);
    request.onerror = () => reject(new PreKeyStorageError('Failed to store SPK', 'STORAGE_FAILED'));
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Gets the active SPK for a device. Returns null if no active SPK exists.
 */
export async function getActiveSignedPreKey(
  identityId: string,
  deviceId: string
): Promise<StoredSignedPreKey | null> {
  if (storageBackend) {
    const blob = await getPreKeyBlob(identityId);
    return blob.signedPreKeys.find(
      (spk) => spk.deviceId === deviceId && spk.status === 'active'
    ) ?? null;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SPK_STORE, 'readonly');
    const store = tx.objectStore(SPK_STORE);
    const index = store.index('identity_device');
    const request = index.getAll([identityId, deviceId]);
    request.onerror = () => reject(new PreKeyStorageError('Failed to query SPKs', 'RETRIEVAL_FAILED'));
    request.onsuccess = () => {
      const results = (request.result as StoredSignedPreKey[])
        .filter((spk) => spk.status === 'active');
      resolve(results[0] ?? null);
    };
    tx.oncomplete = () => db.close();
  });
}

/**
 * Gets all retired SPKs for a device, ordered by retirement time (oldest first).
 */
export async function getRetiredSignedPreKeys(
  identityId: string,
  deviceId: string
): Promise<StoredSignedPreKey[]> {
  if (storageBackend) {
    const blob = await getPreKeyBlob(identityId);
    return blob.signedPreKeys
      .filter((spk) => spk.deviceId === deviceId && spk.status === 'retired')
      .sort((a, b) => (a.retiredAt ?? '').localeCompare(b.retiredAt ?? ''));
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SPK_STORE, 'readonly');
    const store = tx.objectStore(SPK_STORE);
    const index = store.index('identity_device');
    const request = index.getAll([identityId, deviceId]);
    request.onerror = () => reject(new PreKeyStorageError('Failed to query SPKs', 'RETRIEVAL_FAILED'));
    request.onsuccess = () => {
      const results = (request.result as StoredSignedPreKey[])
        .filter((spk) => spk.status === 'retired')
        .sort((a, b) => (a.retiredAt ?? '').localeCompare(b.retiredAt ?? ''));
      resolve(results);
    };
    tx.oncomplete = () => db.close();
  });
}

/**
 * Marks an active SPK as retired. The private key is kept for pending message decryption.
 */
export async function retireSignedPreKey(
  keyId: string,
  identityId: string
): Promise<void> {
  if (storageBackend) {
    const blob = await getPreKeyBlob(identityId);
    const spk = blob.signedPreKeys.find((s) => s.keyId === keyId);
    if (spk) {
      spk.status = 'retired';
      spk.retiredAt = new Date().toISOString();
      await savePreKeyBlob(identityId, blob);
    }
    return;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SPK_STORE, 'readwrite');
    const store = tx.objectStore(SPK_STORE);
    const getReq = store.get(keyId);
    getReq.onerror = () => reject(new PreKeyStorageError('Failed to get SPK', 'RETRIEVAL_FAILED'));
    getReq.onsuccess = () => {
      const record = getReq.result as StoredSignedPreKey | undefined;
      if (!record) { resolve(); return; }
      record.status = 'retired';
      record.retiredAt = new Date().toISOString();
      const putReq = store.put(record);
      putReq.onerror = () => reject(new PreKeyStorageError('Failed to retire SPK', 'STORAGE_FAILED'));
      putReq.onsuccess = () => resolve();
    };
    tx.oncomplete = () => db.close();
  });
}

/**
 * Decrypts a stored SPK's private keys for use in message decryption.
 */
export async function decryptSignedPreKey(
  stored: StoredSignedPreKey,
  wrappingKey: Uint8Array
): Promise<DecryptedPreKeyPair> {
  let ecdhPrivateKey: Uint8Array;
  let kemPrivateKey: Uint8Array;

  try {
    ecdhPrivateKey = await decryptWithWrappingKey(stored.ecdhPrivateKeyEncrypted, wrappingKey);
  } catch {
    throw new PreKeyStorageError('Failed to decrypt SPK ECDH key', 'ECDH_DECRYPTION_FAILED');
  }

  try {
    kemPrivateKey = await decryptWithWrappingKey(stored.kemPrivateKeyEncrypted, wrappingKey);
  } catch {
    clearBytes(ecdhPrivateKey);
    throw new PreKeyStorageError('Failed to decrypt SPK KEM key', 'KEM_DECRYPTION_FAILED');
  }

  return { keyId: stored.keyId, ecdhPrivateKey, kemPrivateKey };
}

/**
 * Finds and decrypts an SPK by key ID. Returns null if not found.
 */
export async function findAndDecryptSignedPreKey(
  keyId: string,
  identityId: string,
  wrappingKey: Uint8Array
): Promise<DecryptedPreKeyPair | null> {
  let stored: StoredSignedPreKey | undefined;

  if (storageBackend) {
    const blob = await getPreKeyBlob(identityId);
    stored = blob.signedPreKeys.find((s) => s.keyId === keyId);
  } else {
    const db = await openDatabase();
    stored = await new Promise((resolve, reject) => {
      const tx = db.transaction(SPK_STORE, 'readonly');
      const store = tx.objectStore(SPK_STORE);
      const request = store.get(keyId);
      request.onerror = () => reject(new PreKeyStorageError('Failed to get SPK', 'RETRIEVAL_FAILED'));
      request.onsuccess = () => resolve(request.result as StoredSignedPreKey | undefined);
      tx.oncomplete = () => db.close();
    });
  }

  if (!stored) return null;
  return decryptSignedPreKey(stored, wrappingKey);
}

/**
 * Permanently deletes an SPK by key ID.
 */
export async function deleteSignedPreKey(
  keyId: string,
  identityId: string
): Promise<void> {
  if (storageBackend) {
    const blob = await getPreKeyBlob(identityId);
    blob.signedPreKeys = blob.signedPreKeys.filter((s) => s.keyId !== keyId);
    await savePreKeyBlob(identityId, blob);
    return;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SPK_STORE, 'readwrite');
    const store = tx.objectStore(SPK_STORE);
    const request = store.delete(keyId);
    request.onerror = () => reject(new PreKeyStorageError('Failed to delete SPK', 'DELETE_FAILED'));
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

// ============================================================================
// One-Time Pre-Key (OTPK) Storage
// ============================================================================

/**
 * Stores a batch of OTPKs. Private keys are encrypted with the wrapping key
 * and the original arrays are cleared from memory.
 */
export async function storeOneTimePreKeys(
  keys: Array<{
    keyId: string;
    ecdhPrivateKey: Uint8Array;
    kemPrivateKey: Uint8Array;
  }>,
  identityId: string,
  deviceId: string,
  wrappingKey: Uint8Array
): Promise<void> {
  const records: StoredOneTimePreKey[] = [];
  const now = new Date().toISOString();

  for (const key of keys) {
    const ecdhEncrypted = await encryptWithWrappingKey(key.ecdhPrivateKey, wrappingKey);
    const kemEncrypted = await encryptWithWrappingKey(key.kemPrivateKey, wrappingKey);
    clearBytes(key.ecdhPrivateKey);
    clearBytes(key.kemPrivateKey);

    records.push({
      keyId: key.keyId,
      identityId,
      deviceId,
      ecdhPrivateKeyEncrypted: ecdhEncrypted,
      kemPrivateKeyEncrypted: kemEncrypted,
      createdAt: now,
    });
  }

  if (storageBackend) {
    const blob = await getPreKeyBlob(identityId);
    blob.oneTimePreKeys.push(...records);
    await savePreKeyBlob(identityId, blob);
    return;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OTPK_STORE, 'readwrite');
    const store = tx.objectStore(OTPK_STORE);
    let completed = 0;

    for (const record of records) {
      const request = store.put(record);
      request.onerror = () => reject(new PreKeyStorageError('Failed to store OTPK', 'STORAGE_FAILED'));
      request.onsuccess = () => {
        completed++;
        if (completed === records.length) resolve();
      };
    }

    if (records.length === 0) resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Finds and decrypts an OTPK by key ID. Returns null if not found.
 */
export async function findAndDecryptOneTimePreKey(
  keyId: string,
  identityId: string,
  wrappingKey: Uint8Array
): Promise<DecryptedPreKeyPair | null> {
  let stored: StoredOneTimePreKey | undefined;

  if (storageBackend) {
    const blob = await getPreKeyBlob(identityId);
    stored = blob.oneTimePreKeys.find((o) => o.keyId === keyId);
  } else {
    const db = await openDatabase();
    stored = await new Promise((resolve, reject) => {
      const tx = db.transaction(OTPK_STORE, 'readonly');
      const store = tx.objectStore(OTPK_STORE);
      const request = store.get(keyId);
      request.onerror = () => reject(new PreKeyStorageError('Failed to get OTPK', 'RETRIEVAL_FAILED'));
      request.onsuccess = () => resolve(request.result as StoredOneTimePreKey | undefined);
      tx.oncomplete = () => db.close();
    });
  }

  if (!stored) return null;

  let ecdhPrivateKey: Uint8Array;
  let kemPrivateKey: Uint8Array;

  try {
    ecdhPrivateKey = await decryptWithWrappingKey(stored.ecdhPrivateKeyEncrypted, wrappingKey);
  } catch {
    throw new PreKeyStorageError('Failed to decrypt OTPK ECDH key', 'ECDH_DECRYPTION_FAILED');
  }

  try {
    kemPrivateKey = await decryptWithWrappingKey(stored.kemPrivateKeyEncrypted, wrappingKey);
  } catch {
    clearBytes(ecdhPrivateKey);
    throw new PreKeyStorageError('Failed to decrypt OTPK KEM key', 'KEM_DECRYPTION_FAILED');
  }

  return { keyId: stored.keyId, ecdhPrivateKey, kemPrivateKey };
}

/**
 * Permanently deletes an OTPK by key ID.
 * Called after the OTPK has been used to decrypt a message.
 */
export async function deleteOneTimePreKey(
  keyId: string,
  identityId: string
): Promise<void> {
  if (storageBackend) {
    const blob = await getPreKeyBlob(identityId);
    blob.oneTimePreKeys = blob.oneTimePreKeys.filter((o) => o.keyId !== keyId);
    await savePreKeyBlob(identityId, blob);
    return;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OTPK_STORE, 'readwrite');
    const store = tx.objectStore(OTPK_STORE);
    const request = store.delete(keyId);
    request.onerror = () => reject(new PreKeyStorageError('Failed to delete OTPK', 'DELETE_FAILED'));
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Counts remaining OTPKs for a device.
 */
export async function getOneTimePreKeyCount(
  identityId: string,
  deviceId: string
): Promise<number> {
  if (storageBackend) {
    const blob = await getPreKeyBlob(identityId);
    return blob.oneTimePreKeys.filter((o) => o.deviceId === deviceId).length;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OTPK_STORE, 'readonly');
    const store = tx.objectStore(OTPK_STORE);
    const index = store.index('identity_device');
    const request = index.count([identityId, deviceId]);
    request.onerror = () => reject(new PreKeyStorageError('Failed to count OTPKs', 'RETRIEVAL_FAILED'));
    request.onsuccess = () => resolve(request.result);
    tx.oncomplete = () => db.close();
  });
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Deletes all pre-keys (SPKs and OTPKs) for an identity.
 */
export async function deleteAllPreKeysForIdentity(identityId: string): Promise<void> {
  if (storageBackend) {
    await savePreKeyBlob(identityId, { signedPreKeys: [], oneTimePreKeys: [] });
    return;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SPK_STORE, OTPK_STORE], 'readwrite');

    const deleteFromStore = (storeName: string): Promise<void> => {
      return new Promise((res, rej) => {
        const store = tx.objectStore(storeName);
        const index = store.index('identityId');
        const cursorReq = index.openCursor(identityId);
        cursorReq.onerror = () => rej(new PreKeyStorageError('Failed to delete pre-keys', 'DELETE_FAILED'));
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            res();
          }
        };
      });
    };

    Promise.all([
      deleteFromStore(SPK_STORE),
      deleteFromStore(OTPK_STORE),
    ]).then(() => resolve()).catch(reject);

    tx.oncomplete = () => db.close();
  });
}

/**
 * Clears all pre-keys from the database.
 */
export async function clearAllPreKeys(): Promise<void> {
  if (storageBackend) {
    if (storageBackend.listKeys) {
      const allKeyIds = await storageBackend.listKeys(PREKEY_KEY_PREFIX);
      for (const keyId of allKeyIds) {
        await storageBackend.deleteKey(keyId);
      }
    } else {
      console.warn('[PreKeyStorage] clearAllPreKeys: listKeys not available, cannot clear SecureStorage backend');
    }
    return;
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SPK_STORE, OTPK_STORE], 'readwrite');

    tx.objectStore(SPK_STORE).clear();
    tx.objectStore(OTPK_STORE).clear();

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new PreKeyStorageError('Failed to clear pre-keys', 'CLEAR_FAILED'));
    };
    tx.onabort = () => {
      db.close();
      reject(new PreKeyStorageError('Failed to clear pre-keys', 'CLEAR_FAILED'));
    };
  });
}
