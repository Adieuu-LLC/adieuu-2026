/**
 * Call E2EE Crypto Service
 *
 * Provides client-side key generation, wrapping, unwrapping, and
 * serialization for call E2E encryption. Bridges the @adieuu/crypto
 * call module with the LiveKit E2EE layer.
 *
 * SECURITY ARCHITECTURE:
 * - Call initiator generates a fresh 32-byte symmetric call key
 * - Key is wrapped per-participant using hybrid X25519 + ML-KEM
 * - Wrapped keys travel through the API as opaque base64 blobs
 * - Server never sees the plaintext call key
 * - Key is injected into LiveKit's ExternalE2EEKeyProvider
 * - Key is zeroed from memory on call end/leave
 *
 * @module services/callCryptoService
 */

import {
  generateCallKey,
  wrapCallKeyForRecipients,
  findAndUnwrapCallKey,
  toBase64,
  fromBase64,
  clearBytes,
  type WrappedCallKey,
  type IdentityPublicKeys,
  type CryptoProfile,
} from '@adieuu/crypto';
import type { SerializedWrappedCallKey } from '@adieuu/shared';

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a fresh random 32-byte call E2EE key.
 * Called by the call initiator before sending the initiate request.
 */
export function generateCallE2EEKey(): Uint8Array {
  return generateCallKey();
}

// ============================================================================
// Key Wrapping (Initiator)
// ============================================================================

export interface CallKeyRecipient {
  identityId: string;
  ecdhPublicKey: string;
  kemPublicKey: string;
  signingPublicKey: string;
  preferredCryptoProfile: CryptoProfile;
}

/**
 * Wrap a call E2EE key for all recipients and serialize for API transport.
 *
 * @param callKey - The 32-byte call key to distribute
 * @param recipients - Participant public keys (from fetchRecipientKeys-like flow)
 * @returns Serialized wrapped keys ready for the API request body
 */
export function wrapAndSerializeCallKey(
  callKey: Uint8Array,
  recipients: CallKeyRecipient[]
): SerializedWrappedCallKey[] {
  const cryptoRecipients = recipients.map((r) => ({
    identityId: r.identityId,
    publicKeys: {
      signing: fromBase64(r.signingPublicKey),
      ecdh: fromBase64(r.ecdhPublicKey),
      kem: fromBase64(r.kemPublicKey),
      profile: r.preferredCryptoProfile,
    } satisfies IdentityPublicKeys,
  }));

  const wrappedKeys = wrapCallKeyForRecipients(callKey, cryptoRecipients);

  return serializeWrappedCallKeys(wrappedKeys);
}

// ============================================================================
// Key Unwrapping (Joiner)
// ============================================================================

/**
 * Deserialize wrapped call keys from the API and unwrap the one addressed
 * to the current user.
 *
 * @param serializedKeys - Wrapped keys from the API response
 * @param myIdentityId - Current user's identity ID
 * @param ecdhPrivateKey - Current device's X25519 private key
 * @param kemPrivateKey - Current device's ML-KEM private key
 * @param profile - Crypto profile to use for decapsulation
 * @returns The unwrapped 32-byte call key, or null if no key for this identity
 */
export function deserializeAndUnwrapCallKey(
  serializedKeys: SerializedWrappedCallKey[],
  myIdentityId: string,
  ecdhPrivateKey: Uint8Array,
  kemPrivateKey: Uint8Array,
  profile: CryptoProfile = 'default'
): Uint8Array | null {
  const wrappedKeys = deserializeWrappedCallKeys(serializedKeys);

  return findAndUnwrapCallKey(
    wrappedKeys,
    myIdentityId,
    ecdhPrivateKey,
    kemPrivateKey,
    profile
  );
}

// ============================================================================
// Serialization (Uint8Array <-> base64 for API transport)
// ============================================================================

/**
 * Serialize WrappedCallKey[] to base64-encoded objects for API transport.
 */
export function serializeWrappedCallKeys(
  keys: WrappedCallKey[]
): SerializedWrappedCallKey[] {
  return keys.map((k) => ({
    recipientIdentityId: k.recipientIdentityId,
    ephemeralPublicKey: toBase64(k.ephemeralPublicKey),
    kemCiphertext: toBase64(k.kemCiphertext),
    wrappedKey: toBase64(k.wrappedKey),
    wrappingNonce: toBase64(k.wrappingNonce),
  }));
}

/**
 * Deserialize base64-encoded wrapped call keys from the API back to
 * WrappedCallKey objects with Uint8Array fields.
 */
export function deserializeWrappedCallKeys(
  serialized: SerializedWrappedCallKey[]
): WrappedCallKey[] {
  return serialized.map((s) => ({
    recipientIdentityId: s.recipientIdentityId,
    ephemeralPublicKey: fromBase64(s.ephemeralPublicKey),
    kemCiphertext: fromBase64(s.kemCiphertext),
    wrappedKey: fromBase64(s.wrappedKey),
    wrappingNonce: fromBase64(s.wrappingNonce),
  }));
}

// ============================================================================
// Key Cleanup
// ============================================================================

/**
 * Securely zero a call E2EE key from memory.
 * Must be called when leaving or ending a call.
 */
export function zeroCallKey(key: Uint8Array | null): void {
  if (key) {
    clearBytes(key);
  }
}

export { clearBytes };

// ============================================================================
// Browser E2EE Support Detection
// ============================================================================

/**
 * Check whether the current browser supports LiveKit E2EE
 * (requires Insertable Streams / RTCRtpScriptTransform).
 */
export function isE2EESupported(): boolean {
  if (typeof window === 'undefined') return false;

  // RTCRtpScriptTransform is the modern API (Chrome 110+, Firefox 117+)
  if ('RTCRtpScriptTransform' in window) return true;

  // Insertable Streams (legacy path, Chrome 86+)
  if (typeof RTCRtpSender !== 'undefined') {
    if ('createEncodedStreams' in RTCRtpSender.prototype) return true;
  }

  return false;
}
