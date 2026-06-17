/**
 * Call E2EE Key Derivation Module
 *
 * Derives per-call symmetric encryption keys for live audio/video/screenshare
 * calls. Keys are injected into the LiveKit E2EE layer.
 *
 * Uses LiveKit's Insertable Streams E2EE with Adieuu-managed keys.
 * A future iteration will introduce a custom Insertable Streams pipeline
 * using Adieuu's own cipher suite (ChaCha20-Poly1305 / AES-256-GCM per
 * crypto profile).
 *
 * @module crypto/call
 */

import { deriveKey, KDF_INFO } from '../kdf';
import { randomBytes, toBytes } from '../utils';
import { hybridKeyExchange, hybridDecapsulate } from '../encrypt/hybrid';
import { encrypt, decrypt } from '../encrypt/symmetric';
import type { CryptoProfile, IdentityPublicKeys } from '../types';

/** HKDF info string for call E2EE key derivation. */
export const CALL_E2EE_INFO = 'adieuu-call-e2ee-v1';

/** Call E2EE key size (256 bits). */
export const CALL_KEY_SIZE = 32;

/**
 * A call E2EE key wrapped for a single recipient.
 */
export interface WrappedCallKey {
  /** Identity ID this key is wrapped for */
  recipientIdentityId: string;
  /** Ephemeral X25519 public key used for wrapping */
  ephemeralPublicKey: Uint8Array;
  /** ML-KEM ciphertext */
  kemCiphertext: Uint8Array;
  /** Encrypted call key (AEAD-wrapped) */
  wrappedKey: Uint8Array;
  /** Nonce used for AEAD wrapping */
  wrappingNonce: Uint8Array;
}

/**
 * Generates a fresh random call E2EE key.
 *
 * Used when a call is initiated. The key is then distributed to
 * participants via {@link wrapCallKeyForRecipient}.
 *
 * @returns 32-byte random key
 */
export function generateCallKey(): Uint8Array {
  return randomBytes(CALL_KEY_SIZE);
}

/**
 * Derives a call E2EE key from existing conversation key material.
 *
 * Binds the derived key to a specific call via the callId salt, preventing
 * key reuse across calls even within the same conversation.
 *
 * @param conversationKeyMaterial - Sender key material or conversation secret
 * @param callId - Unique call identifier (used as HKDF salt)
 * @param profile - Crypto profile
 * @returns 32-byte derived call E2EE key
 */
export function deriveCallE2EEKey(
  conversationKeyMaterial: Uint8Array,
  callId: string,
  profile: CryptoProfile = 'default'
): Uint8Array {
  if (conversationKeyMaterial.length < 16) {
    throw new Error('Conversation key material must be at least 16 bytes');
  }

  return deriveKey(
    {
      ikm: conversationKeyMaterial,
      salt: toBytes(callId),
      info: CALL_E2EE_INFO,
      length: CALL_KEY_SIZE,
    },
    profile
  );
}

/**
 * Wraps a call E2EE key for a single recipient using hybrid encryption.
 *
 * @param callKey - The call E2EE key to distribute
 * @param recipientKeys - Recipient's public keys (ECDH + KEM)
 * @param recipientIdentityId - Recipient's identity ID
 * @returns Wrapped call key for the recipient
 */
export function wrapCallKeyForRecipient(
  callKey: Uint8Array,
  recipientKeys: IdentityPublicKeys,
  recipientIdentityId: string
): WrappedCallKey {
  if (callKey.length !== CALL_KEY_SIZE) {
    throw new Error(`Call key must be ${CALL_KEY_SIZE} bytes`);
  }

  const { sharedSecret, ephemeralPublicKey, kemCiphertext } = hybridKeyExchange(
    recipientKeys.ecdh,
    recipientKeys.kem,
    recipientKeys.profile
  );

  const { ciphertext: wrappedKey, nonce: wrappingNonce } = encrypt(
    sharedSecret,
    callKey,
    recipientKeys.profile
  );

  return {
    recipientIdentityId,
    ephemeralPublicKey,
    kemCiphertext,
    wrappedKey,
    wrappingNonce,
  };
}

/**
 * Wraps a call E2EE key for multiple recipients.
 *
 * @param callKey - The call E2EE key to distribute
 * @param recipients - Array of recipient public keys with identity IDs
 * @returns Array of wrapped call keys, one per recipient
 */
export function wrapCallKeyForRecipients(
  callKey: Uint8Array,
  recipients: Array<{ identityId: string; publicKeys: IdentityPublicKeys }>
): WrappedCallKey[] {
  return recipients.map(({ identityId, publicKeys }) =>
    wrapCallKeyForRecipient(callKey, publicKeys, identityId)
  );
}

/**
 * Unwraps a call E2EE key received from the call initiator.
 *
 * @param wrapped - Wrapped call key
 * @param ecdhPrivate - Recipient's X25519 private key
 * @param kemPrivate - Recipient's ML-KEM private key
 * @param profile - Crypto profile
 * @returns Unwrapped call E2EE key (32 bytes)
 */
export function unwrapCallKey(
  wrapped: WrappedCallKey,
  ecdhPrivate: Uint8Array,
  kemPrivate: Uint8Array,
  profile: CryptoProfile = 'default'
): Uint8Array {
  const sharedSecret = hybridDecapsulate(
    ecdhPrivate,
    kemPrivate,
    wrapped.ephemeralPublicKey,
    wrapped.kemCiphertext,
    profile
  );

  return decrypt(sharedSecret, wrapped.wrappedKey, wrapped.wrappingNonce, profile);
}

/**
 * Finds and unwraps the call key addressed to a specific recipient.
 *
 * @param wrappedKeys - Array of wrapped call keys
 * @param recipientIdentityId - Identity ID of the recipient
 * @param ecdhPrivate - Recipient's X25519 private key
 * @param kemPrivate - Recipient's ML-KEM private key
 * @param profile - Crypto profile
 * @returns Unwrapped call key, or null if no key was addressed to this recipient
 */
export function findAndUnwrapCallKey(
  wrappedKeys: WrappedCallKey[],
  recipientIdentityId: string,
  ecdhPrivate: Uint8Array,
  kemPrivate: Uint8Array,
  profile: CryptoProfile = 'default'
): Uint8Array | null {
  const candidates = wrappedKeys.filter((wk) => wk.recipientIdentityId === recipientIdentityId);
  if (candidates.length === 0) {
    return null;
  }

  let lastError: unknown;
  for (const wrapped of candidates) {
    try {
      return unwrapCallKey(wrapped, ecdhPrivate, kemPrivate, profile);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to unwrap call key');
}
