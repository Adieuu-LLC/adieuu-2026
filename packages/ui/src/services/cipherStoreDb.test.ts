import { afterEach, describe, expect, test } from 'bun:test';
import {
  deleteStoredCipher,
  getStoredCipherById,
  getStoredCiphers,
  saveStoredCipher,
} from './cipherStoreDb';

describe('cipherStoreDb', () => {
  afterEach(async () => {
    await indexedDB.deleteDatabase('adieuu-ciphers');
  });

  test('saves and loads ciphers by identity', async () => {
    await saveStoredCipher({
      id: 'c1',
      identityId: 'id-1',
      createdAt: new Date().toISOString(),
    });
    const list = await getStoredCiphers('id-1');
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('c1');
  });

  test('gets and deletes a cipher by id', async () => {
    await saveStoredCipher({
      id: 'c2',
      identityId: 'id-1',
      createdAt: new Date().toISOString(),
    });
    const loaded = await getStoredCipherById('c2');
    expect(loaded?.id).toBe('c2');
    await deleteStoredCipher('c2');
    const deleted = await getStoredCipherById('c2');
    expect(deleted).toBeUndefined();
  });
});
