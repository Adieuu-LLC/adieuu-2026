/**
 * Community Ciphers Module
 *
 * Implements Community Ciphers (rolling ciphers) for Spaces - large communities
 * where per-member key management is impractical. Instead of individual keys,
 * members share a symmetric cipher derived from "entropy pieces" - known secrets.
 *
 * ## Key Concepts
 *
 * 1. **Entropy Pieces**: Ordered inputs (phrases, file hashes, URLs) that members
 *    know or can verify. Anyone who knows the entropy can derive the cipher.
 *
 * 2. **Cipher ID**: A deterministic, non-reversible identifier derived from the
 *    cipher key. Used for routing without exposing the key.
 *
 * 3. **Epochs**: Ciphers can be rotated via epochs. Each epoch has new entropy.
 *    Old messages stay readable with old ciphers; new messages require new cipher.
 *
 * 4. **Layered Encryption**: Channels can require multiple ciphers (Space + Channel),
 *    providing hierarchical access control through cryptography.
 *
 * ## Scaling Properties
 *
 * | Aspect          | Sender Keys (Groups) | Community Ciphers (Spaces) |
 * |-----------------|---------------------|---------------------------|
 * | Members         | < 50                | 100 - 100,000+            |
 * | Key storage     | O(N) sender keys    | O(epochs) ciphers         |
 * | Join cost       | O(N) key distribution | O(1) entropy sharing    |
 * | Per-message     | O(1)                | O(1)                      |
 *
 * @example
 * ```typescript
 * import {
 *   deriveCommunityCipher,
 *   createTextEntropy,
 *   createFileEntropy,
 *   encryptWithCipher,
 *   decryptWithCipher,
 * } from '@adieuu/crypto';
 *
 * // Derive a space cipher from entropy
 * const cipher = deriveCommunityCipher([
 *   createTextEntropy('our secret founding phrase'),
 *   createFileEntropy(logoBytes, 'logo'),
 * ]);
 *
 * // Encrypt a message
 * const encrypted = encryptWithCipher(cipher, plaintext);
 *
 * // Decrypt (need same cipher)
 * const decrypted = decryptWithCipher(cipher, encrypted);
 *
 * // For hierarchical channels
 * const modCipher = deriveChannelCipher(spaceEntropy, modEntropy);
 * const encrypted = encryptLayered([spaceCipher, modCipher], plaintext);
 * ```
 *
 * @module crypto/ciphers
 */

// Types
export type {
  EntropyType,
  EntropyPiece,
  CommunityCipher,
  CommunityCipherRecord,
  CipherEncryptedPayload,
  SerializedCipherPayload,
  LayeredCipherPayload,
  SerializedLayeredPayload,
  CipherEpoch,
} from './types';

// Cipher derivation
export {
  deriveCommunityCipher,
  deriveChannelCipher,
  verifyCipherEntropy,
  entropyPieceToBytes,
  hashFileForEntropy,
  hashUrlForEntropy,
  createTextEntropy,
  createFileEntropy,
  createUrlEntropy,
  createHardwareEntropy,
  CIPHER_DERIVATION_VERSION,
} from './derive';

// Cipher identification
export {
  generateCipherId,
  isValidCipherId,
  cipherIdsEqual,
  shortCipherId,
  formatCipherId,
  CIPHER_ID_DOMAIN,
  CIPHER_KEY_SIZE,
  CIPHER_ID_LENGTH,
} from './identify';

// Encryption/decryption with ciphers
export {
  encryptWithCipher,
  decryptWithCipher,
  encryptLayered,
  decryptLayered,
  serializeCipherPayload,
  deserializeCipherPayload,
  serializeLayeredPayload,
  deserializeLayeredPayload,
  getRequiredCipherIds,
  canDecrypt,
  getLayerCount,
} from './compose';
