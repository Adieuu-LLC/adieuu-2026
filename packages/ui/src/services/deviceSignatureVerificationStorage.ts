/**
 * Per-conversation, per-peer-device verification of safety fingerprint display strings.
 * Stored in IndexedDB (local only).
 */

const DB_NAME = 'adieuu-device-signature-verification';
const DB_VERSION = 1;
const STORE = 'verifications';

export interface DeviceSignatureVerificationRecord {
  /** `formatSafetyFingerprintDisplay` snapshot at verification time */
  verifiedDisplay: string;
  verifiedAt: string;
}

function compoundKey(conversationId: string, peerIdentityId: string, deviceId: string): string {
  return `${conversationId}\u0000${peerIdentityId}\u0000${deviceId}`;
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
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
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
  conversationId: string,
  peerIdentityId: string,
  deviceId: string,
): Promise<DeviceSignatureVerificationRecord | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const key = compoundKey(conversationId, peerIdentityId, deviceId);
    const raw = await idbRequest(store.get(key) as IDBRequest<DeviceSignatureVerificationRecord | undefined>);
    db.close();
    return raw ?? null;
  } catch {
    return null;
  }
}

export async function setDeviceSignatureVerification(
  conversationId: string,
  peerIdentityId: string,
  deviceId: string,
  verifiedDisplay: string,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const key = compoundKey(conversationId, peerIdentityId, deviceId);
  const record: DeviceSignatureVerificationRecord = {
    verifiedDisplay,
    verifiedAt: new Date().toISOString(),
  };
  await idbRequest(store.put(record, key));
  db.close();
}

export async function clearDeviceSignatureVerification(
  conversationId: string,
  peerIdentityId: string,
  deviceId: string,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const key = compoundKey(conversationId, peerIdentityId, deviceId);
  await idbRequest(store.delete(key));
  db.close();
}
