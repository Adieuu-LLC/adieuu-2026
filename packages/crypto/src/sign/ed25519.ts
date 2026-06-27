/**
 * Ed25519 Digital Signature Module
 *
 * Provides digital signature operations using Ed25519 (EdDSA).
 * Ed25519 offers fast signing/verification, small signatures (64 bytes),
 * and high security with 128-bit equivalent strength.
 *
 * @module crypto/sign/ed25519
 */

import { ed25519 } from '@noble/curves/ed25519';
import { sha512 } from '@noble/hashes/sha2';
import { concatBytes } from '../utils';

/**
 * Ed25519 signature size (64 bytes).
 */
export const ED25519_SIGNATURE_SIZE = 64;

/**
 * Ed25519 public key size (32 bytes).
 */
export const ED25519_PUBLIC_KEY_SIZE = 32;

/**
 * Ed25519 private key size (32 bytes).
 */
export const ED25519_PRIVATE_KEY_SIZE = 32;

/**
 * Signs a message using Ed25519.
 *
 * Creates a 64-byte signature that can be verified with the corresponding
 * public key. The signature is deterministic (same message + key = same signature).
 *
 * @param privateKey - 32-byte Ed25519 private key
 * @param message - Message to sign
 * @returns 64-byte signature
 *
 * @example
 * ```typescript
 * const keyPair = generateSigningKeyPair();
 * const message = toBytes('Hello, World!');
 * const signature = sign(keyPair.privateKey, message);
 *
 * // Signature can be verified by anyone with the public key
 * const isValid = verify(keyPair.publicKey, message, signature);
 * ```
 */
export function sign(privateKey: Uint8Array, message: Uint8Array): Uint8Array {
  if (privateKey.length !== ED25519_PRIVATE_KEY_SIZE) {
    throw new Error(
      `Private key must be ${ED25519_PRIVATE_KEY_SIZE} bytes, got ${privateKey.length}`
    );
  }
  return ed25519.sign(message, privateKey);
}

/**
 * Verifies an Ed25519 signature.
 *
 * Checks that the signature was created by the holder of the private key
 * corresponding to the given public key, and that the message hasn't been
 * modified.
 *
 * @param publicKey - 32-byte Ed25519 public key
 * @param message - Original message that was signed
 * @param signature - 64-byte signature to verify
 * @returns true if signature is valid, false otherwise
 *
 * @example
 * ```typescript
 * if (verify(senderPublicKey, message, signature)) {
 *   // Message is authentic and unmodified
 * } else {
 *   // Signature is invalid - message may be forged or tampered
 * }
 * ```
 */
export function verify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  if (publicKey.length !== ED25519_PUBLIC_KEY_SIZE) {
    return false;
  }
  if (signature.length !== ED25519_SIGNATURE_SIZE) {
    return false;
  }

  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    // Invalid signature format or other error
    return false;
  }
}

/**
 * Signs multiple data chunks as a single message.
 *
 * Concatenates all chunks and signs the combined data.
 * Useful for signing structured data like (ciphertext || nonce || wrappedKeys).
 *
 * @param privateKey - 32-byte Ed25519 private key
 * @param chunks - Data chunks to concatenate and sign
 * @returns 64-byte signature
 *
 * @example
 * ```typescript
 * const signature = signChunks(privateKey, [
 *   ciphertext,
 *   nonce,
 *   serializedWrappedKeys,
 * ]);
 * ```
 */
export function signChunks(
  privateKey: Uint8Array,
  chunks: Uint8Array[]
): Uint8Array {
  const combined = concatBytes(...chunks);
  return sign(privateKey, combined);
}

/**
 * Verifies a signature over multiple data chunks.
 *
 * @param publicKey - 32-byte Ed25519 public key
 * @param chunks - Data chunks that were signed
 * @param signature - 64-byte signature
 * @returns true if valid, false otherwise
 */
export function verifyChunks(
  publicKey: Uint8Array,
  chunks: Uint8Array[],
  signature: Uint8Array
): boolean {
  const combined = concatBytes(...chunks);
  return verify(publicKey, combined, signature);
}

/**
 * Creates a detached signature with a SHA-512 prehash.
 *
 * For very large messages, this hashes the message first with SHA-512,
 * then signs the hash. This is more efficient for large data.
 *
 * Note: The verifier must use the same prehashing approach.
 *
 * @param privateKey - 32-byte Ed25519 private key
 * @param message - Message to sign (will be hashed first)
 * @returns 64-byte signature over the hash
 *
 * @example
 * ```typescript
 * // For large files, use prehashing
 * const largeFile = readFile('large-video.mp4');
 * const signature = signPrehashed(privateKey, largeFile);
 * ```
 */
export function signPrehashed(
  privateKey: Uint8Array,
  message: Uint8Array
): Uint8Array {
  if (privateKey.length !== ED25519_PRIVATE_KEY_SIZE) {
    throw new Error(
      `Private key must be ${ED25519_PRIVATE_KEY_SIZE} bytes, got ${privateKey.length}`
    );
  }
  const messageHash = sha512(message);
  return ed25519.sign(messageHash, privateKey);
}

/**
 * Verifies a prehashed signature.
 *
 * @param publicKey - 32-byte Ed25519 public key
 * @param message - Original message (will be hashed for verification)
 * @param signature - 64-byte signature
 * @returns true if valid, false otherwise
 */
export function verifyPrehashed(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  if (publicKey.length !== ED25519_PUBLIC_KEY_SIZE) {
    return false;
  }
  if (signature.length !== ED25519_SIGNATURE_SIZE) {
    return false;
  }

  try {
    const messageHash = sha512(message);
    return ed25519.verify(signature, messageHash, publicKey);
  } catch {
    return false;
  }
}
