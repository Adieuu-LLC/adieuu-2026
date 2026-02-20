/**
 * Multi-Layer Cipher Composition Module
 *
 * Implements hierarchical encryption for Space channels that require
 * multiple ciphers for access. This enables cryptographic access control:
 *
 * ```
 * #general      → Space cipher only (all members)
 * #moderators   → Space cipher + Mod cipher (double encryption)
 * #founders     → Space cipher + Mod cipher + Founder cipher (triple)
 * ```
 *
 * ## Double Encryption Process
 *
 * ```
 * plaintext
 *     │
 *     ▼
 * encrypt(channel_cipher, plaintext) = inner_ciphertext
 *     │
 *     ▼
 * encrypt(space_cipher, inner_ciphertext) = outer_ciphertext
 *     │
 *     ▼
 * store: { ciphertext: outer, nonces: [outer_nonce, inner_nonce], cipherIds: [space, channel] }
 * ```
 *
 * To decrypt, recipient MUST possess ALL ciphers in the chain.
 *
 * @module crypto/ciphers/compose
 */

import { encrypt, decrypt } from '../encrypt';
import { toBase64, fromBase64 } from '../utils';
import type { CryptoProfile } from '../types';
import type {
  CommunityCipher,
  LayeredCipherPayload,
  SerializedLayeredPayload,
  CipherEncryptedPayload,
  SerializedCipherPayload,
} from './types';

/**
 * Encrypts data with a single community cipher.
 *
 * @param cipher - Community cipher to use
 * @param plaintext - Data to encrypt
 * @param epochId - Optional epoch ID for versioning
 * @returns Encrypted payload with cipher metadata
 *
 * @example
 * ```typescript
 * const cipher = deriveCommunityCipher(entropy);
 * const encrypted = encryptWithCipher(cipher, plaintext);
 *
 * // Store/send: encrypted.ciphertext, encrypted.nonce, encrypted.cipherId
 * ```
 */
export function encryptWithCipher(
  cipher: CommunityCipher,
  plaintext: Uint8Array,
  epochId?: string
): CipherEncryptedPayload {
  const { ciphertext, nonce } = encrypt(cipher.key, plaintext, cipher.profile);

  return {
    ciphertext,
    nonce,
    cipherId: cipher.cipherId,
    epochId,
  };
}

/**
 * Decrypts data encrypted with a community cipher.
 *
 * @param cipher - Community cipher used for encryption
 * @param payload - Encrypted payload
 * @returns Decrypted plaintext
 * @throws Error if cipher ID doesn't match or decryption fails
 *
 * @example
 * ```typescript
 * // Find the right cipher by matching cipherIds
 * const cipher = ciphers.find(c => c.cipherId === payload.cipherId);
 * const plaintext = decryptWithCipher(cipher, payload);
 * ```
 */
export function decryptWithCipher(
  cipher: CommunityCipher,
  payload: CipherEncryptedPayload
): Uint8Array {
  if (cipher.cipherId !== payload.cipherId) {
    throw new Error('Cipher ID mismatch - wrong cipher for this payload');
  }

  return decrypt(cipher.key, payload.ciphertext, payload.nonce, cipher.profile);
}

/**
 * Encrypts data with multiple ciphers (layered/onion encryption).
 *
 * The ciphers are applied in order from last to first (innermost to outermost):
 * - Last cipher in array encrypts the plaintext (innermost)
 * - First cipher in array is the final encryption layer (outermost)
 *
 * This matches the decryption order where the first cipher is decrypted first.
 *
 * @param ciphers - Array of ciphers [outer, ..., inner]
 * @param plaintext - Data to encrypt
 * @param epochIds - Optional epoch IDs for each cipher
 * @returns Layered encrypted payload
 * @throws Error if no ciphers provided
 *
 * @example
 * ```typescript
 * // Double encryption for moderator channel
 * const encrypted = encryptLayered(
 *   [spaceCipher, modCipher],  // [outer, inner]
 *   plaintext,
 * );
 *
 * // Recipient needs BOTH ciphers to decrypt
 * ```
 */
export function encryptLayered(
  ciphers: CommunityCipher[],
  plaintext: Uint8Array,
  epochIds?: (string | undefined)[]
): LayeredCipherPayload {
  if (ciphers.length === 0) {
    throw new Error('At least one cipher is required');
  }

  // For single cipher, just do simple encryption
  if (ciphers.length === 1) {
    const cipher = ciphers[0]!;
    const profile = cipher.profile;
    const { ciphertext, nonce } = encrypt(cipher.key, plaintext, profile);

    return {
      ciphertext,
      nonces: [nonce],
      cipherIds: [cipher.cipherId],
      epochIds: epochIds,
    };
  }

  // Multi-layer: encrypt from inner (last) to outer (first)
  const nonces: Uint8Array[] = [];
  const cipherIds: string[] = [];
  let currentData = plaintext;

  // Process ciphers in reverse order (inner to outer)
  for (let i = ciphers.length - 1; i >= 0; i--) {
    const cipher = ciphers[i]!;
    const { ciphertext, nonce } = encrypt(cipher.key, currentData, cipher.profile);

    // Store in reverse order so index 0 is outermost
    nonces.unshift(nonce);
    cipherIds.unshift(cipher.cipherId);
    currentData = ciphertext;
  }

  return {
    ciphertext: currentData,
    nonces,
    cipherIds,
    epochIds,
  };
}

/**
 * Decrypts layered encrypted data.
 *
 * Ciphers must be provided in the same order as encryption [outer, ..., inner].
 * Each layer is decrypted from outer to inner.
 *
 * @param ciphers - Array of ciphers in same order as encryption
 * @param payload - Layered encrypted payload
 * @returns Decrypted plaintext
 * @throws Error if cipher count doesn't match, IDs don't match, or decryption fails
 *
 * @example
 * ```typescript
 * // Decrypt double-encrypted message
 * const plaintext = decryptLayered(
 *   [spaceCipher, modCipher],  // Same order as encryption
 *   encryptedPayload,
 * );
 * ```
 */
export function decryptLayered(
  ciphers: CommunityCipher[],
  payload: LayeredCipherPayload
): Uint8Array {
  if (ciphers.length !== payload.cipherIds.length) {
    throw new Error(
      `Cipher count mismatch: got ${ciphers.length}, expected ${payload.cipherIds.length}`
    );
  }

  if (ciphers.length !== payload.nonces.length) {
    throw new Error(`Nonce count mismatch: got ${payload.nonces.length}, expected ${ciphers.length}`);
  }

  // Verify cipher IDs match
  for (let i = 0; i < ciphers.length; i++) {
    if (ciphers[i]!.cipherId !== payload.cipherIds[i]) {
      throw new Error(`Cipher ID mismatch at layer ${i}`);
    }
  }

  // Decrypt from outer (first) to inner (last)
  let currentData = payload.ciphertext;
  for (let i = 0; i < ciphers.length; i++) {
    const cipher = ciphers[i]!;
    const nonce = payload.nonces[i]!;
    currentData = decrypt(cipher.key, currentData, nonce, cipher.profile);
  }

  return currentData;
}

/**
 * Serializes a cipher encrypted payload for transport/storage.
 *
 * @param payload - Cipher encrypted payload
 * @returns Serialized payload with base64-encoded binary fields
 */
export function serializeCipherPayload(payload: CipherEncryptedPayload): SerializedCipherPayload {
  return {
    ciphertext: toBase64(payload.ciphertext),
    nonce: toBase64(payload.nonce),
    cipherId: payload.cipherId,
    epochId: payload.epochId,
  };
}

/**
 * Deserializes a cipher encrypted payload from transport/storage.
 *
 * @param serialized - Serialized payload
 * @returns Deserialized payload with binary fields
 */
export function deserializeCipherPayload(serialized: SerializedCipherPayload): CipherEncryptedPayload {
  return {
    ciphertext: fromBase64(serialized.ciphertext),
    nonce: fromBase64(serialized.nonce),
    cipherId: serialized.cipherId,
    epochId: serialized.epochId,
  };
}

/**
 * Serializes a layered cipher payload for transport/storage.
 *
 * @param payload - Layered cipher payload
 * @returns Serialized payload with base64-encoded binary fields
 */
export function serializeLayeredPayload(payload: LayeredCipherPayload): SerializedLayeredPayload {
  return {
    ciphertext: toBase64(payload.ciphertext),
    nonces: payload.nonces.map(toBase64),
    cipherIds: payload.cipherIds,
    epochIds: payload.epochIds,
  };
}

/**
 * Deserializes a layered cipher payload from transport/storage.
 *
 * @param serialized - Serialized payload
 * @returns Deserialized payload with binary fields
 */
export function deserializeLayeredPayload(serialized: SerializedLayeredPayload): LayeredCipherPayload {
  return {
    ciphertext: fromBase64(serialized.ciphertext),
    nonces: serialized.nonces.map(fromBase64),
    cipherIds: serialized.cipherIds,
    epochIds: serialized.epochIds,
  };
}

/**
 * Finds the required cipher IDs for decrypting a payload.
 *
 * Useful for checking if a user has the necessary ciphers before attempting decryption.
 *
 * @param payload - Single or layered payload
 * @returns Array of required cipher IDs
 */
export function getRequiredCipherIds(
  payload: CipherEncryptedPayload | LayeredCipherPayload
): string[] {
  if ('cipherIds' in payload) {
    return payload.cipherIds;
  }
  return [payload.cipherId];
}

/**
 * Checks if a set of ciphers can decrypt a payload.
 *
 * @param availableCiphers - Ciphers the user has
 * @param payload - Payload to decrypt
 * @returns True if user has all required ciphers
 */
export function canDecrypt(
  availableCiphers: CommunityCipher[],
  payload: CipherEncryptedPayload | LayeredCipherPayload
): boolean {
  const requiredIds = getRequiredCipherIds(payload);
  const availableIds = new Set(availableCiphers.map((c) => c.cipherId));

  return requiredIds.every((id) => availableIds.has(id));
}

/**
 * Determines the layer count for a payload.
 *
 * @param payload - Single or layered payload
 * @returns Number of encryption layers
 */
export function getLayerCount(payload: CipherEncryptedPayload | LayeredCipherPayload): number {
  if ('cipherIds' in payload) {
    return payload.cipherIds.length;
  }
  return 1;
}
