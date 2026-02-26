/**
 * Participant Cache Service
 *
 * Provides IndexedDB-based caching of DM conversation participants.
 * In a DM, we cache the "other" participant's identity ID and signing
 * public key for efficient message verification.
 *
 * This cache enables:
 * - Fast lookup of the other participant without API calls
 * - Signature verification using cached signing keys
 * - Fallback to API when cache is empty (resilience)
 *
 * SECURITY CONSIDERATIONS:
 * - Cache is stored per-identity (isolated between identities)
 * - Signing keys are public, so caching them is safe
 * - Cache miss triggers API fetch (resilient to clearing)
 *
 * @module services/participantCache
 */

const DB_NAME = 'adieuu-participant-cache';
const DB_VERSION = 1;
const STORE_NAME = 'participants';

/**
 * Cached participant entry for a DM conversation.
 */
export interface ParticipantCacheEntry {
  /** The blinded conversation ID (64-char hex) - primary key */
  conversationId: string;
  /** The other participant's identity ID */
  otherIdentityId: string;
  /** The other participant's Ed25519 signing public key (base64) */
  signingPublicKey: string;
  /** Timestamp when this entry was cached */
  cachedAt: number;
  /** The current identity's ID (for isolation) */
  myIdentityId: string;
}

/**
 * Opens the IndexedDB database for participant cache.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open participant cache database'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: ['myIdentityId', 'conversationId'],
        });

        store.createIndex('byConversation', ['myIdentityId', 'conversationId'], {
          unique: true,
        });

        store.createIndex('byOtherIdentity', ['myIdentityId', 'otherIdentityId'], {
          unique: false,
        });
      }
    };
  });
}

/**
 * Gets a cached participant entry for a conversation.
 *
 * @param myIdentityId - The current user's identity ID
 * @param conversationId - The conversation ID to look up
 * @returns The cached entry or null if not found
 */
export async function getCachedParticipant(
  myIdentityId: string,
  conversationId: string
): Promise<ParticipantCacheEntry | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get([myIdentityId, conversationId]);

      request.onerror = () => {
        reject(new Error('Failed to get cached participant'));
      };

      request.onsuccess = () => {
        resolve(request.result ?? null);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    return null;
  }
}

/**
 * Caches a participant entry for a conversation.
 *
 * @param entry - The participant entry to cache
 */
export async function cacheParticipant(
  entry: ParticipantCacheEntry
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(entry);

    request.onerror = () => {
      reject(new Error('Failed to cache participant'));
    };

    request.onsuccess = () => {
      resolve();
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

/**
 * Removes a cached participant entry.
 *
 * @param myIdentityId - The current user's identity ID
 * @param conversationId - The conversation ID to remove
 */
export async function removeCachedParticipant(
  myIdentityId: string,
  conversationId: string
): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete([myIdentityId, conversationId]);

      request.onerror = () => {
        reject(new Error('Failed to remove cached participant'));
      };

      request.onsuccess = () => {
        resolve();
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    // Ignore errors when removing
  }
}

/**
 * Gets all cached participants for an identity.
 *
 * @param myIdentityId - The current user's identity ID
 * @returns Array of cached participant entries
 */
export async function getAllCachedParticipants(
  myIdentityId: string
): Promise<ParticipantCacheEntry[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const results: ParticipantCacheEntry[] = [];

      const request = store.openCursor();

      request.onerror = () => {
        reject(new Error('Failed to get cached participants'));
      };

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const entry = cursor.value as ParticipantCacheEntry;
          if (entry.myIdentityId === myIdentityId) {
            results.push(entry);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    return [];
  }
}

/**
 * Clears all cached participants for an identity.
 * Used when logging out or switching identities.
 *
 * @param myIdentityId - The identity ID to clear cache for
 */
export async function clearParticipantCache(
  myIdentityId: string
): Promise<void> {
  try {
    const entries = await getAllCachedParticipants(myIdentityId);
    for (const entry of entries) {
      await removeCachedParticipant(myIdentityId, entry.conversationId);
    }
  } catch {
    // Ignore errors when clearing
  }
}

/**
 * Finds a conversation ID by the other participant's identity ID.
 * Useful for finding existing conversations when starting a new DM.
 *
 * @param myIdentityId - The current user's identity ID
 * @param otherIdentityId - The other participant's identity ID
 * @returns The conversation ID if found, null otherwise
 */
export async function findConversationByParticipant(
  myIdentityId: string,
  otherIdentityId: string
): Promise<string | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('byOtherIdentity');
      const request = index.get([myIdentityId, otherIdentityId]);

      request.onerror = () => {
        reject(new Error('Failed to find conversation'));
      };

      request.onsuccess = () => {
        const result = request.result as ParticipantCacheEntry | undefined;
        resolve(result?.conversationId ?? null);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    return null;
  }
}

/**
 * Updates the signing public key for a cached participant.
 * Used when the other participant rotates their signing key.
 *
 * @param myIdentityId - The current user's identity ID
 * @param conversationId - The conversation ID
 * @param signingPublicKey - The new signing public key (base64)
 */
export async function updateCachedSigningKey(
  myIdentityId: string,
  conversationId: string,
  signingPublicKey: string
): Promise<void> {
  const existing = await getCachedParticipant(myIdentityId, conversationId);
  if (existing) {
    await cacheParticipant({
      ...existing,
      signingPublicKey,
      cachedAt: Date.now(),
    });
  }
}
