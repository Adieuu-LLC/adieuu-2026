/**
 * Key Generation Module
 *
 * Generates cryptographic key pairs for:
 * - Ed25519: Digital signatures
 * - X25519: Elliptic-curve Diffie-Hellman key agreement
 * - ML-KEM-768/1024: Post-quantum key encapsulation
 *
 * @module crypto/keys/generate
 */

import { ed25519 } from '@noble/curves/ed25519';
import { x25519 } from '@noble/curves/ed25519';
import { ml_kem768, ml_kem1024 } from '@noble/post-quantum/ml-kem';
import { randomBytes } from '../utils';
import type {
  SigningKeyPair,
  ECDHKeyPair,
  KEMKeyPair,
  IdentityKeyBundle,
  IdentityPublicKeys,
  CryptoProfile,
} from '../types';

/**
 * Generates an Ed25519 signing key pair.
 *
 * Ed25519 is a high-speed, high-security signature scheme using
 * elliptic curves. Produces 64-byte signatures.
 *
 * Key sizes:
 * - Private key: 32 bytes
 * - Public key: 32 bytes
 * - Signature: 64 bytes
 *
 * @returns Ed25519 key pair
 *
 * @example
 * ```typescript
 * const signingKeys = generateSigningKeyPair();
 * const signature = sign(signingKeys.privateKey, message);
 * const valid = verify(signingKeys.publicKey, message, signature);
 * ```
 */
export function generateSigningKeyPair(): SigningKeyPair {
  const privateKey = randomBytes(32);
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
  };
}

/**
 * Derives Ed25519 public key from private key.
 *
 * @param privateKey - 32-byte private key
 * @returns 32-byte public key
 */
export function getSigningPublicKey(privateKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(privateKey);
}

/**
 * Generates an X25519 ECDH key pair.
 *
 * X25519 is a high-speed elliptic-curve Diffie-Hellman function
 * for secure key agreement between two parties.
 *
 * Key sizes:
 * - Private key: 32 bytes
 * - Public key: 32 bytes
 * - Shared secret: 32 bytes
 *
 * @returns X25519 key pair
 *
 * @example
 * ```typescript
 * // Alice and Bob each generate key pairs
 * const alice = generateECDHKeyPair();
 * const bob = generateECDHKeyPair();
 *
 * // They can derive the same shared secret
 * const aliceShared = x25519.scalarMult(alice.privateKey, bob.publicKey);
 * const bobShared = x25519.scalarMult(bob.privateKey, alice.publicKey);
 * // aliceShared === bobShared
 * ```
 */
export function generateECDHKeyPair(): ECDHKeyPair {
  const privateKey = randomBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
  };
}

/**
 * Derives X25519 public key from private key.
 *
 * @param privateKey - 32-byte private key
 * @returns 32-byte public key
 */
export function getECDHPublicKey(privateKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(privateKey);
}

/**
 * Generates an ML-KEM (Kyber) key pair for post-quantum security.
 *
 * ML-KEM (Module-Lattice Key Encapsulation Mechanism) is NIST's
 * standardized post-quantum KEM, based on the Kyber algorithm.
 *
 * Security levels:
 * - ML-KEM-768: ~192-bit security (default profile)
 * - ML-KEM-1024: ~256-bit security (CNSA 2.0 profile)
 *
 * Key sizes (ML-KEM-768):
 * - Private key: 2400 bytes
 * - Public key: 1184 bytes
 * - Ciphertext: 1088 bytes
 * - Shared secret: 32 bytes
 *
 * Key sizes (ML-KEM-1024):
 * - Private key: 3168 bytes
 * - Public key: 1568 bytes
 * - Ciphertext: 1568 bytes
 * - Shared secret: 32 bytes
 *
 * @param profile - Crypto profile ('default' for ML-KEM-768, 'cnsa2' for ML-KEM-1024)
 * @returns ML-KEM key pair
 *
 * @example
 * ```typescript
 * const kemKeys = generateKEMKeyPair();
 * const { sharedSecret, ciphertext } = mlkem768.encapsulate(kemKeys.publicKey);
 * const decrypted = mlkem768.decapsulate(ciphertext, kemKeys.privateKey);
 * // sharedSecret === decrypted
 * ```
 */
export function generateKEMKeyPair(profile: CryptoProfile = 'default'): KEMKeyPair {
  const kem = profile === 'cnsa2' ? ml_kem1024 : ml_kem768;
  const keyPair = kem.keygen();
  return {
    privateKey: keyPair.secretKey,
    publicKey: keyPair.publicKey,
  };
}

/**
 * Generates a complete identity key bundle.
 *
 * Creates all key pairs needed for an identity:
 * - Signing key (Ed25519) for message authentication
 * - ECDH key (X25519) for classical key agreement
 * - KEM key (ML-KEM) for post-quantum key encapsulation
 *
 * @param profile - Crypto profile to use (default: 'default')
 * @returns Complete identity key bundle
 *
 * @example
 * ```typescript
 * const identity = generateIdentityKeyBundle();
 *
 * // Sign a message
 * const signature = sign(identity.signing.privateKey, message);
 *
 * // Hybrid encryption uses both ecdh and kem keys
 * const encrypted = hybridEncrypt(message, recipientPublicKeys);
 * ```
 */
export function generateIdentityKeyBundle(
  profile: CryptoProfile = 'default'
): IdentityKeyBundle {
  return {
    signing: generateSigningKeyPair(),
    ecdh: generateECDHKeyPair(),
    kem: generateKEMKeyPair(profile),
    profile,
  };
}

/**
 * Extracts public keys from an identity key bundle.
 *
 * Use this to get the shareable public keys from a full key bundle.
 *
 * @param bundle - Full identity key bundle
 * @returns Public keys only (safe to share)
 *
 * @example
 * ```typescript
 * const identity = generateIdentityKeyBundle();
 * const publicKeys = extractPublicKeys(identity);
 *
 * // Share publicKeys with other identities
 * // Keep identity (with private keys) secret
 * ```
 */
export function extractPublicKeys(bundle: IdentityKeyBundle): IdentityPublicKeys {
  return {
    signing: bundle.signing.publicKey,
    ecdh: bundle.ecdh.publicKey,
    kem: bundle.kem.publicKey,
    profile: bundle.profile,
  };
}

/**
 * Expected key sizes for validation.
 */
export const KEY_SIZES = {
  ed25519: {
    privateKey: 32,
    publicKey: 32,
    signature: 64,
  },
  x25519: {
    privateKey: 32,
    publicKey: 32,
    sharedSecret: 32,
  },
  'ML-KEM-768': {
    privateKey: 2400,
    publicKey: 1184,
    ciphertext: 1088,
    sharedSecret: 32,
  },
  'ML-KEM-1024': {
    privateKey: 3168,
    publicKey: 1568,
    ciphertext: 1568,
    sharedSecret: 32,
  },
} as const;

/**
 * Validates that a key pair has the correct sizes.
 *
 * @param keyPair - Key pair to validate
 * @param type - Type of key ('ed25519', 'x25519', 'ML-KEM-768', 'ML-KEM-1024')
 * @returns true if valid, false otherwise
 */
export function validateKeyPairSizes(
  keyPair: { privateKey: Uint8Array; publicKey: Uint8Array },
  type: keyof typeof KEY_SIZES
): boolean {
  const sizes = KEY_SIZES[type];
  return (
    keyPair.privateKey.length === sizes.privateKey &&
    keyPair.publicKey.length === sizes.publicKey
  );
}
