/**
 * HKDF Key Derivation Module
 *
 * Implements HKDF (HMAC-based Key Derivation Function) for deriving
 * cryptographic keys from shared secrets or other key material.
 *
 * Supports:
 * - HKDF-SHA3-256 (default profile)
 * - HKDF-SHA-384 (CNSA 2.0 profile)
 *
 * @module crypto/kdf/hkdf
 */

import { hkdf } from '@noble/hashes/hkdf';
import { sha3_256 } from '@noble/hashes/sha3';
import { sha384 } from '@noble/hashes/sha2';
import { toBytes } from '../utils';
import type { CryptoProfile, HKDFOptions } from '../types';

/**
 * Default output key length (256 bits).
 */
export const DEFAULT_KEY_LENGTH = 32;

/**
 * Derives a key using HKDF-SHA3-256.
 *
 * HKDF is a simple and efficient key derivation function based on HMAC.
 * It consists of two stages:
 * 1. Extract: Derive a pseudorandom key from input key material and salt
 * 2. Expand: Expand the PRK to the desired output length using info
 *
 * SHA3-256 is used as the underlying hash for the default profile,
 * providing post-quantum resistance at the hash level.
 *
 * @param ikm - Input key material (e.g., shared secret from ECDH/KEM)
 * @param salt - Optional salt (defaults to zeros). Should be random for extract.
 * @param info - Context-specific info string (application-specific)
 * @param length - Output key length in bytes (default: 32)
 * @returns Derived key material
 *
 * @example
 * ```typescript
 * // Derive encryption key from ECDH shared secret
 * const sharedSecret = x25519.getSharedSecret(privKey, pubKey);
 * const encryptionKey = hkdfSha3_256(sharedSecret, salt, 'message-encryption', 32);
 * ```
 */
export function hkdfSha3_256(
  ikm: Uint8Array,
  salt: Uint8Array | undefined,
  info: string,
  length: number = DEFAULT_KEY_LENGTH
): Uint8Array {
  const infoBytes = toBytes(info);
  return hkdf(sha3_256, ikm, salt, infoBytes, length);
}

/**
 * Derives a key using HKDF-SHA-384.
 *
 * Uses SHA-384 (from the SHA-2 family) as required by CNSA Suite 2.0.
 *
 * @param ikm - Input key material
 * @param salt - Optional salt
 * @param info - Context-specific info string
 * @param length - Output key length in bytes (default: 32)
 * @returns Derived key material
 *
 * @example
 * ```typescript
 * // Derive key for CNSA 2.0 profile
 * const key = hkdfSha384(sharedSecret, salt, 'cnsa2-encryption', 32);
 * ```
 */
export function hkdfSha384(
  ikm: Uint8Array,
  salt: Uint8Array | undefined,
  info: string,
  length: number = DEFAULT_KEY_LENGTH
): Uint8Array {
  const infoBytes = toBytes(info);
  return hkdf(sha384, ikm, salt, infoBytes, length);
}

/**
 * Profile-aware HKDF key derivation.
 *
 * Selects the appropriate hash function based on the crypto profile:
 * - 'default': HKDF-SHA3-256
 * - 'cnsa2': HKDF-SHA-384
 *
 * @param options - Key derivation options
 * @param profile - Crypto profile (default: 'default')
 * @returns Derived key material
 *
 * @example
 * ```typescript
 * const key = deriveKey({
 *   ikm: sharedSecret,
 *   salt: randomBytes(32),
 *   info: 'message-encryption-v1',
 *   length: 32,
 * });
 * ```
 */
export function deriveKey(
  options: HKDFOptions,
  profile: CryptoProfile = 'default'
): Uint8Array {
  const { ikm, salt, info, length = DEFAULT_KEY_LENGTH } = options;

  if (profile === 'cnsa2') {
    return hkdfSha384(ikm, salt, info, length);
  }
  return hkdfSha3_256(ikm, salt, info, length);
}

/**
 * Standard info strings for different key derivation contexts.
 *
 * Using standardized info strings ensures consistent key derivation
 * across the application and prevents key reuse across contexts.
 */
export const KDF_INFO = {
  /** Key wrapping for session keys */
  KEY_WRAP: 'adieuu-key-wrap-v1',
  /** Message encryption key derivation */
  MESSAGE_ENCRYPT: 'adieuu-message-encrypt-v1',
  /** Identity key backup encryption */
  KEY_BACKUP: 'adieuu-key-backup-v1',
  /** Space cipher derivation */
  SPACE_CIPHER: 'adieuu-space-cipher-v1',
  /** Channel cipher derivation */
  CHANNEL_CIPHER: 'adieuu-channel-cipher-v1',
  /** File encryption key derivation */
  FILE_ENCRYPT: 'adieuu-file-encrypt-v1',
  /** Chunk key derivation for large files */
  CHUNK_KEY: 'adieuu-chunk-key-v1',
} as const;

/**
 * Derives a wrapping key from hybrid shared secrets.
 *
 * Combines ECDH and KEM shared secrets to derive a key for
 * wrapping session keys. This is used in the hybrid encryption flow.
 *
 * @param ecdhShared - Shared secret from X25519 ECDH
 * @param kemShared - Shared secret from ML-KEM
 * @param salt - Optional salt
 * @param profile - Crypto profile
 * @returns 32-byte wrapping key
 *
 * @example
 * ```typescript
 * const ecdhShared = x25519.getSharedSecret(ephemeralPrivate, recipientPublic);
 * const kemResult = mlkem.encapsulate(recipientKemPublic);
 *
 * const wrappingKey = deriveWrappingKey(
 *   ecdhShared,
 *   kemResult.sharedSecret,
 * );
 * ```
 */
export function deriveWrappingKey(
  ecdhShared: Uint8Array,
  kemShared: Uint8Array,
  salt?: Uint8Array,
  profile: CryptoProfile = 'default'
): Uint8Array {
  // Concatenate both shared secrets as IKM
  const combined = new Uint8Array(ecdhShared.length + kemShared.length);
  combined.set(ecdhShared, 0);
  combined.set(kemShared, ecdhShared.length);

  return deriveKey(
    {
      ikm: combined,
      salt,
      info: KDF_INFO.KEY_WRAP,
      length: 32,
    },
    profile
  );
}

/**
 * Derives a cipher key from entropy pieces (for Spaces).
 *
 * Used in the Community Cipher flow where a shared symmetric key
 * is derived from known entropy (passphrase, file hashes, etc).
 *
 * @param entropyPieces - Array of entropy values to combine
 * @param profile - Crypto profile
 * @returns 32-byte cipher key
 *
 * @example
 * ```typescript
 * const entropy = [
 *   toBytes('founding phrase'),
 *   sha256(logoImageBytes),
 *   sha256(toBytes('https://example.com/invite')),
 * ];
 *
 * const spaceCipher = deriveCipherKey(entropy);
 * ```
 */
export function deriveCipherKey(
  entropyPieces: Uint8Array[],
  profile: CryptoProfile = 'default'
): Uint8Array {
  // Concatenate all entropy pieces
  const totalLength = entropyPieces.reduce((sum, piece) => sum + piece.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const piece of entropyPieces) {
    combined.set(piece, offset);
    offset += piece.length;
  }

  return deriveKey(
    {
      ikm: combined,
      salt: toBytes('adieuu-cipher-v1'),
      info: KDF_INFO.SPACE_CIPHER,
      length: 32,
    },
    profile
  );
}

/**
 * Derives a chunk encryption key for large file encryption.
 *
 * Each chunk of a large file uses a unique key derived from the
 * file key and chunk index. This enables streaming decryption.
 *
 * @param fileKey - Master file encryption key
 * @param chunkIndex - Zero-based chunk index
 * @param profile - Crypto profile
 * @returns 32-byte chunk encryption key
 *
 * @example
 * ```typescript
 * const fileKey = randomBytes(32);
 * for (let i = 0; i < chunkCount; i++) {
 *   const chunkKey = deriveChunkKey(fileKey, i);
 *   const encrypted = encrypt(chunkKey, chunks[i]);
 * }
 * ```
 */
export function deriveChunkKey(
  fileKey: Uint8Array,
  chunkIndex: number,
  profile: CryptoProfile = 'default'
): Uint8Array {
  const indexBytes = new Uint8Array(4);
  const view = new DataView(indexBytes.buffer);
  view.setUint32(0, chunkIndex, false); // big-endian

  return deriveKey(
    {
      ikm: fileKey,
      salt: indexBytes,
      info: KDF_INFO.CHUNK_KEY,
      length: 32,
    },
    profile
  );
}
