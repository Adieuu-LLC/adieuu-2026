/**
 * Hybrid Encryption Module
 *
 * Implements hybrid key exchange combining classical (X25519) and
 * post-quantum (ML-KEM) algorithms. The combined shared secret is
 * secure if EITHER algorithm remains unbroken.
 *
 * Flow:
 * 1. Generate ephemeral X25519 key pair
 * 2. Perform X25519 ECDH with recipient's public key
 * 3. Encapsulate with recipient's ML-KEM public key
 * 4. Combine both shared secrets via HKDF
 * 5. Use derived key to wrap the session key
 *
 * @module crypto/encrypt/hybrid
 */

import { x25519 } from '@noble/curves/ed25519';
import { ml_kem768, ml_kem1024 } from '@noble/post-quantum/ml-kem';
import { sha256 } from '@noble/hashes/sha2';
import { randomBytes, toBase64, fromBase64, concatBytes, toBytes, clearBytes } from '../utils';
import { deriveWrappingKey } from '../kdf';
import { encrypt as symmetricEncrypt, decrypt as symmetricDecrypt } from './symmetric';
import type {
  CryptoProfile,
  IdentityPublicKeys,
  HybridKeyExchange,
  WrappedKey,
} from '../types';

/**
 * Session key size (256 bits).
 */
export const SESSION_KEY_SIZE = 32;

/**
 * Domain separator for v2 wrap associated data.
 */
export const WRAP_AAD_DOMAIN = 'adieuu-wrap-aad-v2';

/**
 * Current wrap format version. Version 2 binds wrap metadata as AEAD
 * associated data so it cannot be swapped or tampered independently of
 * the wrapped session key.
 */
export const WRAP_VERSION_AAD = 2;

/**
 * Builds the associated data for a v2 static (hybrid) session key wrap.
 *
 * Binds the recipient identity, ephemeral public key, and KEM ciphertext
 * into the AEAD tag. The string header fields are newline-joined (none may
 * contain a newline: hex IDs only) and the ephemeral key is fixed-length
 * (32 bytes), so the encoding is unambiguous.
 */
export function buildStaticWrapAad(
  identityId: string,
  ephemeralPublicKey: Uint8Array,
  kemCiphertext: Uint8Array
): Uint8Array {
  return concatBytes(
    toBytes([WRAP_AAD_DOMAIN, 'static', identityId].join('\n') + '\n'),
    ephemeralPublicKey,
    kemCiphertext
  );
}

/**
 * Performs hybrid key exchange with a recipient's public keys.
 *
 * Combines X25519 ECDH and ML-KEM encapsulation to derive a shared
 * secret that is secure against both classical and quantum attacks.
 *
 * @param recipientEcdhPublic - Recipient's X25519 public key (32 bytes)
 * @param recipientKemPublic - Recipient's ML-KEM public key
 * @param profile - Crypto profile ('default' or 'cnsa2')
 * @returns Hybrid key exchange result
 *
 * @example
 * ```typescript
 * const exchange = hybridKeyExchange(
 *   recipientKeys.ecdh,
 *   recipientKeys.kem
 * );
 *
 * // exchange.sharedSecret is the combined secret
 * // exchange.ephemeralPublicKey and exchange.kemCiphertext are sent to recipient
 * ```
 */
export function hybridKeyExchange(
  recipientEcdhPublic: Uint8Array,
  recipientKemPublic: Uint8Array,
  profile: CryptoProfile = 'default'
): HybridKeyExchange {
  // Generate ephemeral X25519 key pair
  const ephemeralPrivate = randomBytes(32);
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralPrivate);

  // X25519 ECDH
  const ecdhShared = x25519.getSharedSecret(ephemeralPrivate, recipientEcdhPublic);

  // ML-KEM encapsulation
  const kem = profile === 'cnsa2' ? ml_kem1024 : ml_kem768;
  const { sharedSecret: kemShared, cipherText: kemCiphertext } = kem.encapsulate(
    recipientKemPublic
  );

  // Derive combined shared secret
  const sharedSecret = deriveWrappingKey(ecdhShared, kemShared, undefined, profile);

  // Zeroize the ephemeral private key and intermediate secrets: only the
  // derived shared secret leaves this function.
  clearBytes(ephemeralPrivate);
  clearBytes(ecdhShared);
  clearBytes(kemShared);

  return {
    sharedSecret,
    ephemeralPublicKey,
    kemCiphertext,
  };
}

/**
 * Decapsulates a hybrid key exchange on the recipient side.
 *
 * Reverses the key exchange process to derive the same shared secret
 * that the sender computed.
 *
 * @param ecdhPrivate - Recipient's X25519 private key
 * @param kemPrivate - Recipient's ML-KEM private key
 * @param ephemeralPublicKey - Sender's ephemeral X25519 public key
 * @param kemCiphertext - ML-KEM ciphertext from sender
 * @param profile - Crypto profile
 * @returns Combined shared secret
 *
 * @example
 * ```typescript
 * const sharedSecret = hybridDecapsulate(
 *   myKeys.ecdh.privateKey,
 *   myKeys.kem.privateKey,
 *   receivedEphemeralPublic,
 *   receivedKemCiphertext
 * );
 * ```
 */
export function hybridDecapsulate(
  ecdhPrivate: Uint8Array,
  kemPrivate: Uint8Array,
  ephemeralPublicKey: Uint8Array,
  kemCiphertext: Uint8Array,
  profile: CryptoProfile = 'default'
): Uint8Array {
  // X25519 ECDH
  const ecdhShared = x25519.getSharedSecret(ecdhPrivate, ephemeralPublicKey);

  // ML-KEM decapsulation
  const kem = profile === 'cnsa2' ? ml_kem1024 : ml_kem768;
  const kemShared = kem.decapsulate(kemCiphertext, kemPrivate);

  // Derive combined shared secret
  const sharedSecret = deriveWrappingKey(ecdhShared, kemShared, undefined, profile);

  // Zeroize intermediate secrets.
  clearBytes(ecdhShared);
  clearBytes(kemShared);

  return sharedSecret;
}

/**
 * Wraps a session key for a recipient using hybrid encryption.
 *
 * This is the core operation for E2E message encryption - the message
 * is encrypted with a random session key, and the session key is
 * wrapped (encrypted) separately for each recipient.
 *
 * @param sessionKey - Random session key to wrap (32 bytes)
 * @param recipientKeys - Recipient's public keys
 * @param identityId - Recipient's identity ID
 * @returns Wrapped key structure
 *
 * @example
 * ```typescript
 * const sessionKey = randomBytes(32);
 * const ciphertext = encrypt(sessionKey, message);
 *
 * // Wrap for each recipient
 * const wrappedKeys = recipients.map(recipient =>
 *   wrapSessionKey(sessionKey, recipient.publicKeys, recipient.identityId)
 * );
 * ```
 */
export function wrapSessionKey(
  sessionKey: Uint8Array,
  recipientKeys: IdentityPublicKeys,
  identityId: string
): WrappedKey {
  if (sessionKey.length !== SESSION_KEY_SIZE) {
    throw new Error(`Session key must be ${SESSION_KEY_SIZE} bytes`);
  }

  // Perform hybrid key exchange
  const { sharedSecret, ephemeralPublicKey, kemCiphertext } = hybridKeyExchange(
    recipientKeys.ecdh,
    recipientKeys.kem,
    recipientKeys.profile
  );

  // Encrypt session key with derived wrapping key, binding the wrap
  // metadata as associated data (v2).
  const { ciphertext: wrappedSessionKey, nonce: wrappingNonce } = symmetricEncrypt(
    sharedSecret,
    sessionKey,
    recipientKeys.profile,
    undefined,
    buildStaticWrapAad(identityId, ephemeralPublicKey, kemCiphertext)
  );

  clearBytes(sharedSecret);

  return {
    identityId,
    ephemeralPublicKey,
    kemCiphertext,
    wrappedSessionKey,
    wrappingNonce,
    wrapVersion: WRAP_VERSION_AAD,
  };
}

/**
 * Unwraps a session key using the recipient's private keys.
 *
 * @param wrappedKey - Wrapped key structure from sender
 * @param ecdhPrivate - Recipient's X25519 private key
 * @param kemPrivate - Recipient's ML-KEM private key
 * @param profile - Crypto profile
 * @returns Unwrapped session key (32 bytes)
 *
 * @example
 * ```typescript
 * // Find wrapped key for our identity
 * const ourWrappedKey = message.wrappedKeys.find(
 *   wk => wk.identityId === ourIdentityId
 * );
 *
 * const sessionKey = unwrapSessionKey(
 *   ourWrappedKey,
 *   ourKeys.ecdh.privateKey,
 *   ourKeys.kem.privateKey
 * );
 *
 * const plaintext = decrypt(sessionKey, message.ciphertext, message.nonce);
 * ```
 */
export function unwrapSessionKey(
  wrappedKey: WrappedKey,
  ecdhPrivate: Uint8Array,
  kemPrivate: Uint8Array,
  profile: CryptoProfile = 'default'
): Uint8Array {
  // Decapsulate to get shared secret
  const sharedSecret = hybridDecapsulate(
    ecdhPrivate,
    kemPrivate,
    wrappedKey.ephemeralPublicKey,
    wrappedKey.kemCiphertext,
    profile
  );

  // v2 wraps authenticate the wrap metadata as associated data; legacy
  // wraps (no version) used no associated data.
  const aad =
    wrappedKey.wrapVersion === WRAP_VERSION_AAD
      ? buildStaticWrapAad(
          wrappedKey.identityId,
          wrappedKey.ephemeralPublicKey,
          wrappedKey.kemCiphertext
        )
      : undefined;

  // Decrypt session key
  try {
    return symmetricDecrypt(
      sharedSecret,
      wrappedKey.wrappedSessionKey,
      wrappedKey.wrappingNonce,
      profile,
      aad
    );
  } finally {
    clearBytes(sharedSecret);
  }
}

/**
 * Wraps a session key for multiple recipients.
 *
 * @param sessionKey - Session key to wrap
 * @param recipients - Array of recipient public keys with identity IDs
 * @returns Array of wrapped keys, one per recipient
 *
 * @example
 * ```typescript
 * const sessionKey = randomBytes(32);
 * const recipients = [
 *   { identityId: 'alice', publicKeys: alicePublicKeys },
 *   { identityId: 'bob', publicKeys: bobPublicKeys },
 * ];
 *
 * const wrappedKeys = wrapSessionKeyForRecipients(sessionKey, recipients);
 * ```
 */
export function wrapSessionKeyForRecipients(
  sessionKey: Uint8Array,
  recipients: Array<{ identityId: string; publicKeys: IdentityPublicKeys }>
): WrappedKey[] {
  return recipients.map(({ identityId, publicKeys }) =>
    wrapSessionKey(sessionKey, publicKeys, identityId)
  );
}

/**
 * Finds and unwraps the session key for a given identity.
 *
 * Searches through wrapped keys to find the one for the specified
 * identity, then unwraps it.
 *
 * @param wrappedKeys - Array of wrapped keys from message
 * @param identityId - Identity ID to find
 * @param ecdhPrivate - Identity's X25519 private key
 * @param kemPrivate - Identity's ML-KEM private key
 * @param profile - Crypto profile
 * @returns Unwrapped session key, or null if not found
 *
 * @example
 * ```typescript
 * const sessionKey = findAndUnwrapSessionKey(
 *   message.wrappedKeys,
 *   myIdentityId,
 *   myKeys.ecdh.privateKey,
 *   myKeys.kem.privateKey
 * );
 *
 * if (sessionKey === null) {
 *   throw new Error('Message not encrypted for this identity');
 * }
 * ```
 */
export function findAndUnwrapSessionKey(
  wrappedKeys: WrappedKey[],
  identityId: string,
  ecdhPrivate: Uint8Array,
  kemPrivate: Uint8Array,
  profile: CryptoProfile = 'default'
): Uint8Array | null {
  const wrappedKey = wrappedKeys.find((wk) => wk.identityId === identityId);
  if (!wrappedKey) {
    return null;
  }

  return unwrapSessionKey(wrappedKey, ecdhPrivate, kemPrivate, profile);
}

// ============================================================================
// Routing Tag
// ============================================================================

const ROUTING_TAG_DOMAIN = 'adieuu-routing-v1';
const ROUTING_TAG_BYTES = 6;

/**
 * Computes a key-fingerprint routing tag for a device's public keys.
 *
 * The tag is a truncated SHA-256 of (domain || ecdhPublicKey || kemPublicKey),
 * returned as base64. Both sender and recipient can compute it independently:
 * the sender from the server-provided public keys, the recipient from their
 * own key material.
 *
 * Privacy: opaque to anyone without the public keys. Naturally rotates when
 * device keys change.
 *
 * @param ecdhPublicKey - Device X25519 public key (raw bytes or base64)
 * @param kemPublicKey - Device ML-KEM public key (raw bytes or base64)
 * @returns Base64-encoded routing tag (8 characters for 6 bytes)
 */
export function computeRoutingTag(
  ecdhPublicKey: Uint8Array | string,
  kemPublicKey: Uint8Array | string
): string {
  const ecdh = typeof ecdhPublicKey === 'string'
    ? fromBase64(ecdhPublicKey)
    : ecdhPublicKey;
  const kem = typeof kemPublicKey === 'string'
    ? fromBase64(kemPublicKey)
    : kemPublicKey;

  const hash = sha256(concatBytes(toBytes(ROUTING_TAG_DOMAIN), ecdh, kem));
  return toBase64(hash.slice(0, ROUTING_TAG_BYTES));
}
