import {
  decryptWithCipher,
  deserializeCipherPayload,
  encryptWithCipher,
  fromBytes,
  serializeCipherPayload,
  toBytes,
  type CommunityCipher,
} from '@adieuu/crypto';

export interface CipherFields {
  ciphertext: string;
  nonce: string;
  cipherId: string;
}

export interface DecryptableMessage {
  content?: string;
  ciphertext?: string;
  nonce?: string;
  cipherId?: string;
}

export function looksLikeCipherPayload(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return !!(parsed && parsed.ciphertext && parsed.nonce && parsed.cipherId);
  } catch {
    return false;
  }
}

/**
 * Decrypt a message body from dedicated cipher fields or plaintext content.
 * Falls back to `fallback` when cipher fields are present but decryption fails.
 */
export function decryptBody(
  msg: DecryptableMessage | undefined,
  cipher: CommunityCipher | null | undefined,
  fallback: string,
): string {
  if (!msg) return '';

  if (msg.ciphertext && msg.nonce && msg.cipherId) {
    if (!cipher) return fallback;
    try {
      const payload = deserializeCipherPayload({
        ciphertext: msg.ciphertext,
        nonce: msg.nonce,
        cipherId: msg.cipherId,
      });
      return fromBytes(decryptWithCipher(cipher, payload));
    } catch {
      return fallback;
    }
  }

  const content = msg.content;
  if (!content) return '';
  if (looksLikeCipherPayload(content)) return fallback;
  return content;
}

/**
 * Encrypt plaintext into structured cipher fields for transport.
 */
export function encryptContent(
  cipher: CommunityCipher,
  plaintext: string,
): CipherFields {
  const encrypted = encryptWithCipher(cipher, toBytes(plaintext));
  const serialized = serializeCipherPayload(encrypted);
  return {
    ciphertext: serialized.ciphertext,
    nonce: serialized.nonce,
    cipherId: serialized.cipherId,
  };
}

/**
 * Decrypt a single edit-history revision entry. Returns `{ plaintext }` on
 * success or `{ decryptionError }` if the content cannot be decrypted.
 */
export function decryptEditHistoryEntry(
  entry: DecryptableMessage,
  cipher: CommunityCipher,
): { plaintext: string } | { decryptionError: string } {
  if (entry.ciphertext && entry.nonce && entry.cipherId) {
    try {
      const payload = deserializeCipherPayload({
        ciphertext: entry.ciphertext,
        nonce: entry.nonce,
        cipherId: entry.cipherId,
      });
      return { plaintext: fromBytes(decryptWithCipher(cipher, payload)) };
    } catch {
      return { decryptionError: 'Unable to decrypt' };
    }
  }
  if (entry.content !== undefined) {
    return { plaintext: entry.content };
  }
  return { decryptionError: 'Unable to decrypt' };
}
