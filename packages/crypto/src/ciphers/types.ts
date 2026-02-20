/**
 * Community Cipher Types for Spaces
 *
 * Defines the types for Community Ciphers (rolling ciphers) used in Spaces.
 * Unlike DMs and Groups that use per-user key exchange, Spaces use shared
 * symmetric keys derived from "entropy pieces" - known shared secrets.
 *
 * @module crypto/ciphers/types
 */

import type { CryptoProfile } from '../types';

/**
 * Types of entropy that can be used to derive a cipher.
 *
 * - `text`: A passphrase, phrase, or any text string
 * - `file`: SHA-256 hash of a file (logo, image, document)
 * - `url`: SHA-256 hash of a URL string
 * - `hardware`: WebAuthn PRF output (future support)
 */
export type EntropyType = 'text' | 'file' | 'url' | 'hardware';

/**
 * A single piece of entropy used in cipher derivation.
 *
 * Multiple entropy pieces are concatenated and used as input key material
 * for HKDF to derive the cipher key. Order matters - the same pieces in
 * different order produce different keys.
 */
export interface EntropyPiece {
  /** Type of entropy */
  type: EntropyType;
  /**
   * The entropy value:
   * - `text`: The actual text string
   * - `file`: Hex-encoded SHA-256 hash of the file
   * - `url`: Hex-encoded SHA-256 hash of the URL
   * - `hardware`: Base64-encoded PRF output
   */
  value: string;
  /** Optional human-readable label for UI display */
  label?: string;
}

/**
 * A derived community cipher.
 */
export interface CommunityCipher {
  /** Derived 32-byte symmetric key */
  key: Uint8Array;
  /**
   * Cipher ID for routing/identification.
   * SHA-512(HMAC-SHA256(key, "adieuu-cipher-id"))
   */
  cipherId: string;
  /** Crypto profile used for derivation */
  profile: CryptoProfile;
}

/**
 * Community cipher with metadata for storage.
 */
export interface CommunityCipherRecord {
  /** Local unique identifier */
  id: string;
  /** User-friendly name */
  name: string;
  /** Associated Space ID (if known) */
  spaceId?: string;
  /** Epoch identifier (for rotation tracking) */
  epochId?: string;
  /** Entropy pieces used to derive this cipher */
  entropyPieces: EntropyPiece[];
  /** The derived cipher */
  cipher: CommunityCipher;
  /** When this cipher was created locally */
  createdAt: Date;
  /** Last time this cipher was used */
  lastUsedAt: Date;
}

/**
 * Result of encrypting with a community cipher.
 */
export interface CipherEncryptedPayload {
  /** Encrypted content */
  ciphertext: Uint8Array;
  /** Nonce used for encryption */
  nonce: Uint8Array;
  /** Cipher ID used (for recipient to identify which cipher to use) */
  cipherId: string;
  /** Epoch ID (if applicable) */
  epochId?: string;
}

/**
 * Serialized format for cipher encrypted payload (for transport/storage).
 */
export interface SerializedCipherPayload {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded nonce */
  nonce: string;
  /** Cipher ID */
  cipherId: string;
  /** Epoch ID (if applicable) */
  epochId?: string;
}

/**
 * Multi-layer encryption result (for channels requiring multiple ciphers).
 *
 * Channels can require Space cipher + Channel cipher (double encryption)
 * or even Space + Moderator + Founder ciphers (triple encryption).
 */
export interface LayeredCipherPayload {
  /** Final ciphertext (after all encryption layers) */
  ciphertext: Uint8Array;
  /** Nonces for each layer (outer to inner) */
  nonces: Uint8Array[];
  /** Cipher IDs for each layer (outer to inner) */
  cipherIds: string[];
  /** Epoch IDs for each layer (outer to inner) */
  epochIds?: (string | undefined)[];
}

/**
 * Serialized format for layered cipher payload.
 */
export interface SerializedLayeredPayload {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded nonces */
  nonces: string[];
  /** Cipher IDs for each layer */
  cipherIds: string[];
  /** Epoch IDs for each layer */
  epochIds?: (string | undefined)[];
}

/**
 * Space epoch metadata.
 *
 * Spaces can rotate ciphers via epochs. Each epoch has its own entropy
 * and derived cipher. Old messages stay readable with old epoch ciphers;
 * new messages require the current epoch cipher.
 */
export interface CipherEpoch {
  /** Unique epoch identifier */
  epochId: string;
  /** Cipher ID for this epoch */
  cipherId: string;
  /** When this epoch started */
  startedAt: Date;
  /** When this epoch ended (null = current) */
  endedAt?: Date;
}
