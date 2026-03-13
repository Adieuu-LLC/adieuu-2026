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
});
