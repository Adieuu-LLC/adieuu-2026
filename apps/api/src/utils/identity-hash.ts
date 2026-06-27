/**
 * Identity Hash Utility
 *
 * Provides secure, deterministic hashing for identity credentials.
 * Uses a double-hash approach for defense-in-depth:
 *
 * 1. Inner hash: Argon2id (memory-hard, via hash-wasm)
 * 2. Outer hash: SHA3-256 (post-quantum resistant construction)
 *
 * The result is: SHA3-256(Argon2id(passphrase, salt=accountHash))
 *
 * SECURITY NOTES:
 * - The hash is deterministic (salt is the HMAC-derived accountHash)
 * - accountHash is non-reversible without ACCOUNT_HASH_SECRET
 * - Parameters are versioned to allow future algorithm migration
 * - Minimum passphrase length: 8 characters
 *
 * @module utils/identity-hash
 */

import { createHash } from 'crypto';
import { deriveKeyFromPassword, toHex } from '@adieuu/crypto';

/**
 * Hash version configuration.
 * Each version defines specific Argon2id parameters.
 */
export interface HashVersionConfig {
  /** Argon2id memory cost in KiB */
  memoryCost: number;
  /** Argon2id time cost (iterations) */
  timeCost: number;
  /** Argon2id parallelism (threads) */
  parallelism: number;
}

/**
 * Hash version configurations.
 *
 * Version 1: Original PBKDF2 scheme (deprecated, no longer supported).
 * Version 2: Argon2id + SHA3-256 with accountHash as salt.
 */
export const HASH_VERSIONS: Record<number, HashVersionConfig> = {
  2: {
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 1,
  },
};

/** Current hash version to use for new identities */
export const CURRENT_HASH_VERSION = 2;

/** Minimum passphrase length */
export const MIN_PASSPHRASE_LENGTH = 8;

/**
 * Validates passphrase meets minimum requirements.
 */
export function validatePassphrase(passphrase: string): {
  valid: boolean;
  error?: string;
} {
  if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    return {
      valid: false,
      error: `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`,
    };
  }
  return { valid: true };
}

/**
 * Generates the identity hash using the double-hash approach.
 *
 * Hash = SHA3-256(Argon2id(passphrase, salt=accountHash))
 *
 * @param passphrase - The user's passphrase (min 8 characters)
 * @param accountHash - HMAC-SHA256 derived account hash (64-char hex)
 * @param version - The hash version to use (default: current)
 * @returns The identity hash (hex string) and version used
 */
export async function generateIdentityHash(
  passphrase: string,
  accountHash: string,
  version: number = CURRENT_HASH_VERSION,
): Promise<{ hash: string; version: number }> {
  const validation = validatePassphrase(passphrase);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const versionConfig = HASH_VERSIONS[version];
  if (!versionConfig) {
    throw new Error(`Unknown hash version: ${version}`);
  }

  // Salt is the raw bytes of the accountHash hex string
  const salt = new TextEncoder().encode(accountHash);

  // Inner hash: Argon2id with deterministic salt (via @adieuu/crypto)
  const innerBytes = await deriveKeyFromPassword({
    password: passphrase,
    salt,
    parallelism: versionConfig.parallelism,
    timeCost: versionConfig.timeCost,
    memoryCost: versionConfig.memoryCost,
    outputLength: 32,
  });
  const innerHash = toHex(innerBytes);

  // Outer hash: SHA3-256
  const outerHash = createHash('sha3-256')
    .update(innerHash)
    .digest('hex');

  return { hash: outerHash, version };
}

/**
 * Verifies a passphrase against a stored identity hash.
 *
 * @param passphrase - The passphrase to verify
 * @param accountHash - HMAC-SHA256 derived account hash
 * @param storedHash - The stored identity hash to compare against
 * @param storedVersion - The hash version used for the stored hash
 * @returns Object with match result and optional new hash if upgrade needed
 */
export async function verifyIdentityHash(
  passphrase: string,
  accountHash: string,
  storedHash: string,
  storedVersion: number,
): Promise<{
  match: boolean;
  needsUpgrade: boolean;
  newHash?: string;
  newVersion?: number;
}> {
  const { hash: computedHash } = await generateIdentityHash(
    passphrase,
    accountHash,
    storedVersion,
  );

  const match = constantTimeCompare(computedHash, storedHash);

  if (!match) {
    return { match: false, needsUpgrade: false };
  }

  if (storedVersion < CURRENT_HASH_VERSION) {
    const { hash: newHash, version: newVersion } = await generateIdentityHash(
      passphrase,
      accountHash,
      CURRENT_HASH_VERSION,
    );
    return { match: true, needsUpgrade: true, newHash, newVersion };
  }

  return { match: true, needsUpgrade: false };
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  let result = 0;
  for (let i = 0; i < bufferA.length; i++) {
    result |= bufferA[i]! ^ bufferB[i]!;
  }

  return result === 0;
}
