/**
 * IndexedDB store for per-message plaintext search rows (conversation-scoped E2EE search).
 *
 * @module services/messageSearch/messageSearchCacheDb
 */

import {
  IDX_CONVERSATION,
  IDX_TIMESTAMP,
  MESSAGE_SEARCH_IDB_NAME,
  MESSAGE_SEARCH_IDB_STORE,
  MESSAGE_SEARCH_IDB_VERSION,
} from './messageSearchCacheConstants';
import type { MessageSearchCacheRow } from './messageSearchCacheTypes';

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(MESSAGE_SEARCH_IDB_NAME, MESSAGE_SEARCH_IDB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(MESSAGE_SEARCH_IDB_STORE)) return;
      const store = db.createObjectStore(MESSAGE_SEARCH_IDB_STORE, { keyPath: 'messageId' });
      store.createIndex(IDX_CONVERSATION, 'conversationId', { unique: false });
      store.createIndex(IDX_TIMESTAMP, 'timestamp', { unique: false });
    };
  });
}

function mergeRowBase(a: MessageSearchCacheRow, b: MessageSearchCacheRow): MessageSearchCacheRow {
  return {
    ...b,
    hasReplies: a.hasReplies || b.hasReplies,
  };
}

/**
 * Upsert rows and mark parents as `hasReplies` when a child references `parentMessageId`.
 * Uses a single readwrite transaction with chained requests (no await inside the transaction).
 */
export function messageSearchCachePutBatch(rows: MessageSearchCacheRow[]): Promise<void> {
  if (rows.length === 0) return Promise.resolve();
  return openDb().then((db) => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MESSAGE_SEARCH_IDB_STORE, 'readwrite');
      const store = tx.objectStore(MESSAGE_SEARCH_IDB_STORE);
      const parentIds: string[] = [];
      for (const r of rows) {
        if (r.parentMessageId) parentIds.push(r.parentMessageId);
      }

      const finishParents = (idx: number) => {
        if (idx >= parentIds.length) {
          return;
        }
        const pid = parentIds[idx]!;
        const g = store.get(pid);
        g.onsuccess = () => {
          const parent = g.result as MessageSearchCacheRow | undefined;
          if (parent && !parent.hasReplies) {
            const p = store.put({ ...parent, hasReplies: true });
            p.onsuccess = () => finishParents(idx + 1);
            p.onerror = () => reject(p.error);
          } else {
            finishParents(idx + 1);
          }
        };
        g.onerror = () => reject(g.error);
      };

      const putAt = (i: number) => {
        if (i >= rows.length) {
          finishParents(0);
          return;
        }
        const r = rows[i]!;
        const g = store.get(r.messageId);
        g.onsuccess = () => {
          const existing = g.result as MessageSearchCacheRow | undefined;
          const merged: MessageSearchCacheRow = existing
            ? mergeRowBase(existing, r)
            : { ...r, hasReplies: r.hasReplies };
          const p = store.put(merged);
          p.onsuccess = () => putAt(i + 1);
          p.onerror = () => reject(p.error);
        };
        g.onerror = () => reject(g.error);
      };

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('transaction failed'));
      };

      putAt(0);
    });
  });
}

export function messageSearchCacheDeleteConversation(conversationId: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(MESSAGE_SEARCH_IDB_STORE, 'readwrite');
        const store = tx.objectStore(MESSAGE_SEARCH_IDB_STORE);
        const index = store.index(IDX_CONVERSATION);
        const req = index.openCursor(IDBKeyRange.only(conversationId));
        req.onsuccess = () => {
          const cur = req.result;
          if (cur) {
            cur.delete();
            cur.continue();
          }
        };
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      })
  ).catch(() => undefined);
}

export async function messageSearchCacheListConversation(
  conversationId: string,
  timeRange: { startMs: number; endMs: number }
): Promise<MessageSearchCacheRow[]> {
  const out: MessageSearchCacheRow[] = [];
  try {
    const db = await openDb();
    const tx = db.transaction(MESSAGE_SEARCH_IDB_STORE, 'readonly');
    const store = tx.objectStore(MESSAGE_SEARCH_IDB_STORE);
    const index = store.index(IDX_CONVERSATION);
    const range = IDBKeyRange.only(conversationId);
    const req = index.openCursor(range);
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) {
          resolve();
          return;
        }
        const row = cur.value as MessageSearchCacheRow;
        if (row.timestamp >= timeRange.startMs && row.timestamp < timeRange.endMs) {
          out.push(row);
        }
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    return [];
  }
  return out;
}

export async function messageSearchCacheDeleteAll(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(MESSAGE_SEARCH_IDB_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGE_SEARCH_IDB_STORE);
    await idbRequest(store.clear());
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

export async function messageSearchCacheDeleteMessage(messageId: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(MESSAGE_SEARCH_IDB_STORE, 'readwrite');
    const store = tx.objectStore(MESSAGE_SEARCH_IDB_STORE);
    await idbRequest(store.delete(messageId));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
