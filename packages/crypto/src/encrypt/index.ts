/**
 * Encryption Module
 *
 * @module crypto/encrypt
 */

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
} from './symmetric';

// Hybrid encryption
export {
  hybridKeyExchange,
  hybridDecapsulate,
  wrapSessionKey,
  unwrapSessionKey,
  wrapSessionKeyForRecipients,
  findAndUnwrapSessionKey,
  computeRoutingTag,
  buildStaticWrapAad,
  SESSION_KEY_SIZE,
  WRAP_AAD_DOMAIN,
  WRAP_VERSION_AAD,
} from './hybrid';
