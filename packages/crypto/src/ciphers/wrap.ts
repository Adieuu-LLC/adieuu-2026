/**
 * Entropy Wrapping for Community Ciphers
 *
 * Encrypts cipher entropy pieces at rest using a key derived from the
 * identity passphrase. This protects entropy from:
 * - XSS exfiltration (attacker can't read entropy without passphrase)
 * - Cross-identity access (each identity's entropy encrypted separately)
 * - Physical device access (requires identity login)
 *
 * @module crypto/ciphers/wrap
 */

import { encrypt, decrypt } from '../encrypt/symmetric';
import { deriveKey, generateArgon2Salt, ARGON2_DEFAULTS } from '../kdf/argon2';
import { randomBytes, toBase64, fromBase64, concatBytes } from '../utils';
import type { EntropyPiece } from './types';

/**
 * Version byte for wrapped entropy format.
 * Allows future format changes while maintaining backwards compatibility.
 */
export const ENTROPY_WRAP_VERSION = 0x01;

/**
 * Configuration for entropy wrapping.
 */
export interface EntropyWrapConfig {
  /** Memory cost for Argon2 (default: 65536 / 64MB) */
  memoryCost?: number;
  /** Time cost for Argon2 (default: 3) */
  timeCost?: number;
  /** Parallelism for Argon2 (default: 4) */
  parallelism?: number;
}

/**
 * Wrapped entropy bundle ready for storage.
 */
export interface WrappedEntropy {
  /** Version byte for format compatibility */
  version: number;
  /** Salt used for key derivation (base64) */
  salt: string;
  /** Encrypted entropy pieces (base64) */
  ciphertext: string;
  /** Nonce used for encryption (base64) */
  nonce: string;
}

/**
 * Derives a wrapping key from the identity passphrase.
 *
 * This key is used to encrypt/decrypt entropy pieces at rest.
 * Should be called during identity login and cached in memory for the session.
 *
 * @param passphrase - Identity passphrase
 * @param salt - Salt for key derivation (per-identity, stored alongside wrapped entropy)
 * @param config - Optional Argon2 configuration
 * @returns 32-byte wrapping key
 *
 * @example
 * ```typescript
 * // During identity login
 * const salt = getStoredSaltForIdentity(identityId) ?? generateWrappingSalt();
 * const wrappingKey = await deriveEntropyWrappingKey(passphrase, salt);
 *
 * // Cache wrappingKey in memory for the session
 * // Clear on logout
 * ```
 */
export async function deriveEntropyWrappingKey(
  passphrase: string,
  salt: Uint8Array,
  config?: EntropyWrapConfig
): Promise<Uint8Array> {
  return deriveKey(passphrase, salt);
}

/**
 * Generates a random salt for entropy wrapping.
 *
 * This salt should be stored per-identity and used consistently
 * for all cipher entropy belonging to that identity.
 *
 * @returns 16-byte random salt
 */
export function generateWrappingSalt(): Uint8Array {
  return generateArgon2Salt(ARGON2_DEFAULTS.saltLength);
}

/**
 * Encrypts entropy pieces for secure storage.
 *
 * @param entropyPieces - Array of entropy pieces to encrypt
 * @param wrappingKey - Key derived from identity passphrase
 * @returns Wrapped entropy ready for storage
 *
 * @example
 * ```typescript
 * const wrappingKey = await deriveEntropyWrappingKey(passphrase, salt);
 * const wrapped = await wrapEntropy(entropyPieces, wrappingKey);
 *
 * // Store wrapped.ciphertext and wrapped.nonce in IndexedDB
 * storedCipher.encryptedEntropy = wrapped;
 * ```
 */
export async function wrapEntropy(
  entropyPieces: EntropyPiece[],
  wrappingKey: Uint8Array,
  salt: Uint8Array
): Promise<WrappedEntropy> {
  // Serialize entropy pieces to JSON
  const plaintext = new TextEncoder().encode(JSON.stringify(entropyPieces));

  // Encrypt with ChaCha20-Poly1305
  const { ciphertext, nonce } = encrypt(wrappingKey, plaintext);

  return {
    version: ENTROPY_WRAP_VERSION,
    salt: toBase64(salt),
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
  };
}

/**
 * Decrypts wrapped entropy pieces.
 *
 * @param wrapped - Wrapped entropy from storage
 * @param wrappingKey - Key derived from identity passphrase
 * @returns Decrypted entropy pieces
 * @throws Error if decryption fails (wrong key or corrupted data)
 *
 * @example
 * ```typescript
 * const wrappingKey = await deriveEntropyWrappingKey(passphrase, salt);
 * const entropyPieces = await unwrapEntropy(storedCipher.encryptedEntropy, wrappingKey);
 *
 * // Now can derive cipher from entropy
 * const cipher = deriveCommunityCipher(entropyPieces);
 * ```
 */
export async function unwrapEntropy(
  wrapped: WrappedEntropy,
  wrappingKey: Uint8Array
): Promise<EntropyPiece[]> {
  if (wrapped.version !== ENTROPY_WRAP_VERSION) {
    throw new Error(`Unsupported entropy wrap version: ${wrapped.version}`);
  }

  const ciphertext = fromBase64(wrapped.ciphertext);
  const nonce = fromBase64(wrapped.nonce);

  // Decrypt
  const plaintext = decrypt(wrappingKey, ciphertext, nonce);

  // Parse JSON
  const entropyPieces = JSON.parse(new TextDecoder().decode(plaintext)) as EntropyPiece[];

  return entropyPieces;
}

/**
 * Checks if entropy is wrapped (encrypted) format.
 *
 * Used to detect legacy plaintext entropy for migration.
 *
 * @param data - Data to check (could be EntropyPiece[] or WrappedEntropy)
 * @returns true if data is wrapped entropy
 */
export function isWrappedEntropy(data: unknown): data is WrappedEntropy {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.version === 'number' &&
    typeof obj.salt === 'string' &&
    typeof obj.ciphertext === 'string' &&
    typeof obj.nonce === 'string'
  );
}

/**
 * Migrates plaintext entropy to wrapped format.
 *
 * Call this when loading legacy ciphers that have unencrypted entropy.
 *
 * @param entropyPieces - Plaintext entropy pieces
 * @param wrappingKey - Key derived from identity passphrase
 * @param salt - Salt for this identity
 * @returns Wrapped entropy ready for storage
 */
export async function migrateEntropyToWrapped(
  entropyPieces: EntropyPiece[],
  wrappingKey: Uint8Array,
  salt: Uint8Array
): Promise<WrappedEntropy> {
  return wrapEntropy(entropyPieces, wrappingKey, salt);
}

/**
 * Gets the salt from wrapped entropy.
 *
 * Useful for re-deriving the wrapping key on subsequent logins.
 *
 * @param wrapped - Wrapped entropy
 * @returns Salt as Uint8Array
 */
export function getSaltFromWrapped(wrapped: WrappedEntropy): Uint8Array {
  return fromBase64(wrapped.salt);
}
