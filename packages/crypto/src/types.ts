/**
 * Cryptographic Types for Adieuu E2E Encryption
 *
 * These types define the interfaces for all cryptographic operations
 * used in end-to-end encrypted messaging.
 *
 * @module crypto/types
 */

/**
 * Crypto profile determines which algorithm suite to use.
 * - 'default': X25519 + ML-KEM-768 + Ed25519 + ChaCha20-Poly1305 + HKDF-SHA3-256
 * - 'cnsa2': X25519 + ML-KEM-1024 + ML-DSA-87 + AES-256-GCM + HKDF-SHA-384 (NSA CNSA 2.0)
 */
export type CryptoProfile = 'default' | 'cnsa2';

/**
 * Configuration for a crypto profile's algorithm choices.
 */
export interface CryptoProfileConfig {
  kem: 'ML-KEM-768' | 'ML-KEM-1024';
  signature: 'Ed25519' | 'ML-DSA-87';
  symmetric: 'ChaCha20-Poly1305' | 'AES-256-GCM';
  kdf: 'HKDF-SHA3-256' | 'HKDF-SHA-384';
}

/**
 * Profile configurations mapping.
 */
export const CRYPTO_PROFILES: Record<CryptoProfile, CryptoProfileConfig> = {
  default: {
    kem: 'ML-KEM-768',
    signature: 'Ed25519',
    symmetric: 'ChaCha20-Poly1305',
    kdf: 'HKDF-SHA3-256',
  },
  cnsa2: {
    kem: 'ML-KEM-1024',
    signature: 'ML-DSA-87',
    symmetric: 'AES-256-GCM',
    kdf: 'HKDF-SHA-384',
  },
};

/**
 * Ed25519 key pair for signing operations.
 */
export interface SigningKeyPair {
  /** 32-byte private key */
  privateKey: Uint8Array;
  /** 32-byte public key */
  publicKey: Uint8Array;
}

/**
 * X25519 key pair for ECDH key agreement.
 */
export interface ECDHKeyPair {
  /** 32-byte private key */
  privateKey: Uint8Array;
  /** 32-byte public key */
  publicKey: Uint8Array;
}

/**
 * ML-KEM (Kyber) key pair for post-quantum key encapsulation.
 */
export interface KEMKeyPair {
  /** Private key (size varies by security level) */
  privateKey: Uint8Array;
  /** Public key (size varies by security level) */
  publicKey: Uint8Array;
}

/**
 * Complete identity key bundle containing all key pairs.
 */
export interface IdentityKeyBundle {
  /** Ed25519 signing key pair */
  signing: SigningKeyPair;
  /** X25519 ECDH key pair */
  ecdh: ECDHKeyPair;
  /** ML-KEM key pair for post-quantum security */
  kem: KEMKeyPair;
  /** Which crypto profile this bundle uses */
  profile: CryptoProfile;
}

/**
 * Public keys only (for sharing with others).
 */
export interface IdentityPublicKeys {
  /** Ed25519 public key (32 bytes) */
  signing: Uint8Array;
  /** X25519 public key (32 bytes) */
  ecdh: Uint8Array;
  /** ML-KEM public key */
  kem: Uint8Array;
  /** Which crypto profile these keys use */
  profile: CryptoProfile;
}

/**
 * Result of ML-KEM encapsulation.
 */
export interface KEMEncapsulation {
  /** Shared secret (32 bytes) */
  sharedSecret: Uint8Array;
  /** Ciphertext to send to recipient */
  ciphertext: Uint8Array;
}

/**
 * Result of hybrid key exchange (X25519 + ML-KEM).
 */
export interface HybridKeyExchange {
  /** Combined shared secret from both algorithms */
  sharedSecret: Uint8Array;
  /** Ephemeral X25519 public key */
  ephemeralPublicKey: Uint8Array;
  /** ML-KEM ciphertext */
  kemCiphertext: Uint8Array;
}

/**
 * Wrapped session key for a recipient.
 */
export interface WrappedKey {
  /** Identity ID this key is wrapped for */
  identityId: string;
  /** Ephemeral X25519 public key used for wrapping */
  ephemeralPublicKey: Uint8Array;
  /** ML-KEM ciphertext */
  kemCiphertext: Uint8Array;
  /** AES-GCM wrapped session key */
  wrappedSessionKey: Uint8Array;
  /** Nonce used for AES-GCM wrapping */
  wrappingNonce: Uint8Array;
}

/**
 * Encrypted message payload.
 */
export interface EncryptedPayload {
  /** ChaCha20-Poly1305 encrypted content */
  ciphertext: Uint8Array;
  /** 12-byte nonce */
  nonce: Uint8Array;
  /** Ed25519 signature over (ciphertext || nonce || wrappedKeys) */
  signature: Uint8Array;
  /** Wrapped session keys for each recipient */
  wrappedKeys: WrappedKey[];
}

/**
 * Serialized format for encrypted message (for transport/storage).
 */
export interface SerializedEncryptedPayload {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded nonce */
  nonce: string;
  /** Base64-encoded signature */
  signature: string;
  /** Wrapped keys with base64-encoded binary fields */
  wrappedKeys: Array<{
    identityId: string;
    ephemeralPublicKey: string;
    kemCiphertext: string;
    wrappedSessionKey: string;
    wrappingNonce: string;
  }>;
}

/**
 * AEAD encryption result.
 */
export interface AEADResult {
  /** Encrypted data with authentication tag */
  ciphertext: Uint8Array;
  /** Nonce used for encryption */
  nonce: Uint8Array;
}

/**
 * Key derivation options for HKDF.
 */
export interface HKDFOptions {
  /** Input key material */
  ikm: Uint8Array;
  /** Optional salt (defaults to zeros) */
  salt?: Uint8Array;
  /** Context info string */
  info: string;
  /** Output key length in bytes (default: 32) */
  length?: number;
}

/**
 * Key derivation options for Argon2id (password-based).
 */
export interface Argon2Options {
  /** Password to derive key from */
  password: string;
  /** Random salt (16+ bytes recommended) */
  salt: Uint8Array;
  /** Memory cost in KiB (default: 65536 = 64MB) */
  memoryCost?: number;
  /** Time cost / iterations (default: 3) */
  timeCost?: number;
  /** Parallelism (default: 4) */
  parallelism?: number;
  /** Output key length in bytes (default: 32) */
  outputLength?: number;
}

// ============================================================================
// Group Chat / Sender Key Types
// ============================================================================

/**
 * Sender key for group messaging.
 *
 * Each group member has their own sender key that they use to encrypt
 * messages to the group. Other members hold copies of this key to decrypt.
 */
export interface SenderKey {
  /** The symmetric key material (32 bytes) */
  key: Uint8Array;
  /** Current chain index (increments with each message sent) */
  chainIndex: number;
}

/**
 * Sender key with metadata for storage/distribution.
 */
export interface SenderKeyRecord {
  /** Group ID this sender key belongs to */
  groupId: string;
  /** Identity ID of the key owner (who sends with this key) */
  ownerIdentityId: string;
  /** The sender key material */
  senderKey: SenderKey;
  /** When this sender key was created */
  createdAt: Date;
}

/**
 * Wrapped sender key for distribution to a group member.
 *
 * When a member joins a group or when sender keys are rotated,
 * each member's sender key is encrypted for each recipient.
 */
export interface WrappedSenderKey {
  /** Group ID */
  groupId: string;
  /** Identity ID of the sender key owner */
  ownerIdentityId: string;
  /** Identity ID of the recipient (who can decrypt this) */
  recipientIdentityId: string;
  /** Ephemeral X25519 public key used for wrapping */
  ephemeralPublicKey: Uint8Array;
  /** ML-KEM ciphertext */
  kemCiphertext: Uint8Array;
  /** Encrypted sender key (AES-GCM wrapped) */
  wrappedSenderKey: Uint8Array;
  /** Nonce used for AES-GCM wrapping */
  wrappingNonce: Uint8Array;
  /** Initial chain index (usually 0 for new keys) */
  initialChainIndex: number;
}

/**
 * Group message encrypted with sender key.
 */
export interface SenderKeyMessage {
  /** Group ID */
  groupId: string;
  /** Identity ID of the sender */
  fromIdentityId: string;
  /** Chain index used to derive the message key */
  chainIndex: number;
  /** Encrypted message content */
  ciphertext: Uint8Array;
  /** Nonce for decryption */
  nonce: Uint8Array;
  /** Ed25519 signature over ciphertext */
  signature: Uint8Array;
}
