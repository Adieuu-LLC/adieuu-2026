/**
 * Global (cross-conversation) per-peer-device verification of device-trust fingerprint lines.
 * Stored in IndexedDB (local only).
 */

const DB_NAME = 'adieuu-device-signature-verification';
const DB_VERSION = 2;
const STORE = 'verifications';

export interface DeviceSignatureVerificationRecord {
  /** `formatSafetyFingerprintDisplay` snapshot at verification time */
  verifiedDisplay: string;
  verifiedAt: string;
}

function compoundKey(peerIdentityId: string, deviceId: string): string {
  return `${peerIdentityId}\u0000${deviceId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (event.oldVersion < 2) {
        if (db.objectStoreNames.contains(STORE)) {
          db.deleteObjectStore(STORE);
        }
        db.createObjectStore(STORE);
      }
    };
  });
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export async function getDeviceSignatureVerification(
  peerIdentityId: string,
  deviceId: string,
): Promise<DeviceSignatureVerificationRecord | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const key = compoundKey(peerIdentityId, deviceId);
    const raw = await idbRequest(store.get(key) as IDBRequest<DeviceSignatureVerificationRecord | undefined>);
    db.close();
    return raw ?? null;
  } catch {
    return null;
  }
}

export async function setDeviceSignatureVerification(
  peerIdentityId: string,
  deviceId: string,
  verifiedDisplay: string,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const key = compoundKey(peerIdentityId, deviceId);
  const record: DeviceSignatureVerificationRecord = {
    verifiedDisplay,
    verifiedAt: new Date().toISOString(),
  };
  await idbRequest(store.put(record, key));
  db.close();
}

export async function clearDeviceSignatureVerification(
  peerIdentityId: string,
  deviceId: string,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const key = compoundKey(peerIdentityId, deviceId);
  await idbRequest(store.delete(key));
  db.close();
}
