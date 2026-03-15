/**
 * Local Message Storage (Forward Secrecy cache)
 *
 * Stores decrypted FS message content locally so OTPK private keys can be
 * safely deleted after first successful decrypt + persist.
 *
 * Message content is encrypted at rest using the identity wrapping key.
 */

import { toBase64, fromBase64 } from '@adieuu/crypto';
import type { DecryptedMessageContent } from './dmMessageService';

const DB_NAME = 'adieuu-fs-message-cache';
const DB_VERSION = 1;
const STORE_NAME = 'messages';

interface StoredFsMessage {
  messageId: string;
  conversationId: string;
  encryptedContent: {
    ciphertext: string;
    nonce: string;
  };
  cachedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`Failed to open FS message cache: ${request.error?.message ?? 'Unknown error'}`));
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'messageId' });
        store.createIndex('conversationId', 'conversationId', { unique: false });
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
  plaintext: Uint8Array,
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
    toArrayBuffer(plaintext)
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

export async function storeFsMessageContent(
  messageId: string,
  conversationId: string,
  content: DecryptedMessageContent,
  wrappingKey: Uint8Array
): Promise<void> {
  const plaintext = new TextEncoder().encode(JSON.stringify(content));
  const encryptedContent = await encryptWithWrappingKey(plaintext, wrappingKey);

  const record: StoredFsMessage = {
    messageId,
    conversationId,
    encryptedContent,
    cachedAt: new Date().toISOString(),
  };

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onerror = () => reject(new Error('Failed to store cached FS message'));
    req.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Clears all cached FS message content from the local database.
 */
export async function clearFsMessageCache(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onerror = () => reject(new Error('Failed to clear FS message cache'));
    req.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

export async function getFsMessageContent(
  messageId: string,
  conversationId: string,
  wrappingKey: Uint8Array
): Promise<DecryptedMessageContent | null> {
  const db = await openDatabase();
  const record = await new Promise<StoredFsMessage | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(messageId);
    req.onerror = () => reject(new Error('Failed to load cached FS message'));
    req.onsuccess = () => resolve((req.result as StoredFsMessage | undefined) ?? null);
    tx.oncomplete = () => db.close();
  });

  if (!record || record.conversationId !== conversationId) return null;

  try {
    const plaintext = await decryptWithWrappingKey(record.encryptedContent, wrappingKey);
    return JSON.parse(new TextDecoder().decode(plaintext)) as DecryptedMessageContent;
  } catch {
    return null;
  }
}
