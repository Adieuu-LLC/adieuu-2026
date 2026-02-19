/**
 * Argon2id Password-Based Key Derivation
 *
 * Argon2id is a memory-hard key derivation function that combines
 * Argon2i (data-independent) and Argon2d (data-dependent) modes.
 * It's the recommended choice for password hashing and key derivation.
 *
 * Memory-hardness makes GPU/ASIC-based attacks expensive.
 *
 * @module crypto/kdf/argon2
 */

import { argon2id } from 'hash-wasm';
import { randomBytes, toBytes } from '../utils';
import type { Argon2Options } from '../types';

/**
 * Default Argon2id parameters.
 *
 * These are tuned for security while remaining practical on mobile devices.
 * Based on OWASP recommendations for key derivation.
 */
export const ARGON2_DEFAULTS = {
  /** Memory cost in KiB (64 MB) */
  memoryCost: 65536,
  /** Time cost / iterations */
  timeCost: 3,
  /** Parallelism (number of threads) */
  parallelism: 4,
  /** Output key length in bytes */
  outputLength: 32,
  /** Recommended salt length in bytes */
  saltLength: 16,
} as const;

/**
 * High-security Argon2id parameters.
 *
 * For server-stored encrypted key bundles where offline brute-force
 * is a concern. More expensive but provides stronger protection.
 */
export const ARGON2_HIGH_SECURITY = {
  /** Memory cost in KiB (256 MB) */
  memoryCost: 262144,
  /** Time cost / iterations */
  timeCost: 4,
  /** Parallelism */
  parallelism: 4,
  /** Output key length */
  outputLength: 32,
  /** Salt length */
  saltLength: 32,
} as const;

/**
 * Derives a key from a password using Argon2id.
 *
 * This is used to encrypt identity key bundles with a passphrase.
 * The resulting key can be used with AES-GCM or ChaCha20-Poly1305.
 *
 * @param options - Argon2 configuration options
 * @returns Derived key material
 *
 * @example
 * ```typescript
 * const salt = randomBytes(16);
 * const key = await deriveKeyFromPassword({
 *   password: userPassword,
 *   salt,
 *   memoryCost: 65536,  // 64 MB
 *   timeCost: 3,
 *   parallelism: 4,
 *   outputLength: 32,
 * });
 *
 * // Use key to encrypt identity keys
 * const encrypted = encrypt(key, serializedPrivateKeys);
 * ```
 */
export async function deriveKeyFromPassword(
  options: Argon2Options
): Promise<Uint8Array> {
  const {
    password,
    salt,
    memoryCost = ARGON2_DEFAULTS.memoryCost,
    timeCost = ARGON2_DEFAULTS.timeCost,
    parallelism = ARGON2_DEFAULTS.parallelism,
    outputLength = ARGON2_DEFAULTS.outputLength,
  } = options;

  if (salt.length < 8) {
    throw new Error('Salt must be at least 8 bytes');
  }

  const result = await argon2id({
    password,
    salt,
    parallelism,
    iterations: timeCost,
    memorySize: memoryCost,
    hashLength: outputLength,
    outputType: 'binary',
  });

  return result;
}

/**
 * Derives a key using default parameters.
 *
 * Convenience function using recommended default parameters.
 *
 * @param password - User's passphrase
 * @param salt - Random salt (16+ bytes)
 * @returns 32-byte derived key
 *
 * @example
 * ```typescript
 * const salt = generateArgon2Salt();
 * const key = await deriveKey(password, salt);
 * ```
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  return deriveKeyFromPassword({
    password,
    salt,
    memoryCost: ARGON2_DEFAULTS.memoryCost,
    timeCost: ARGON2_DEFAULTS.timeCost,
    parallelism: ARGON2_DEFAULTS.parallelism,
    outputLength: ARGON2_DEFAULTS.outputLength,
  });
}

/**
 * Derives a key using high-security parameters.
 *
 * Use this for encrypting key bundles stored on the server,
 * where offline brute-force attacks are a concern.
 *
 * @param password - User's passphrase
 * @param salt - Random salt (32 bytes recommended)
 * @returns 32-byte derived key
 *
 * @example
 * ```typescript
 * const salt = randomBytes(32);
 * const key = await deriveKeyHighSecurity(password, salt);
 *
 * // Use for encrypting identity key bundle for server storage
 * const encryptedBundle = encrypt(key, keyBundle);
 * ```
 */
export async function deriveKeyHighSecurity(
  password: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  return deriveKeyFromPassword({
    password,
    salt,
    memoryCost: ARGON2_HIGH_SECURITY.memoryCost,
    timeCost: ARGON2_HIGH_SECURITY.timeCost,
    parallelism: ARGON2_HIGH_SECURITY.parallelism,
    outputLength: ARGON2_HIGH_SECURITY.outputLength,
  });
}

/**
 * Generates a random salt for Argon2.
 *
 * @param length - Salt length in bytes (default: 16)
 * @returns Random salt
 *
 * @example
 * ```typescript
 * const salt = generateArgon2Salt();
 * const key = await deriveKey(password, salt);
 *
 * // Store salt alongside encrypted data
 * ```
 */
export function generateArgon2Salt(
  length: number = ARGON2_DEFAULTS.saltLength
): Uint8Array {
  return randomBytes(length);
}

/**
 * Verifies a password against a stored hash.
 *
 * Derives a key from the password using the same parameters,
 * then compares with the stored hash in constant time.
 *
 * @param password - Password to verify
 * @param expectedHash - Previously derived hash
 * @param salt - Salt used during original derivation
 * @param options - Argon2 parameters (must match original)
 * @returns true if password matches, false otherwise
 *
 * @example
 * ```typescript
 * const isValid = await verifyPassword(
 *   userInput,
 *   storedHash,
 *   storedSalt,
 *   { memoryCost: 65536, timeCost: 3, parallelism: 4 }
 * );
 * ```
 */
export async function verifyPassword(
  password: string,
  expectedHash: Uint8Array,
  salt: Uint8Array,
  options?: Partial<Omit<Argon2Options, 'password' | 'salt'>>
): Promise<boolean> {
  const derived = await deriveKeyFromPassword({
    password,
    salt,
    memoryCost: options?.memoryCost ?? ARGON2_DEFAULTS.memoryCost,
    timeCost: options?.timeCost ?? ARGON2_DEFAULTS.timeCost,
    parallelism: options?.parallelism ?? ARGON2_DEFAULTS.parallelism,
    outputLength: options?.outputLength ?? expectedHash.length,
  });

  // Constant-time comparison
  if (derived.length !== expectedHash.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < derived.length; i++) {
    result |= (derived[i] ?? 0) ^ (expectedHash[i] ?? 0);
  }
  return result === 0;
}

/**
 * Estimates time to derive a key with given parameters.
 *
 * Useful for testing parameter choices and providing user feedback.
 *
 * @param options - Argon2 parameters to test
 * @returns Derivation time in milliseconds
 *
 * @example
 * ```typescript
 * const timeMs = await benchmarkArgon2({
 *   memoryCost: 65536,
 *   timeCost: 3,
 *   parallelism: 4,
 * });
 *
 * console.log(`Key derivation takes ${timeMs}ms`);
 * ```
 */
export async function benchmarkArgon2(
  options?: Partial<Omit<Argon2Options, 'password' | 'salt'>>
): Promise<number> {
  const testPassword = 'benchmark-test-password';
  const testSalt = randomBytes(16);

  const start = performance.now();
  await deriveKeyFromPassword({
    password: testPassword,
    salt: testSalt,
    memoryCost: options?.memoryCost ?? ARGON2_DEFAULTS.memoryCost,
    timeCost: options?.timeCost ?? ARGON2_DEFAULTS.timeCost,
    parallelism: options?.parallelism ?? ARGON2_DEFAULTS.parallelism,
    outputLength: options?.outputLength ?? 32,
  });
  const end = performance.now();

  return end - start;
}
