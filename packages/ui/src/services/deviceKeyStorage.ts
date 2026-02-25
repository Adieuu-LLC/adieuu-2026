/**
 * Device Key Storage Service
 *
 * Stores device private keys in IndexedDB using a combination of Web Crypto
 * non-extractable keys and encrypted storage.
 *
 * SECURITY ARCHITECTURE:
 * - ECDH keys (X25519): Cannot use Web Crypto non-extractable (no X25519 support)
 *   so we encrypt them with the wrapping key derived from passphrase
 * - KEM keys (ML-KEM): Also encrypted with wrapping key (no native support)
 *
 * The wrapping key is derived from the identity passphrase using Argon2id
 * and is only held in memory during the session. This provides XSS protection
 * since attackers cannot exfiltrate the raw key material without the passphrase.
 *
 * NOTE: Web Crypto doesn't support X25519 or ML-KEM natively, so we cannot use
 * truly non-extractable CryptoKey objects. Instead, we encrypt the key material
 * with a passphrase-derived wrapping key.
 *
 * @module services/deviceKeyStorage
 */

import { toBase64, fromBase64, clearBytes } from '@adieuu/crypto';

const DB_NAME = 'adieuu-device-keys';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

/**
 * Stored device key record in IndexedDB.
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

/**
 * Opens the device key database.
 */
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

/**
 * Copies a Uint8Array to a new ArrayBuffer.
 * This ensures we get a proper ArrayBuffer (not SharedArrayBuffer).
 */
function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(arr.length);
  copy.set(arr);
  return copy.buffer as ArrayBuffer;
}

/**
 * Encrypts data with AES-GCM using the wrapping key.
 */
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

/**
 * Decrypts data with AES-GCM using the wrapping key.
 */
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

/**
 * Stores device keys in IndexedDB.
 *
 * The private keys are encrypted with the wrapping key before storage.
 * The original key arrays are cleared from memory after encryption.
 *
 * @param deviceId - Unique device identifier
 * @param identityId - Associated identity ID
 * @param ecdhPrivateKey - X25519 private key (will be cleared after storage)
 * @param kemPrivateKey - ML-KEM private key (will be cleared after storage)
 * @param wrappingKey - Passphrase-derived wrapping key
 */
export async function storeDeviceKeys(
  deviceId: string,
  identityId: string,
  ecdhPrivateKey: Uint8Array,
  kemPrivateKey: Uint8Array,
  wrappingKey: Uint8Array
): Promise<void> {
  // Encrypt the private keys
  const ecdhEncrypted = await encryptWithWrappingKey(ecdhPrivateKey, wrappingKey);
  const kemEncrypted = await encryptWithWrappingKey(kemPrivateKey, wrappingKey);

  // Clear original key material from memory
  clearBytes(ecdhPrivateKey);
  clearBytes(kemPrivateKey);

  // Store in IndexedDB
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record: StoredDeviceKeys = {
      deviceId,
      identityId,
      ecdhPrivateKeyEncrypted: ecdhEncrypted,
      kemPrivateKeyEncrypted: kemEncrypted,
      createdAt: new Date().toISOString(),
    };

    const request = store.put(record);

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
 * @param deviceId - Unique device identifier
 * @returns Stored device keys, or null if not found
 */
export async function getStoredDeviceKeys(
  deviceId: string
): Promise<StoredDeviceKeys | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(deviceId);

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
 *
 * @param identityId - Identity ID to search for
 * @returns Array of stored device keys
 */
export async function getDeviceKeysForIdentity(
  identityId: string
): Promise<StoredDeviceKeys[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('identityId');
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
 * @param stored - Stored encrypted device keys
 * @param wrappingKey - Passphrase-derived wrapping key
 * @returns Decrypted device keys
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
    // Clean up already decrypted key
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
 *
 * @param identityId - Identity ID to check
 * @returns True if keys exist
 */
export async function hasDeviceKeys(identityId: string): Promise<boolean> {
  const keys = await getDeviceKeysForIdentity(identityId);
  return keys.length > 0;
}

/**
 * Deletes device keys by device ID.
 *
 * @param deviceId - Device ID to delete
 */
export async function deleteDeviceKeys(deviceId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(deviceId);

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
 * Used when deleting an identity.
 *
 * @param identityId - Identity ID whose keys should be deleted
 * @returns Number of keys deleted
 */
export async function deleteAllDeviceKeysForIdentity(
  identityId: string
): Promise<number> {
  const keys = await getDeviceKeysForIdentity(identityId);

  if (keys.length === 0) {
    return 0;
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    let deletedCount = 0;
    let completedCount = 0;

    for (const key of keys) {
      const request = store.delete(key.deviceId);

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
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

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
