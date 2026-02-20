/**
 * @adieuu/crypto - End-to-End Encryption Primitives
 *
 * This package provides all cryptographic operations needed for
 * Adieuu's E2E encrypted messaging:
 *
 * - **Key Generation**: Ed25519, X25519, ML-KEM-768/1024
 * - **Symmetric Encryption**: ChaCha20-Poly1305, AES-256-GCM
 * - **Hybrid Encryption**: X25519 + ML-KEM key exchange
 * - **Digital Signatures**: Ed25519
 * - **Key Derivation**: HKDF-SHA3-256, HKDF-SHA384, Argon2id
 *
 * @example
 * ```typescript
 * import {
 *   generateIdentityKeyBundle,
 *   extractPublicKeys,
 *   wrapSessionKey,
 *   unwrapSessionKey,
 *   encrypt,
 *   decrypt,
 *   sign,
 *   verify,
 *   randomBytes,
 * } from '@adieuu/crypto';
 *
 * // Generate identity keys
 * const identity = generateIdentityKeyBundle();
 * const publicKeys = extractPublicKeys(identity);
 *
 * // Encrypt a message
 * const sessionKey = randomBytes(32);
 * const { ciphertext, nonce } = encrypt(sessionKey, message);
 * const wrappedKey = wrapSessionKey(sessionKey, recipientPublicKeys, recipientId);
 *
 * // Sign the message
 * const signature = sign(identity.signing.privateKey, ciphertext);
 * ```
 *
 * @module @adieuu/crypto
 */

// Types
export type {
  CryptoProfile,
  CryptoProfileConfig,
  SigningKeyPair,
  ECDHKeyPair,
  KEMKeyPair,
  IdentityKeyBundle,
  IdentityPublicKeys,
  KEMEncapsulation,
  HybridKeyExchange,
  WrappedKey,
  EncryptedPayload,
  SerializedEncryptedPayload,
  AEADResult,
  HKDFOptions,
  Argon2Options,
  // Group chat types
  SenderKey,
  SenderKeyRecord,
  WrappedSenderKey,
  SenderKeyMessage,
} from './types';

export { CRYPTO_PROFILES } from './types';

// Utilities
export {
  randomBytes,
  toBase64,
  fromBase64,
  toBase64Url,
  fromBase64Url,
  toHex,
  fromHex,
  toBytes,
  fromBytes,
  concatBytes,
  constantTimeEqual,
  clearBytes,
  copyBytes,
} from './utils';

// Key generation
export {
  generateSigningKeyPair,
  getSigningPublicKey,
  generateECDHKeyPair,
  getECDHPublicKey,
  generateKEMKeyPair,
  generateIdentityKeyBundle,
  extractPublicKeys,
  KEY_SIZES,
  validateKeyPairSizes,
} from './keys';

// Symmetric encryption
export {
  encryptChaCha20Poly1305,
  decryptChaCha20Poly1305,
  encryptAES256GCM,
  decryptAES256GCM,
  encrypt,
  decrypt,
  CHACHA_NONCE_SIZE,
  AES_GCM_NONCE_SIZE,
  SYMMETRIC_KEY_SIZE,
  AUTH_TAG_SIZE,
} from './encrypt';

// Hybrid encryption
export {
  hybridKeyExchange,
  hybridDecapsulate,
  wrapSessionKey,
  unwrapSessionKey,
  wrapSessionKeyForRecipients,
  findAndUnwrapSessionKey,
  SESSION_KEY_SIZE,
} from './encrypt';

// Digital signatures
export {
  sign,
  verify,
  signChunks,
  verifyChunks,
  signPrehashed,
  verifyPrehashed,
  ED25519_SIGNATURE_SIZE,
  ED25519_PUBLIC_KEY_SIZE,
  ED25519_PRIVATE_KEY_SIZE,
} from './sign';

// Key derivation (HKDF)
export {
  hkdfSha3_256,
  hkdfSha384,
  deriveKey,
  deriveWrappingKey,
  deriveCipherKey,
  deriveChunkKey,
  DEFAULT_KEY_LENGTH,
  KDF_INFO,
} from './kdf';

// Key derivation (Argon2)
export {
  deriveKeyFromPassword,
  deriveKeyArgon2,
  deriveKeyHighSecurity,
  generateArgon2Salt,
  verifyPassword,
  benchmarkArgon2,
  ARGON2_DEFAULTS,
  ARGON2_HIGH_SECURITY,
} from './kdf';

// Group chat (Sender Keys)
export {
  generateSenderKey,
  deriveMessageKey,
  advanceAndDeriveMessageKey,
  createSenderKey,
  isValidChainIndex,
  validateAndUpdateChainIndex,
  wrapSenderKeyForRecipient,
  wrapSenderKeyForRecipients,
  unwrapSenderKey,
  findAndUnwrapSenderKey,
  prepareKeysForNewMember,
  SENDER_KEY_SIZE,
  SENDER_KEY_MESSAGE_INFO,
  type MemberJoinKeyDistribution,
} from './groups';

// Community Ciphers (Spaces)
export {
  // Types
  type EntropyType,
  type EntropyPiece,
  type CommunityCipher,
  type CommunityCipherRecord,
  type CipherEncryptedPayload,
  type SerializedCipherPayload,
  type LayeredCipherPayload,
  type SerializedLayeredPayload,
  type CipherEpoch,
  // Cipher derivation
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
  // Cipher identification
  generateCipherId,
  isValidCipherId,
  cipherIdsEqual,
  shortCipherId,
  formatCipherId,
  CIPHER_ID_DOMAIN,
  CIPHER_KEY_SIZE,
  CIPHER_ID_LENGTH,
  // Encryption/decryption with ciphers
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
} from './ciphers';
