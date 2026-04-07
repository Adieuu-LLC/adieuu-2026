import { describe, expect, test } from 'bun:test';
import { decryptStoredEntropy } from './cipherStoreOperations';

describe('cipherStoreOperations', () => {
  test('throws when wrapping key is unavailable', async () => {
    await expect(decryptStoredEntropy({}, null)).rejects.toThrow(
      'Cannot decrypt entropy: wrapping key not available'
    );
  });

  test('throws when entropy is not wrapped format', async () => {
    await expect(
      decryptStoredEntropy({ bogus: true }, new Uint8Array([1]))
    ).rejects.toThrow('Cipher has invalid encrypted entropy');
  });
});
