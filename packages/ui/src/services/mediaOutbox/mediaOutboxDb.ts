import type { MediaOutboxJobRecord } from './mediaOutboxTypes';
import {
  MEDIA_OUTBOX_IDB_NAME,
  MEDIA_OUTBOX_IDB_STORE,
  MEDIA_OUTBOX_IDB_VERSION,
} from './mediaOutboxConstants';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(MEDIA_OUTBOX_IDB_NAME, MEDIA_OUTBOX_IDB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MEDIA_OUTBOX_IDB_STORE)) {
        db.createObjectStore(MEDIA_OUTBOX_IDB_STORE);
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

export async function mediaOutboxListAllJobs(): Promise<MediaOutboxJobRecord[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(MEDIA_OUTBOX_IDB_STORE, 'readonly');
    const store = tx.objectStore(MEDIA_OUTBOX_IDB_STORE);
    const keys = await idbRequest(store.getAllKeys() as IDBRequest<IDBValidKey[]>);
    const rows: MediaOutboxJobRecord[] = [];
    for (const key of keys) {
      const row = await idbRequest(store.get(key) as IDBRequest<MediaOutboxJobRecord | undefined>);
      if (row) rows.push(row);
    }
    db.close();
    return rows;
  } catch {
    return [];
  }
}

export async function mediaOutboxGetJob(jobId: string): Promise<MediaOutboxJobRecord | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(MEDIA_OUTBOX_IDB_STORE, 'readonly');
    const store = tx.objectStore(MEDIA_OUTBOX_IDB_STORE);
    const row = await idbRequest(store.get(jobId) as IDBRequest<MediaOutboxJobRecord | undefined>);
    db.close();
    return row ?? null;
  } catch {
    return null;
  }
}

export async function mediaOutboxPutJob(record: MediaOutboxJobRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(MEDIA_OUTBOX_IDB_STORE, 'readwrite');
  const store = tx.objectStore(MEDIA_OUTBOX_IDB_STORE);
  await idbRequest(store.put(record, record.id));
  db.close();
}

export async function mediaOutboxDeleteJob(jobId: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(MEDIA_OUTBOX_IDB_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_OUTBOX_IDB_STORE);
    await idbRequest(store.delete(jobId));
    db.close();
  } catch {
    /* ignore */
  }
}
