/**
 * Community Cipher Derivation Module
 *
 * Derives symmetric cipher keys from "entropy pieces" - shared secrets
 * that Space members know. This enables O(1) scaling for large communities.
 *
 * ## Entropy Pieces
 *
 * Entropy pieces are ordered inputs that are combined to derive a cipher:
 * - Text phrases ("the founding phrase of our community")
 * - File hashes (SHA-256 of logo image)
 * - URL hashes (SHA-256 of invite link)
 * - Hardware tokens (WebAuthn PRF, future)
 *
 * ## Derivation Process
 *
 * ```
 * entropy[0] || entropy[1] || ... || entropy[n]
 *           │
 *           ▼
 * HKDF-SHA3-256(
 *   ikm: concatenated_entropy,
 *   salt: "adieuu-cipher-v1",
 *   info: "adieuu-space-cipher-v1"
 * )
 *           │
 *           ▼
 * 256-bit symmetric key
 * ```
 *
 * @module crypto/ciphers/derive
 */

import { sha256 } from '@noble/hashes/sha2';
import { deriveCipherKey as hkdfDeriveCipherKey, KDF_INFO } from '../kdf';
import { toBytes, fromHex, fromBase64, concatBytes } from '../utils';
import type { CryptoProfile } from '../types';
import type { EntropyPiece, CommunityCipher } from './types';
import { generateCipherId } from './identify';

/**
 * Version prefix for cipher derivation salt.
 * Increment this when changing derivation logic to prevent key reuse.
 */
export const CIPHER_DERIVATION_VERSION = 'adieuu-cipher-v1';

/**
 * Converts an entropy piece to its byte representation.
 *
 * @param piece - The entropy piece to convert
 * @returns Byte array representing the entropy
 * @throws Error if entropy type is unknown or value is invalid
 */
export function entropyPieceToBytes(piece: EntropyPiece): Uint8Array {
  switch (piece.type) {
    case 'text':
      // Text is converted directly to UTF-8 bytes
      return toBytes(piece.value);

    case 'file':
      // File entropy is a hex-encoded SHA-256 hash
      if (piece.value.length !== 64) {
        throw new Error('File entropy must be a 64-character hex-encoded SHA-256 hash');
      }
      return fromHex(piece.value);

    case 'url':
      // URL entropy is a hex-encoded SHA-256 hash
      if (piece.value.length !== 64) {
        throw new Error('URL entropy must be a 64-character hex-encoded SHA-256 hash');
      }
      return fromHex(piece.value);

    case 'hardware':
      // Hardware entropy is base64-encoded PRF output
      return fromBase64(piece.value);

    default:
      throw new Error(`Unknown entropy type: ${(piece as EntropyPiece).type}`);
  }
}

/**
 * Hashes a file's contents for use as entropy.
 *
 * @param fileBytes - Raw file contents
 * @returns SHA-256 hash of the file (32 bytes)
 *
 * @example
 * ```typescript
 * const logoBytes = await readFile('logo.png');
 * const logoHash = hashFileForEntropy(logoBytes);
 *
 * const entropy: EntropyPiece = {
 *   type: 'file',
 *   value: toHex(logoHash),
 *   label: 'Community logo',
 * };
 * ```
 */
export function hashFileForEntropy(fileBytes: Uint8Array): Uint8Array {
  return sha256(fileBytes);
}

/**
 * Hashes a URL for use as entropy.
 *
 * @param url - URL string
 * @returns SHA-256 hash of the URL (32 bytes)
 *
 * @example
 * ```typescript
 * const urlHash = hashUrlForEntropy('https://example.com/invite/abc123');
 *
 * const entropy: EntropyPiece = {
 *   type: 'url',
 *   value: toHex(urlHash),
 *   label: 'Invite link',
 * };
 * ```
 */
export function hashUrlForEntropy(url: string): Uint8Array {
  return sha256(toBytes(url));
}

/**
 * Creates a text entropy piece.
 *
 * @param text - The text/phrase to use as entropy
 * @param label - Optional human-readable label
 * @returns EntropyPiece ready for cipher derivation
 */
export function createTextEntropy(text: string, label?: string): EntropyPiece {
  if (text.length === 0) {
    throw new Error('Text entropy cannot be empty');
  }
  return { type: 'text', value: text, label };
}

/**
 * Creates a file entropy piece from file contents.
 *
 * @param fileBytes - Raw file contents
 * @param label - Optional human-readable label
 * @returns EntropyPiece ready for cipher derivation
 */
export function createFileEntropy(fileBytes: Uint8Array, label?: string): EntropyPiece {
  const hash = hashFileForEntropy(fileBytes);
  return { type: 'file', value: toHexLocal(hash), label };
}

/**
 * Creates a URL entropy piece.
 *
 * @param url - URL string
 * @param label - Optional human-readable label
 * @returns EntropyPiece ready for cipher derivation
 */
export function createUrlEntropy(url: string, label?: string): EntropyPiece {
  if (url.length === 0) {
    throw new Error('URL entropy cannot be empty');
  }
  const hash = hashUrlForEntropy(url);
  return { type: 'url', value: toHexLocal(hash), label };
}

/**
 * Creates a hardware entropy piece from WebAuthn PRF output.
 *
 * @param prfOutput - PRF output from WebAuthn
 * @param label - Optional human-readable label
 * @returns EntropyPiece ready for cipher derivation
 */
export function createHardwareEntropy(prfOutput: Uint8Array, label?: string): EntropyPiece {
  if (prfOutput.length < 16) {
    throw new Error('Hardware entropy must be at least 16 bytes');
  }
  return { type: 'hardware', value: toBase64Local(prfOutput), label };
}

/**
 * Derives a community cipher from entropy pieces.
 *
 * This is the core function for creating Space ciphers. The entropy pieces
 * are concatenated in order and used as input to HKDF to derive a 256-bit
 * symmetric key.
 *
 * @param entropyPieces - Ordered array of entropy pieces (order matters!)
 * @param profile - Crypto profile (default: 'default')
 * @returns Community cipher with key and cipher ID
 * @throws Error if no entropy pieces provided
 *
 * @example
 * ```typescript
 * const cipher = deriveCommunityCipher([
 *   createTextEntropy('the secret phrase'),
 *   createFileEntropy(logoBytes, 'logo'),
 *   createUrlEntropy('https://example.com/invite'),
 * ]);
 *
 * // Use cipher.key for encryption
 * // Use cipher.cipherId for routing/identification
 * ```
 */
export function deriveCommunityCipher(
  entropyPieces: EntropyPiece[],
  profile: CryptoProfile = 'default'
): CommunityCipher {
  if (entropyPieces.length === 0) {
    throw new Error('At least one entropy piece is required');
  }

  // Convert all entropy pieces to bytes
  const entropyBytes = entropyPieces.map((piece) => entropyPieceToBytes(piece));

  // Concatenate all entropy
  const combinedEntropy = concatBytes(...entropyBytes);

  // Derive the cipher key using HKDF
  const key = hkdfDeriveCipherKey([combinedEntropy], profile);

  // Generate the cipher ID for routing
  const cipherId = generateCipherId(key);

  return {
    key,
    cipherId,
    profile,
  };
}

/**
 * Derives a channel cipher from base entropy pieces plus additional channel-specific entropy.
 *
 * Channels can require additional ciphers beyond the Space cipher. This function
 * derives a channel-specific cipher using the Space entropy plus channel-specific entropy.
 *
 * @param spaceEntropy - Base Space entropy pieces
 * @param channelEntropy - Additional channel-specific entropy pieces
 * @param profile - Crypto profile
 * @returns Community cipher for the channel
 *
 * @example
 * ```typescript
 * // Space cipher (all members have this)
 * const spaceCipher = deriveCommunityCipher(spaceEntropy);
 *
 * // Moderator channel cipher (only mods have this)
 * const modChannelCipher = deriveChannelCipher(
 *   spaceEntropy,
 *   [createTextEntropy('moderator-secret')],
 * );
 *
 * // Messages to #moderators are double-encrypted with both
 * ```
 */
export function deriveChannelCipher(
  spaceEntropy: EntropyPiece[],
  channelEntropy: EntropyPiece[],
  profile: CryptoProfile = 'default'
): CommunityCipher {
  if (spaceEntropy.length === 0) {
    throw new Error('Space entropy is required');
  }
  if (channelEntropy.length === 0) {
    throw new Error('Channel entropy is required');
  }

  // Combine space and channel entropy
  const combinedEntropy = [...spaceEntropy, ...channelEntropy];

  return deriveCommunityCipher(combinedEntropy, profile);
}

/**
 * Verifies that entropy pieces produce an expected cipher ID.
 *
 * Used when joining a Space to verify the user has entered/scanned
 * the correct entropy.
 *
 * @param entropyPieces - Entropy pieces to verify
 * @param expectedCipherId - Expected cipher ID
 * @param profile - Crypto profile
 * @returns True if entropy derives to expected cipher ID
 */
export function verifyCipherEntropy(
  entropyPieces: EntropyPiece[],
  expectedCipherId: string,
  profile: CryptoProfile = 'default'
): boolean {
  try {
    const cipher = deriveCommunityCipher(entropyPieces, profile);
    return cipher.cipherId === expectedCipherId;
  } catch {
    return false;
  }
}

// ============================================================================
// Local helpers (avoid circular imports)
// ============================================================================

function toHexLocal(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toBase64Local(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  return btoa(String.fromCharCode(...bytes));
}
