import type { WrappedEntropy, EntropyPiece } from '@adieuu/crypto';
import { isWrappedEntropy, unwrapEntropy, wrapEntropy } from '@adieuu/crypto';
import type { StoredCipher } from '../hooks/useCipherStore';
import { getStoredCiphers, saveStoredCipher } from './cipherStoreDb';

export { getAllCipherIdentityIds } from './cipherStoreDb';

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

/**
 * Re-wraps a StoredCipher's encrypted entropy from one wrapping key/salt to
 * another. Used for both key-backup import and passphrase-change re-wrapping.
 */
export async function reWrapCipher(
  cipher: StoredCipher,
  sourceWrappingKey: Uint8Array,
  targetWrappingKey: Uint8Array,
  targetSalt: Uint8Array
): Promise<StoredCipher> {
  const entropyPieces = await unwrapEntropy(cipher.encryptedEntropy, sourceWrappingKey);
  const rewrapped = await wrapEntropy(entropyPieces, targetWrappingKey, targetSalt);
  return { ...cipher, encryptedEntropy: rewrapped };
}

/**
 * Re-wraps every locally-stored cipher for an identity from the old wrapping
 * key to the new one. Idempotent: a cipher already wrapped with the new key is
 * left untouched, and a cipher that decrypts with neither key is skipped.
 *
 * @returns Number of ciphers newly re-wrapped (old -> new)
 */
export async function reWrapAllCiphers(
  identityId: string,
  oldWrappingKey: Uint8Array,
  newWrappingKey: Uint8Array,
  newSalt: Uint8Array
): Promise<number> {
  const ciphers = await getStoredCiphers(identityId);
  if (ciphers.length === 0) return 0;

  let reWrapped = 0;
  for (const cipher of ciphers) {
    if (!isWrappedEntropy(cipher.encryptedEntropy)) continue;

    let rewrappedCipher: StoredCipher;
    try {
      rewrappedCipher = await reWrapCipher(cipher, oldWrappingKey, newWrappingKey, newSalt);
    } catch {
      // Old key failed. If it already decrypts with the new key it is already
      // migrated; otherwise it is unrecoverable and we skip it.
      try {
        await unwrapEntropy(cipher.encryptedEntropy, newWrappingKey);
      } catch {
        console.warn('[CipherStore] Skipping cipher that decrypts with neither key:', cipher.id.slice(0, 8));
      }
      continue;
    }

    await saveStoredCipher(rewrappedCipher);
    reWrapped++;
  }

  return reWrapped;
}

/**
 * Returns true if any of the identity's stored ciphers can be decrypted with
 * the given wrapping key. Returns null when the identity has no ciphers stored.
 */
export async function cipherEntropyDecryptsWith(
  identityId: string,
  wrappingKey: Uint8Array
): Promise<boolean | null> {
  const ciphers = await getStoredCiphers(identityId);
  if (ciphers.length === 0) return null;

  for (const cipher of ciphers) {
    if (!isWrappedEntropy(cipher.encryptedEntropy)) continue;
    try {
      await unwrapEntropy(cipher.encryptedEntropy, wrappingKey);
      return true;
    } catch {
      // try next cipher
    }
  }
  return false;
}
