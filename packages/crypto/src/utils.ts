/**
 * Cryptographic Utilities
 *
 * Encoding, random generation, and helper functions for crypto operations.
 *
 * @module crypto/utils
 */

import { randomBytes as nobleRandomBytes } from '@noble/hashes/utils';

/**
 * Generates cryptographically secure random bytes.
 *
 * Uses @noble/hashes randomBytes which internally uses
 * crypto.getRandomValues (browser) or crypto.randomBytes (Node/Bun).
 *
 * @param length - Number of random bytes to generate
 * @returns Uint8Array of random bytes
 *
 * @example
 * ```typescript
 * const nonce = randomBytes(12);  // 12-byte nonce for GCM/ChaCha
 * const key = randomBytes(32);    // 256-bit key
 * ```
 */
export function randomBytes(length: number): Uint8Array {
  return nobleRandomBytes(length);
}

/**
 * Converts a Uint8Array to a base64 string.
 *
 * @param bytes - The byte array to encode
 * @returns Base64 encoded string
 *
 * @example
 * ```typescript
 * const encoded = toBase64(new Uint8Array([72, 101, 108, 108, 111]));
 * // "SGVsbG8="
 * ```
 */
export function toBase64(bytes: Uint8Array): string {
  // Use Buffer in Node/Bun, btoa in browser
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Converts a base64 string to a Uint8Array.
 *
 * @param base64 - Base64 encoded string
 * @returns Decoded byte array
 *
 * @example
 * ```typescript
 * const bytes = fromBase64("SGVsbG8=");
 * // Uint8Array([72, 101, 108, 108, 111])
 * ```
 */
export function fromBase64(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts a Uint8Array to a URL-safe base64 string.
 *
 * Replaces standard base64 characters:
 * - '+' becomes '-'
 * - '/' becomes '_'
 * - '=' padding is removed
 *
 * @param bytes - The byte array to encode
 * @returns URL-safe base64 encoded string
 *
 * @example
 * ```typescript
 * const encoded = toBase64Url(randomBytes(32));
 * // "kG7x_mN2pQ3rS4tU5vW6xY7zA8bC9dE0fG1hI2jK3lM"
 * ```
 */
export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Converts a URL-safe base64 string to a Uint8Array.
 *
 * Reverses the base64url encoding by:
 * - Replacing '-' with '+'
 * - Replacing '_' with '/'
 * - Restoring '=' padding as needed
 *
 * @param base64Url - URL-safe base64 encoded string
 * @returns Decoded byte array
 *
 * @example
 * ```typescript
 * const bytes = fromBase64Url("SGVsbG8");
 * // Uint8Array([72, 101, 108, 108, 111])
 * ```
 */
export function fromBase64Url(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return fromBase64(padded);
}

/**
 * Converts a Uint8Array to a hexadecimal string.
 *
 * @param bytes - The byte array to encode
 * @returns Hexadecimal string (lowercase)
 *
 * @example
 * ```typescript
 * const hex = toHex(new Uint8Array([255, 0, 171]));
 * // "ff00ab"
 * ```
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts a hexadecimal string to a Uint8Array.
 *
 * @param hex - Hexadecimal string (case-insensitive)
 * @returns Decoded byte array
 * @throws Error if hex string has odd length or invalid characters
 *
 * @example
 * ```typescript
 * const bytes = fromHex("ff00ab");
 * // Uint8Array([255, 0, 171])
 * ```
 */
export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`Invalid hex character at position ${i}`);
    }
    bytes[i / 2] = byte;
  }
  return bytes;
}

/**
 * Converts a UTF-8 string to a Uint8Array.
 *
 * @param str - UTF-8 string
 * @returns Encoded byte array
 *
 * @example
 * ```typescript
 * const bytes = toBytes("Hello");
 * // Uint8Array([72, 101, 108, 108, 111])
 * ```
 */
export function toBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Converts a Uint8Array to a UTF-8 string.
 *
 * @param bytes - Byte array to decode
 * @returns UTF-8 string
 *
 * @example
 * ```typescript
 * const str = fromBytes(new Uint8Array([72, 101, 108, 108, 111]));
 * // "Hello"
 * ```
 */
export function fromBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Concatenates multiple Uint8Arrays into one.
 *
 * @param arrays - Arrays to concatenate
 * @returns Combined array
 *
 * @example
 * ```typescript
 * const combined = concatBytes(
 *   new Uint8Array([1, 2]),
 *   new Uint8Array([3, 4]),
 *   new Uint8Array([5])
 * );
 * // Uint8Array([1, 2, 3, 4, 5])
 * ```
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Compares two Uint8Arrays for equality in constant time.
 *
 * Prevents timing attacks by always comparing all bytes.
 *
 * @param a - First array
 * @param b - Second array
 * @returns true if arrays are equal, false otherwise
 *
 * @example
 * ```typescript
 * const hash1 = sha256(data);
 * const hash2 = getStoredHash();
 * if (constantTimeEqual(hash1, hash2)) {
 *   // Valid
 * }
 * ```
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    // Still iterate to maintain constant time relative to array length
    let result = 0;
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i++) {
      result |= (a[i] ?? 0) ^ (b[i] ?? 0);
    }
    // But always return false for length mismatch
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return result === 0;
}

/**
 * Securely clears sensitive data from a Uint8Array.
 *
 * Overwrites the array with zeros to prevent sensitive data
 * from remaining in memory.
 *
 * @param bytes - Array to clear
 *
 * @example
 * ```typescript
 * const privateKey = generatePrivateKey();
 * // ... use the key ...
 * clearBytes(privateKey); // Zero out when done
 * ```
 */
export function clearBytes(bytes: Uint8Array): void {
  bytes.fill(0);
}

/**
 * Creates a copy of a Uint8Array.
 *
 * @param bytes - Array to copy
 * @returns New array with same contents
 *
 * @example
 * ```typescript
 * const copy = copyBytes(originalKey);
 * ```
 */
export function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}
