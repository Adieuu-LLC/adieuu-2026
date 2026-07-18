import {
  decryptWithCipher,
  deserializeCipherPayload,
  encryptWithCipher,
  fromBytes,
  serializeCipherPayload,
  toBytes,
  type CommunityCipher,
  type SerializedCipherPayload,
} from '@adieuu/crypto';

export function looksLikeCipherPayload(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return !!(parsed && parsed.ciphertext && parsed.nonce && parsed.cipherId);
  } catch {
    return false;
  }
}

export function decryptBody(
  content: string | undefined,
  cipher: CommunityCipher | null | undefined,
  fallback: string,
): string {
  if (!content) return '';
  if (cipher) {
    try {
      const parsed = JSON.parse(content) as SerializedCipherPayload;
      if (parsed.ciphertext && parsed.nonce && parsed.cipherId) {
        const payload = deserializeCipherPayload(parsed);
        return fromBytes(decryptWithCipher(cipher, payload));
      }
    } catch {
      return fallback;
    }
  }
  if (looksLikeCipherPayload(content)) return fallback;
  return content;
}

/**
 * Encrypt a plaintext string with the given cipher, returning the
 * JSON-serialized cipher payload ready for transport.
 */
export function encryptContent(
  cipher: CommunityCipher,
  plaintext: string,
): string {
  const encrypted = encryptWithCipher(cipher, toBytes(plaintext));
  return JSON.stringify(serializeCipherPayload(encrypted));
}

/**
 * Decrypt a single edit-history entry. Returns `{ plaintext }` on success
 * or `{ decryptionError }` if the content cannot be decrypted.
 */
export function decryptEditHistoryEntry(
  content: string,
  cipher: CommunityCipher,
): { plaintext: string } | { decryptionError: string } {
  try {
    const parsed = JSON.parse(content) as SerializedCipherPayload;
    const payload = deserializeCipherPayload(parsed);
    return { plaintext: fromBytes(decryptWithCipher(cipher, payload)) };
  } catch {
    return { decryptionError: 'Unable to decrypt' };
  }
}
