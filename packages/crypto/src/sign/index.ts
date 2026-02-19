/**
 * Digital Signatures
 *
 * @module crypto/sign
 */

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
} from './ed25519';
