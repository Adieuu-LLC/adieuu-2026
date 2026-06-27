/**
 * Key Derivation Functions
 *
 * @module crypto/kdf
 */

export {
  hkdfSha3_256,
  hkdfSha384,
  deriveKey,
  deriveWrappingKey,
  deriveCipherKey,
  deriveChunkKey,
  DEFAULT_KEY_LENGTH,
  KDF_INFO,
} from './hkdf';

export {
  deriveKeyFromPassword,
  deriveKey as deriveKeyArgon2,
  deriveKeyHighSecurity,
  generateArgon2Salt,
  verifyPassword,
  benchmarkArgon2,
  ARGON2_DEFAULTS,
  ARGON2_HIGH_SECURITY,
} from './argon2';
