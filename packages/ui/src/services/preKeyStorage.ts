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

// HMR-safe state: module-level variables are wiped when Vite hot-replaces
// this module, but globalThis survives. We stash the runtime references there
// so that pre-key lookups continue to work without a full page reload.
const HMR_KEY = '__adieuu_preKeyStorage__' as const;

interface PreKeyHmrState {
  backend: SecureStorage | null;
  backendWasSet: boolean;
  blobLocks: Map<string, Promise<void>>;
}

function getHmrState(): PreKeyHmrState {
  const g = globalThis as Record<string, unknown>;
  if (!g[HMR_KEY]) {
    g[HMR_KEY] = {
      backend: null,
      backendWasSet: false,
      blobLocks: new Map<string, Promise<void>>(),
    };
  }
  return g[HMR_KEY] as PreKeyHmrState;
}

function getBackend(): SecureStorage | null { return getHmrState().backend; }

/**
 * Sets the storage backend for pre-keys.
 * Should be called with the same backend as deviceKeyStorage at app init.
 */
export function setPreKeyStorageBackend(backend: SecureStorage | null): void {
  const s = getHmrState();
  s.backend = backend;
  if (backend) s.backendWasSet = true;
}

/**
 * Returns true when the backend was previously configured but the reference
 * has been lost — typically caused by HMR re-evaluating this module while the
 * entry-point (main.tsx) does not re-run setPreKeyStorageBackend.
 */
function isBackendLost(): boolean {
  const s = getHmrState();
  if (!s.backend && s.backendWasSet) {
    console.error(
      '[PreKeyStorage] storageBackend reference lost (likely HMR module re-evaluation). ' +
      'Pre-key lookups will incorrectly fall back to IndexedDB where the keys do not exist. ' +
      'A full page reload should restore correct behaviour.'
    );
    return true;
  }
  return false;
}

async function withBlobLock<T>(identityId: string, fn: () => Promise<T>): Promise<T> {
  const locks = getHmrState().blobLocks;
  const prev = locks.get(identityId) ?? Promise.resolve();
  let releaseLock!: () => void;
  const lockPromise = new Promise<void>((resolve) => { releaseLock = resolve; });
  locks.set(identityId, lockPromise);

  await prev;
  try {
    return await fn();
  } finally {
    releaseLock();
    if (locks.get(identityId) === lockPromise) {
      locks.delete(identityId);
    }
  }
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
  const backend = getBackend();
  if (!backend) throw new Error('No storage backend set');
  const keyId = await preKeyStoreId(identityId);
  const raw = await backend.getKey(keyId);
  if (!raw) {
    console.debug('[PreKeyStorage] getPreKeyBlob: no blob found for identity', identityId.slice(0, 8));
    return { signedPreKeys: [], oneTimePreKeys: [] };
  }
  const blob = JSON.parse(new TextDecoder().decode(raw)) as PreKeyStoreBlob;
  console.debug(
    '[PreKeyStorage] getPreKeyBlob: loaded',
    blob.signedPreKeys.length, 'SPK(s),',
    blob.oneTimePreKeys.length, 'OTPK(s) for identity',
    identityId.slice(0, 8)
  );
  return blob;
}

async function savePreKeyBlob(identityId: string, blob: PreKeyStoreBlob): Promise<void> {
  const backend = getBackend();
  if (!backend) throw new Error('No storage backend set');
  const keyId = await preKeyStoreId(identityId);
  if (blob.signedPreKeys.length === 0 && blob.oneTimePreKeys.length === 0) {
    console.warn(
      '[PreKeyStorage] savePreKeyBlob: both arrays empty — deleting blob file for identity',
      identityId.slice(0, 8),
      '(this may indicate a data loss bug if unexpected)'
    );
    await backend.deleteKey(keyId);
    return;
  }
  console.debug(
    '[PreKeyStorage] savePreKeyBlob: saving',
    blob.signedPreKeys.length, 'SPK(s),',
    blob.oneTimePreKeys.length, 'OTPK(s) for identity',
    identityId.slice(0, 8)
  );
  const json = JSON.stringify(blob);
  await backend.setKey(keyId, new TextEncoder().encode(json));
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

  if (getBackend()) {
    await withBlobLock(identityId, async () => {
      const blob = await getPreKeyBlob(identityId);
      blob.signedPreKeys.push(record);
      await savePreKeyBlob(identityId, blob);
    });
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
  if (isBackendLost()) return null;

  if (getBackend()) {
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
  if (isBackendLost()) return [];

  if (getBackend()) {
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
  if (getBackend()) {
    await withBlobLock(identityId, async () => {
      const blob = await getPreKeyBlob(identityId);
      const spk = blob.signedPreKeys.find((s) => s.keyId === keyId);
      if (spk) {
        spk.status = 'retired';
        spk.retiredAt = new Date().toISOString();
        await savePreKeyBlob(identityId, blob);
      }
    });
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
  if (isBackendLost()) return null;

  let stored: StoredSignedPreKey | undefined;

  if (getBackend()) {
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
  if (getBackend()) {
    await withBlobLock(identityId, async () => {
      const blob = await getPreKeyBlob(identityId);
      blob.signedPreKeys = blob.signedPreKeys.filter((s) => s.keyId !== keyId);
      await savePreKeyBlob(identityId, blob);
    });
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

  if (getBackend()) {
    await withBlobLock(identityId, async () => {
      const blob = await getPreKeyBlob(identityId);
      blob.oneTimePreKeys.push(...records);
      await savePreKeyBlob(identityId, blob);
    });
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
  if (isBackendLost()) return null;

  let stored: StoredOneTimePreKey | undefined;

  if (getBackend()) {
    const blob = await getPreKeyBlob(identityId);
    stored = blob.oneTimePreKeys.find((o) => o.keyId === keyId);
    if (!stored) {
      const storedIds = blob.oneTimePreKeys.map((o) => o.keyId.slice(0, 8));
      console.warn(
        `[PreKeyStorage] OTPK ${keyId.slice(0, 8)} not in blob.`,
        `Blob has ${blob.signedPreKeys.length} SPK(s) and ${blob.oneTimePreKeys.length} OTPK(s).`,
        blob.oneTimePreKeys.length > 0
          ? `Stored OTPK IDs: ${storedIds.join(', ')}`
          : 'Blob contains zero OTPKs.'
      );
    }
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
  if (getBackend()) {
    await withBlobLock(identityId, async () => {
      const blob = await getPreKeyBlob(identityId);
      blob.oneTimePreKeys = blob.oneTimePreKeys.filter((o) => o.keyId !== keyId);
      await savePreKeyBlob(identityId, blob);
    });
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
  if (isBackendLost()) return 0;

  if (getBackend()) {
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
 * Returns the sorted key IDs of all OTPKs for a device.
 * Used to compute a local digest for server-local consistency checking.
 */
export async function getOneTimePreKeyIds(
  identityId: string,
  deviceId: string
): Promise<string[]> {
  if (isBackendLost()) return [];

  if (getBackend()) {
    const blob = await getPreKeyBlob(identityId);
    return blob.oneTimePreKeys
      .filter((o) => o.deviceId === deviceId)
      .map((o) => o.keyId)
      .sort();
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OTPK_STORE, 'readonly');
    const store = tx.objectStore(OTPK_STORE);
    const index = store.index('identity_device');
    const request = index.getAll([identityId, deviceId]);
    request.onerror = () => reject(new PreKeyStorageError('Failed to query OTPKs', 'RETRIEVAL_FAILED'));
    request.onsuccess = () => {
      const results = (request.result as StoredOneTimePreKey[]).map((o) => o.keyId).sort();
      resolve(results);
    };
    tx.oncomplete = () => db.close();
  });
}

/**
 * Clears all one-time pre-keys for a specific device from the blob,
 * preserving signed pre-keys. Used during OTPK pool resynchronisation.
 *
 * @returns Number of OTPKs removed.
 */
export async function clearOneTimePreKeysForDevice(
  identityId: string,
  deviceId: string
): Promise<number> {
  if (getBackend()) {
    return await withBlobLock(identityId, async () => {
      const blob = await getPreKeyBlob(identityId);
      const before = blob.oneTimePreKeys.length;
      blob.oneTimePreKeys = blob.oneTimePreKeys.filter((o) => o.deviceId !== deviceId);
      const removed = before - blob.oneTimePreKeys.length;
      if (removed > 0) {
        await savePreKeyBlob(identityId, blob);
      }
      return removed;
    });
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OTPK_STORE, 'readwrite');
    const store = tx.objectStore(OTPK_STORE);
    const index = store.index('deviceId');
    const cursorReq = index.openCursor(deviceId);
    let count = 0;

    cursorReq.onerror = () =>
      reject(new PreKeyStorageError('Failed to clear OTPKs for device', 'DELETE_FAILED'));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        const record = cursor.value as StoredOneTimePreKey;
        if (record.identityId === identityId) {
          cursor.delete();
          count++;
        }
        cursor.continue();
      } else {
        resolve(count);
      }
    };

    tx.oncomplete = () => db.close();
  });
}

/**
 * Clears all OTPKs for a device EXCEPT those whose key IDs are in
 * `keepKeyIds`. Used during resync to preserve private keys for
 * OTPKs that were already claimed server-side (in-flight messages).
 *
 * @returns Number of OTPKs removed.
 */
export async function clearOneTimePreKeysExcept(
  identityId: string,
  deviceId: string,
  keepKeyIds: string[]
): Promise<number> {
  const keepSet = new Set(keepKeyIds);

  if (getBackend()) {
    return await withBlobLock(identityId, async () => {
      const blob = await getPreKeyBlob(identityId);
      const before = blob.oneTimePreKeys.length;
      blob.oneTimePreKeys = blob.oneTimePreKeys.filter(
        (o) => o.deviceId !== deviceId || keepSet.has(o.keyId)
      );
      const removed = before - blob.oneTimePreKeys.length;
      if (removed > 0) {
        await savePreKeyBlob(identityId, blob);
      }
      return removed;
    });
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OTPK_STORE, 'readwrite');
    const store = tx.objectStore(OTPK_STORE);
    const index = store.index('deviceId');
    const cursorReq = index.openCursor(deviceId);
    let count = 0;

    cursorReq.onerror = () =>
      reject(new PreKeyStorageError('Failed to selectively clear OTPKs for device', 'DELETE_FAILED'));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        const record = cursor.value as StoredOneTimePreKey;
        if (record.identityId === identityId && !keepSet.has(record.keyId)) {
          cursor.delete();
          count++;
        }
        cursor.continue();
      } else {
        resolve(count);
      }
    };

    tx.oncomplete = () => db.close();
  });
}

/**
 * Deletes all pre-keys (SPKs and OTPKs) for an identity.
 */
export async function deleteAllPreKeysForIdentity(identityId: string): Promise<void> {
  if (getBackend()) {
    await withBlobLock(identityId, async () => {
      await savePreKeyBlob(identityId, { signedPreKeys: [], oneTimePreKeys: [] });
    });
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
  const backend = getBackend();
  if (backend) {
    if (backend.listKeys) {
      const allKeyIds = await backend.listKeys(PREKEY_KEY_PREFIX);
      for (const keyId of allKeyIds) {
        await backend.deleteKey(keyId);
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

// ============================================================================
// Session Key Cache (persistent, encrypted at rest)
//
// Stores decrypted session keys for FS-encrypted messages so they survive
// page refreshes and component remounts. Without this, OTPK-encrypted
// messages become permanently unreadable after the OTPK is deleted
// post-decrypt, because the volatile in-memory cache is the only copy.
//
// Session keys are encrypted with the same wrapping key used for pre-keys.
// They can be evicted on SPK rotation when clearCacheOnRotation is enabled.
// ============================================================================

const SK_DB_NAME = 'adieuu-session-keys';
const SK_DB_VERSION = 1;
const SK_STORE = 'sessionKeys';
const SK_KEY_PREFIX = 'skeys-';

interface StoredSessionKey {
  messageId: string;
  identityId: string;
  encryptedKey: { ciphertext: string; nonce: string };
  signedPreKeyId?: string;
  createdAt: string;
}

interface SessionKeyBlob {
  sessionKeys: StoredSessionKey[];
}

function openSessionKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new PreKeyStorageError('IndexedDB is not available', 'INDEXEDDB_UNAVAILABLE'));
      return;
    }

    const request = indexedDB.open(SK_DB_NAME, SK_DB_VERSION);

    request.onerror = () => {
      reject(new PreKeyStorageError(
        `Failed to open session key database: ${request.error?.message ?? 'Unknown error'}`,
        'DATABASE_OPEN_FAILED'
      ));
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SK_STORE)) {
        const store = db.createObjectStore(SK_STORE, { keyPath: 'messageId' });
        store.createIndex('identityId', 'identityId', { unique: false });
        store.createIndex('signedPreKeyId', 'signedPreKeyId', { unique: false });
      }
    };
  });
}

async function sessionKeyStoreId(identityId: string): Promise<string> {
  const data = new TextEncoder().encode(identityId);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return `${SK_KEY_PREFIX}${toHex(new Uint8Array(hash)).slice(0, 32)}`;
}

async function getSessionKeyBlob(identityId: string): Promise<SessionKeyBlob> {
  const backend = getBackend();
  if (!backend) throw new Error('No storage backend set');
  const keyId = await sessionKeyStoreId(identityId);
  const raw = await backend.getKey(keyId);
  if (!raw) return { sessionKeys: [] };
  return JSON.parse(new TextDecoder().decode(raw)) as SessionKeyBlob;
}

async function saveSessionKeyBlob(identityId: string, blob: SessionKeyBlob): Promise<void> {
  const backend = getBackend();
  if (!backend) throw new Error('No storage backend set');
  const keyId = await sessionKeyStoreId(identityId);
  if (blob.sessionKeys.length === 0) {
    await backend.deleteKey(keyId);
    return;
  }
  const json = JSON.stringify(blob);
  await backend.setKey(keyId, new TextEncoder().encode(json));
}

/**
 * Persistently stores an encrypted session key for a message.
 * Called after successful OTPK-based decryption, before the OTPK is deleted.
 */
export async function storeSessionKey(
  messageId: string,
  identityId: string,
  sessionKey: Uint8Array,
  wrappingKey: Uint8Array,
  signedPreKeyId?: string
): Promise<void> {
  const encryptedKey = await encryptWithWrappingKey(sessionKey, wrappingKey);

  const record: StoredSessionKey = {
    messageId,
    identityId,
    encryptedKey,
    signedPreKeyId,
    createdAt: new Date().toISOString(),
  };

  if (getBackend()) {
    await withBlobLock(identityId, async () => {
      const blob = await getSessionKeyBlob(identityId);
      const idx = blob.sessionKeys.findIndex((s) => s.messageId === messageId);
      if (idx >= 0) {
        blob.sessionKeys[idx] = record;
      } else {
        blob.sessionKeys.push(record);
      }
      await saveSessionKeyBlob(identityId, blob);
    });
    return;
  }

  const db = await openSessionKeyDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SK_STORE, 'readwrite');
    const store = tx.objectStore(SK_STORE);
    const request = store.put(record);
    request.onerror = () => reject(new PreKeyStorageError('Failed to store session key', 'STORAGE_FAILED'));
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Retrieves and decrypts a persisted session key for a message.
 * Returns null if no session key is stored for the given message.
 */
export async function getPersistedSessionKey(
  messageId: string,
  identityId: string,
  wrappingKey: Uint8Array
): Promise<Uint8Array | null> {
  if (isBackendLost()) return null;

  let stored: StoredSessionKey | undefined;

  if (getBackend()) {
    const blob = await getSessionKeyBlob(identityId);
    stored = blob.sessionKeys.find((s) => s.messageId === messageId);
  } else {
    const db = await openSessionKeyDatabase();
    stored = await new Promise((resolve, reject) => {
      const tx = db.transaction(SK_STORE, 'readonly');
      const store = tx.objectStore(SK_STORE);
      const request = store.get(messageId);
      request.onerror = () => reject(new PreKeyStorageError('Failed to get session key', 'RETRIEVAL_FAILED'));
      request.onsuccess = () => resolve(request.result as StoredSessionKey | undefined);
      tx.oncomplete = () => db.close();
    });
  }

  if (!stored) return null;

  try {
    return await decryptWithWrappingKey(stored.encryptedKey, wrappingKey);
  } catch {
    console.warn('[PreKeyStorage] Failed to decrypt persisted session key for message', messageId.slice(0, 8));
    return null;
  }
}

/**
 * Removes a persisted session key for a message (e.g. when the message is deleted).
 */
export async function deletePersistedSessionKey(
  messageId: string,
  identityId: string
): Promise<void> {
  if (getBackend()) {
    await withBlobLock(identityId, async () => {
      const blob = await getSessionKeyBlob(identityId);
      blob.sessionKeys = blob.sessionKeys.filter((s) => s.messageId !== messageId);
      await saveSessionKeyBlob(identityId, blob);
    });
    return;
  }

  const db = await openSessionKeyDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SK_STORE, 'readwrite');
    const store = tx.objectStore(SK_STORE);
    const request = store.delete(messageId);
    request.onerror = () => reject(new PreKeyStorageError('Failed to delete session key', 'DELETE_FAILED'));
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Removes all persisted session keys associated with a given signed pre-key.
 * Called when clearCacheOnRotation is enabled and an SPK is rotated,
 * enforcing forward secrecy by evicting session keys from that key period.
 */
export async function deleteSessionKeysForSpk(
  signedPreKeyId: string,
  identityId: string
): Promise<number> {
  if (getBackend()) {
    return await withBlobLock(identityId, async () => {
      const blob = await getSessionKeyBlob(identityId);
      const before = blob.sessionKeys.length;
      blob.sessionKeys = blob.sessionKeys.filter((s) => s.signedPreKeyId !== signedPreKeyId);
      const removed = before - blob.sessionKeys.length;
      if (removed > 0) {
        await saveSessionKeyBlob(identityId, blob);
      }
      return removed;
    });
  }

  const db = await openSessionKeyDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SK_STORE, 'readwrite');
    const store = tx.objectStore(SK_STORE);
    const index = store.index('signedPreKeyId');
    const cursorReq = index.openCursor(signedPreKeyId);
    let count = 0;

    cursorReq.onerror = () =>
      reject(new PreKeyStorageError('Failed to delete session keys for SPK', 'DELETE_FAILED'));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        count++;
        cursor.continue();
      } else {
        resolve(count);
      }
    };

    tx.oncomplete = () => db.close();
  });
}

/**
 * Removes all persisted session keys for an identity.
 */
export async function clearAllSessionKeys(identityId: string): Promise<void> {
  if (getBackend()) {
    await withBlobLock(identityId, async () => {
      await saveSessionKeyBlob(identityId, { sessionKeys: [] });
    });
    return;
  }

  const db = await openSessionKeyDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SK_STORE, 'readwrite');
    const store = tx.objectStore(SK_STORE);
    const index = store.index('identityId');
    const cursorReq = index.openCursor(identityId);

    cursorReq.onerror = () =>
      reject(new PreKeyStorageError('Failed to clear session keys', 'CLEAR_FAILED'));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };

    tx.oncomplete = () => db.close();
  });
}
