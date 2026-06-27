/**
 * Cipher Identification Module
 *
 * Generates unique, non-reversible identifiers for community ciphers.
 * The cipher ID allows:
 * - Message routing without revealing the key
 * - Clients to identify which cipher to use for decryption
 * - Server-side Space/message matching
 *
 * ## ID Generation
 *
 * ```
 * cipher_key (256 bits)
 *           │
 *           ▼
 * HMAC-SHA256(cipher_key, "adieuu-cipher-id")
 *           │
 *           ▼
 * SHA-512(hmac_output)
 *           │
 *           ▼
 * hex-encoded cipher_id (128 chars)
 * ```
 *
 * The double-hash (HMAC then SHA-512) ensures:
 * - Key material cannot be recovered from cipher ID
 * - Sufficient entropy for collision resistance
 * - Fixed-size output regardless of input
 *
 * @module crypto/ciphers/identify
 */

import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { sha512 } from '@noble/hashes/sha2';
import { toBytes } from '../utils';

/**
 * Domain separation string for cipher ID generation.
 */
export const CIPHER_ID_DOMAIN = 'adieuu-cipher-id';

/**
 * Expected cipher key size (256 bits).
 */
export const CIPHER_KEY_SIZE = 32;

/**
 * Cipher ID length in hex characters (SHA-512 = 64 bytes = 128 hex chars).
 */
export const CIPHER_ID_LENGTH = 128;

/**
 * Generates a cipher ID from a cipher key.
 *
 * The cipher ID is a deterministic, non-reversible identifier that can be
 * used for routing and identification without exposing the key material.
 *
 * @param cipherKey - 32-byte cipher key
 * @returns Hex-encoded cipher ID (128 characters)
 * @throws Error if cipher key is wrong size
 *
 * @example
 * ```typescript
 * const cipher = deriveCommunityCipher(entropy);
 * const cipherId = generateCipherId(cipher.key);
 *
 * // cipherId is 128 hex characters, safe to share/store publicly
 * // Cannot reverse back to cipher.key
 * ```
 */
export function generateCipherId(cipherKey: Uint8Array): string {
  if (cipherKey.length !== CIPHER_KEY_SIZE) {
    throw new Error(`Cipher key must be ${CIPHER_KEY_SIZE} bytes, got ${cipherKey.length}`);
  }

  // Step 1: HMAC-SHA256(key, domain)
  const hmacOutput = hmac(sha256, cipherKey, toBytes(CIPHER_ID_DOMAIN));

  // Step 2: SHA-512(hmac_output)
  const hashOutput = sha512(hmacOutput);

  // Step 3: Hex encode
  return toHexLocal(hashOutput);
}

/**
 * Validates a cipher ID format.
 *
 * @param cipherId - Cipher ID to validate
 * @returns True if valid format (128 hex characters)
 */
export function isValidCipherId(cipherId: string): boolean {
  if (cipherId.length !== CIPHER_ID_LENGTH) {
    return false;
  }
  return /^[0-9a-f]+$/i.test(cipherId);
}

/**
 * Compares two cipher IDs for equality.
 *
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param a - First cipher ID
 * @param b - Second cipher ID
 * @returns True if equal
 */
export function cipherIdsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  // Normalize to lowercase for comparison
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  let result = 0;
  for (let i = 0; i < aLower.length; i++) {
    result |= aLower.charCodeAt(i) ^ bLower.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Generates a short cipher ID for display purposes.
 *
 * Returns first 16 characters of the cipher ID, suitable for UI display.
 * Should NOT be used for cryptographic operations.
 *
 * @param cipherId - Full cipher ID
 * @returns Short display version (16 characters)
 */
export function shortCipherId(cipherId: string): string {
  return cipherId.slice(0, 16).toLowerCase();
}

/**
 * Generates a formatted cipher ID for human readability.
 *
 * Formats as groups of 8 characters separated by dashes:
 * "a1b2c3d4-e5f6g7h8-..."
 *
 * @param cipherId - Full cipher ID
 * @param groups - Number of groups to include (default: 4 = 32 chars)
 * @returns Formatted cipher ID
 */
export function formatCipherId(cipherId: string, groups: number = 4): string {
  const lower = cipherId.toLowerCase();
  const chunks: string[] = [];

  for (let i = 0; i < groups && i * 8 < lower.length; i++) {
    chunks.push(lower.slice(i * 8, (i + 1) * 8));
  }

  return chunks.join('-');
}

// ============================================================================
// Local helpers
// ============================================================================

function toHexLocal(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
