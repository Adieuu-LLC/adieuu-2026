import { describe, expect, test } from 'bun:test';
import { getSessionKeysForMessages } from './sessionKeyRetrieval';

describe('sessionKeyRetrieval', () => {
  test('returns in-memory keys without persistent lookup', async () => {
    const sessionKeyCache = new Map<string, Uint8Array>([['m-1', new Uint8Array([1, 2, 3])]]);
    let persistedCalls = 0;
    const result = await getSessionKeysForMessages({
      messageIds: ['m-1'],
      identityId: 'id-1',
      wrappingKey: null,
      sessionKeyCache,
      getPersistedSessionKey: async () => {
        persistedCalls++;
        return null;
      },
    });
    expect(result['m-1']).toBeDefined();
    expect(persistedCalls).toBe(0);
  });

  test('falls back to persisted key and caches it', async () => {
    const persisted = new Uint8Array([9, 8, 7]);
    const sessionKeyCache = new Map<string, Uint8Array>();
    const result = await getSessionKeysForMessages({
      messageIds: ['m-2'],
      identityId: 'id-1',
      wrappingKey: new Uint8Array([1]),
      sessionKeyCache,
      getPersistedSessionKey: async () => persisted,
    });
    expect(result['m-2']).toBeDefined();
    expect(sessionKeyCache.get('m-2')).toEqual(persisted);
  });
});
