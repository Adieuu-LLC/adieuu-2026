/**
 * Key Bundle Model
 *
 * Stores encrypted identity signing key bundles.
 * The signing key is encrypted client-side using Argon2id(passphrase) and
 * stored server-side. Only the identity owner can decrypt it.
 *
 * SECURITY NOTES:
 * - Bundle ID is derived from identity's ident hash to obfuscate ownership
 * - Server never sees plaintext signing key
 * - v1: encryptedBundle contains only the Ed25519 private signing key (32 bytes)
 * - v2: encryptedBundle contains a JSON payload with the signing key and
 *   optional shared web device ECDH+KEM private keys
 * - Salt and nonce are unique per bundle for cryptographic isolation
 *
 * @module models/key-bundle
 */

import type { BaseDocument } from './base';

/**
 * Encrypted key bundle document stored in MongoDB.
 *
 * The bundle ID is derived as: SHA3-256(ident || "adieuu-key-bundle-v1")
 * This obfuscates the relationship between bundles and identities.
 */
export interface KeyBundleDocument extends BaseDocument {
  /**
   * Derived bundle identifier.
   * SHA3-256(ident || "adieuu-key-bundle-v1") encoded as hex.
   * Used as a lookup key to avoid exposing identity-bundle relationships.
   */
  bundleId: string;

  /**
   * Encrypted key material (base64).
   * v1: ChaCha20-Poly1305(derived_key, Ed25519 private key)
   * v2: ChaCha20-Poly1305(derived_key, JSON { signingKey, webDevice? })
   */
  encryptedBundle: string;

  /**
   * Salt used for Argon2id key derivation.
   * 16 bytes, base64 encoded.
   */
  salt: string;

  /**
   * Nonce used for AES-GCM encryption.
   * 12 bytes, base64 encoded.
   */
  nonce: string;

  /**
   * Whether the bundle uses a separate passphrase from identity login.
   * If false, bundle key is derived from the identity passphrase.
   * If true, user must enter a second passphrase to decrypt the bundle.
   *
   * For MVP, this is always false. Separate passphrase support is post-MVP.
   */
  useSeparatePassphrase: boolean;

  /**
   * Version of the encryption scheme.
   * Allows for future migration of encryption parameters.
   */
  schemeVersion: number;
}

/**
 * Input for creating a new key bundle.
 */
export interface CreateKeyBundleInput {
  bundleId: string;
  encryptedBundle: string;
  salt: string;
  nonce: string;
  useSeparatePassphrase: boolean;
  schemeVersion?: number;
}

/**
 * Current encryption scheme version.
 * v1: Raw Ed25519 signing key
 * v2: JSON with signing key + optional shared web device keys
 */
export const CURRENT_KEY_BUNDLE_SCHEME_VERSION = 2;

/**
 * Domain separator for bundle ID derivation.
 * Ensures bundle IDs are distinct from other hash uses.
 */
export const KEY_BUNDLE_DOMAIN = 'adieuu-key-bundle-v1';
