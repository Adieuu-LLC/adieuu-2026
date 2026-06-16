import type { StoredCipher } from '../hooks/useCipherStore';

const DB_NAME = 'adieuu-ciphers';
const DB_VERSION = 1;
const STORE_NAME = 'ciphers';

export function openCipherDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.close();
        const deleteReq = indexedDB.deleteDatabase(DB_NAME);
        deleteReq.onsuccess = () => {
          openCipherDatabase().then(resolve, reject);
        };
        deleteReq.onerror = () => reject(deleteReq.error);
        return;
      }
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('identityId', 'identityId', { unique: false });
        store.createIndex('cipherId', 'cipherId', { unique: false });
      }
    };
  });
}

export async function getStoredCiphers(identityId: string): Promise<StoredCipher[]> {
  const db = await openCipherDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('identityId');
    const request = index.getAll(identityId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const ciphers = request.result as StoredCipher[];
      ciphers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(ciphers);
    };
    tx.oncomplete = () => db.close();
  });
}

export async function saveStoredCipher(cipher: StoredCipher): Promise<void> {
  const db = await openCipherDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(cipher);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

export async function deleteStoredCipher(id: string): Promise<void> {
  const db = await openCipherDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

export async function getStoredCipherById(id: string): Promise<StoredCipher | undefined> {
  const db = await openCipherDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as StoredCipher | undefined);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Enumerates identity IDs that have ciphers stored locally. Used by the
 * passphrase-change local identity discovery.
 */
export async function getAllCipherIdentityIds(): Promise<string[]> {
  const ids = new Set<string>();
  const db = await openCipherDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      for (const c of request.result as StoredCipher[]) {
        if (c.identityId) ids.add(c.identityId);
      }
      resolve([...ids]);
    };
    tx.oncomplete = () => db.close();
  });
}
