import type { WrappedEntropy, EntropyPiece } from '@adieuu/crypto';
import { isWrappedEntropy, unwrapEntropy } from '@adieuu/crypto';

export async function decryptStoredEntropy(
  encryptedEntropy: WrappedEntropy | unknown,
  wrappingKey: Uint8Array | null
): Promise<EntropyPiece[]> {
  if (!wrappingKey) {
    throw new Error('Cannot decrypt entropy: wrapping key not available');
  }
  if (!isWrappedEntropy(encryptedEntropy)) {
    throw new Error('Cipher has invalid encrypted entropy');
  }
  return unwrapEntropy(encryptedEntropy, wrappingKey);
}
