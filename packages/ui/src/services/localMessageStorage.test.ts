import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { randomBytes } from '@adieuu/crypto';
import {
  getFsMessageContent,
  storeFsMessageContent,
} from './localMessageStorage';

const DB_NAME = 'adieuu-fs-message-cache';

async function clearFsMessageDb(): Promise<void> {
  if (typeof globalThis.indexedDB === 'undefined') return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('services/localMessageStorage', () => {
  test('test environment provides IndexedDB and WebCrypto', () => {
    expect(typeof globalThis.indexedDB).toBe('object');
    expect(typeof globalThis.crypto?.subtle).toBe('object');
  });

  beforeEach(async () => {
    await clearFsMessageDb();
  });

  afterEach(async () => {
    await clearFsMessageDb();
  });

  test('stores and retrieves decrypted FS message content', async () => {
    const wrappingKey = randomBytes(32);
    const messageId = crypto.randomUUID();
    const conversationId = 'conv-1';
    const content = {
      text: 'hello fs cache',
      fromIdentityId: 'identity-a',
      fromDeviceId: 'device-a',
      version: 1,
    } as const;

    await storeFsMessageContent(messageId, conversationId, content, wrappingKey);
    const loaded = await getFsMessageContent(messageId, conversationId, wrappingKey);

    expect(loaded).toEqual(content);
  });

  test('returns null for conversation mismatch', async () => {
    const wrappingKey = randomBytes(32);
    const messageId = crypto.randomUUID();
    await storeFsMessageContent(
      messageId,
      'conv-1',
      {
        text: 'secret',
        fromIdentityId: 'identity-a',
        fromDeviceId: 'device-a',
        version: 1,
      },
      wrappingKey
    );

    const loaded = await getFsMessageContent(messageId, 'conv-2', wrappingKey);
    expect(loaded).toBeNull();
  });

  test('returns null when decrypted with wrong wrapping key', async () => {
    const keyA = randomBytes(32);
    const keyB = randomBytes(32);
    const messageId = crypto.randomUUID();

    await storeFsMessageContent(
      messageId,
      'conv-1',
      {
        text: 'secret',
        fromIdentityId: 'identity-a',
        fromDeviceId: 'device-a',
        version: 1,
      },
      keyA
    );

    const loaded = await getFsMessageContent(messageId, 'conv-1', keyB);
    expect(loaded).toBeNull();
  });

  test('returns null after cache is cleared', async () => {
    const wrappingKey = randomBytes(32);
    const messageId = crypto.randomUUID();
    const content = {
      text: 'will be lost',
      fromIdentityId: 'identity-a',
      fromDeviceId: 'device-a',
      version: 1,
    } as const;

    await storeFsMessageContent(messageId, 'conv-1', content, wrappingKey);

    const beforeClear = await getFsMessageContent(messageId, 'conv-1', wrappingKey);
    expect(beforeClear).toEqual(content);

    await clearFsMessageDb();

    const afterClear = await getFsMessageContent(messageId, 'conv-1', wrappingKey);
    expect(afterClear).toBeNull();
  });

  test('cached message is independent of pre-key storage', async () => {
    const wrappingKey = randomBytes(32);
    const messageId = crypto.randomUUID();
    const content = {
      text: 'cached independently',
      fromIdentityId: 'identity-a',
      fromDeviceId: 'device-a',
      version: 1,
    } as const;

    await storeFsMessageContent(messageId, 'conv-1', content, wrappingKey);

    // The FS message cache uses its own IndexedDB database ('adieuu-fs-message-cache'),
    // separate from the pre-key storage database. Retrieving cached messages does not
    // require pre-key private keys -- only the identity wrapping key.
    const loaded = await getFsMessageContent(messageId, 'conv-1', wrappingKey);
    expect(loaded).toEqual(content);
  });
});
