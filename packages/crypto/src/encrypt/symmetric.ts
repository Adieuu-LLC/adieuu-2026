/**
 * Symmetric Encryption Module
 *
 * Provides AEAD (Authenticated Encryption with Associated Data) using
 * ChaCha20-Poly1305 (default) or AES-256-GCM (CNSA 2.0).
 *
 * @module crypto/encrypt/symmetric
 */

import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '../utils';
import type { AEADResult, CryptoProfile } from '../types';

/**
 * Nonce size for ChaCha20-Poly1305 (96 bits).
 */
export const CHACHA_NONCE_SIZE = 12;

/**
 * Nonce size for AES-256-GCM (96 bits).
 */
export const AES_GCM_NONCE_SIZE = 12;

/**
 * Key size for symmetric encryption (256 bits).
 */
export const SYMMETRIC_KEY_SIZE = 32;

/**
 * Authentication tag size (128 bits) - same for both algorithms.
 */
export const AUTH_TAG_SIZE = 16;

/**
 * Encrypts data using ChaCha20-Poly1305.
 *
 * ChaCha20-Poly1305 is a fast, secure AEAD cipher that provides
 * both confidentiality and authenticity. It's resistant to timing
 * attacks and performs well on devices without AES hardware.
 *
 * @param key - 32-byte encryption key
 * @param plaintext - Data to encrypt
 * @param nonce - Optional 12-byte nonce (random if not provided)
 * @param associatedData - Optional additional data to authenticate but not encrypt
 * @returns Ciphertext with appended auth tag, and nonce
 *
 * @example
 * ```typescript
 * const key = randomBytes(32);
 * const { ciphertext, nonce } = encryptChaCha20Poly1305(key, plaintext);
 *
 * // Later, decrypt
 * const decrypted = decryptChaCha20Poly1305(key, ciphertext, nonce);
 * ```
 */
export function encryptChaCha20Poly1305(
  key: Uint8Array,
  plaintext: Uint8Array,
  nonce?: Uint8Array,
  associatedData?: Uint8Array
): AEADResult {
  if (key.length !== SYMMETRIC_KEY_SIZE) {
    throw new Error(`Key must be ${SYMMETRIC_KEY_SIZE} bytes, got ${key.length}`);
  }

  const actualNonce = nonce ?? randomBytes(CHACHA_NONCE_SIZE);
  if (actualNonce.length !== CHACHA_NONCE_SIZE) {
    throw new Error(`Nonce must be ${CHACHA_NONCE_SIZE} bytes, got ${actualNonce.length}`);
  }

  const cipher = chacha20poly1305(key, actualNonce, associatedData);
  const ciphertext = cipher.encrypt(plaintext);

  return {
    ciphertext,
    nonce: actualNonce,
  };
}

/**
 * Decrypts data encrypted with ChaCha20-Poly1305.
 *
 * Verifies the authentication tag before returning plaintext.
 * Throws an error if authentication fails (tampered or corrupted data).
 *
 * @param key - 32-byte encryption key (same as used for encryption)
 * @param ciphertext - Encrypted data with appended auth tag
 * @param nonce - 12-byte nonce used during encryption
 * @param associatedData - Optional additional authenticated data (same as encryption)
 * @returns Decrypted plaintext
 * @throws Error if authentication fails
 *
 * @example
 * ```typescript
 * try {
 *   const plaintext = decryptChaCha20Poly1305(key, ciphertext, nonce);
 * } catch (error) {
 *   // Authentication failed - data was tampered
 * }
 * ```
 */
export function decryptChaCha20Poly1305(
  key: Uint8Array,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  associatedData?: Uint8Array
): Uint8Array {
  if (key.length !== SYMMETRIC_KEY_SIZE) {
    throw new Error(`Key must be ${SYMMETRIC_KEY_SIZE} bytes, got ${key.length}`);
  }
  if (nonce.length !== CHACHA_NONCE_SIZE) {
    throw new Error(`Nonce must be ${CHACHA_NONCE_SIZE} bytes, got ${nonce.length}`);
  }
  if (ciphertext.length < AUTH_TAG_SIZE) {
    throw new Error('Ciphertext too short - must include auth tag');
  }

  const cipher = chacha20poly1305(key, nonce, associatedData);
  return cipher.decrypt(ciphertext);
}

/**
 * Encrypts data using AES-256-GCM.
 *
 * AES-256-GCM is an AEAD cipher using AES in Galois/Counter Mode.
 * It's widely supported and may benefit from hardware acceleration
 * (AES-NI) on modern CPUs.
 *
 * @param key - 32-byte encryption key
 * @param plaintext - Data to encrypt
 * @param nonce - Optional 12-byte nonce (random if not provided)
 * @param associatedData - Optional additional data to authenticate but not encrypt
 * @returns Ciphertext with appended auth tag, and nonce
 *
 * @example
 * ```typescript
 * const key = randomBytes(32);
 * const { ciphertext, nonce } = encryptAES256GCM(key, plaintext);
 * ```
 */
export function encryptAES256GCM(
  key: Uint8Array,
  plaintext: Uint8Array,
  nonce?: Uint8Array,
  associatedData?: Uint8Array
): AEADResult {
  if (key.length !== SYMMETRIC_KEY_SIZE) {
    throw new Error(`Key must be ${SYMMETRIC_KEY_SIZE} bytes, got ${key.length}`);
  }

  const actualNonce = nonce ?? randomBytes(AES_GCM_NONCE_SIZE);
  if (actualNonce.length !== AES_GCM_NONCE_SIZE) {
    throw new Error(`Nonce must be ${AES_GCM_NONCE_SIZE} bytes, got ${actualNonce.length}`);
  }

  const cipher = gcm(key, actualNonce, associatedData);
  const ciphertext = cipher.encrypt(plaintext);

  return {
    ciphertext,
    nonce: actualNonce,
  };
}

/**
 * Decrypts data encrypted with AES-256-GCM.
 *
 * @param key - 32-byte encryption key
 * @param ciphertext - Encrypted data with appended auth tag
 * @param nonce - 12-byte nonce used during encryption
 * @param associatedData - Optional additional authenticated data
 * @returns Decrypted plaintext
 * @throws Error if authentication fails
 */
export function decryptAES256GCM(
  key: Uint8Array,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  associatedData?: Uint8Array
): Uint8Array {
  if (key.length !== SYMMETRIC_KEY_SIZE) {
    throw new Error(`Key must be ${SYMMETRIC_KEY_SIZE} bytes, got ${key.length}`);
  }
  if (nonce.length !== AES_GCM_NONCE_SIZE) {
    throw new Error(`Nonce must be ${AES_GCM_NONCE_SIZE} bytes, got ${nonce.length}`);
  }
  if (ciphertext.length < AUTH_TAG_SIZE) {
    throw new Error('Ciphertext too short - must include auth tag');
  }

  const cipher = gcm(key, nonce, associatedData);
  return cipher.decrypt(ciphertext);
}

/**
 * Profile-aware encryption function.
 *
 * Selects the appropriate algorithm based on the crypto profile:
 * - 'default': ChaCha20-Poly1305
 * - 'cnsa2': AES-256-GCM
 *
 * @param key - 32-byte encryption key
 * @param plaintext - Data to encrypt
 * @param profile - Crypto profile (default: 'default')
 * @param nonce - Optional 12-byte nonce
 * @param associatedData - Optional additional authenticated data
 * @returns Encrypted data with nonce
 */
export function encrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
  profile: CryptoProfile = 'default',
  nonce?: Uint8Array,
  associatedData?: Uint8Array
): AEADResult {
  if (profile === 'cnsa2') {
    return encryptAES256GCM(key, plaintext, nonce, associatedData);
  }
  return encryptChaCha20Poly1305(key, plaintext, nonce, associatedData);
}

/**
 * Profile-aware decryption function.
 *
 * @param key - 32-byte encryption key
 * @param ciphertext - Encrypted data
 * @param nonce - 12-byte nonce
 * @param profile - Crypto profile (default: 'default')
 * @param associatedData - Optional additional authenticated data
 * @returns Decrypted plaintext
 */
export function decrypt(
  key: Uint8Array,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  profile: CryptoProfile = 'default',
  associatedData?: Uint8Array
): Uint8Array {
  if (profile === 'cnsa2') {
    return decryptAES256GCM(key, ciphertext, nonce, associatedData);
  }
  return decryptChaCha20Poly1305(key, ciphertext, nonce, associatedData);
}
