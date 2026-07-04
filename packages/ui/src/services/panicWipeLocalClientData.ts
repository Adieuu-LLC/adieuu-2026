import type { PlatformCapabilities } from '../config/types';

/**
 * IndexedDB databases created by the web/desktop renderer for crypto, cache, and outbox state.
 * Keep in sync when adding new persistence.
 */
const INDEXEDDB_DATABASES_TO_DELETE: readonly string[] = [
  'adieuu-keys',
  'adieuu-ciphers',
  'adieuu-device-keys',
  'adieuu-wrapping-keys',
  'adieuu-identity-meta',
  'adieuu-pre-keys',
  'adieuu-session-keys',
  'adieuu-device-signature-verification',
  'adieuu-media-outbox',
  'adieuu-message-search',
];

function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'));
    req.onblocked = () => resolve();
  });
}

async function clearCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    // best-effort
  }
}

function clearWebStorage(storage: Storage | undefined): void {
  if (!storage) return;
  try {
    storage.clear();
  } catch {
    // best-effort
  }
}

/**
 * Best-effort wipe of client-side persistence for this origin.
 * Call after revoking server sessions. Individual steps swallow errors where noted.
 */
export async function panicWipeLocalClientData(
  capabilities: Pick<PlatformCapabilities, 'wipeLocalSecureKeyFiles'>,
): Promise<void> {
  await Promise.all(
    INDEXEDDB_DATABASES_TO_DELETE.map((n) => deleteIndexedDb(n).catch(() => {})),
  );
  clearWebStorage(typeof localStorage !== 'undefined' ? localStorage : undefined);
  clearWebStorage(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined);
  await clearCaches();
  if (capabilities.wipeLocalSecureKeyFiles) {
    await capabilities.wipeLocalSecureKeyFiles().catch(() => {});
  }
}
