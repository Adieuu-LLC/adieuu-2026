/**
 * Per-device safety fingerprint (Stage A transparency).
 *
 * v2 uses a length-prefixed preimage (little-endian uint32 per field) so
 * identity signing keys and signatures can be classical-only, PQC-only, or
 * future hybrid lengths without parser ambiguity.
 *
 * @module crypto/safety/fingerprint
 */

import { sha3_256 } from '@noble/hashes/sha3';
import type { CryptoProfile } from '../types';
import { verifySignedPreKey, type SignedPreKeyPublic } from '../prekeys';
import { concatBytes, fromBase64, toBytes } from '../utils';

/** UTF-8 domain tag for v2 digests (length-prefixed in the preimage). */
export const ADIEUU_SAFETY_FINGERPRINT_V2 = 'adieuu-safety-f2';

function le32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

/** Length-prefixed chunk: `le32(len) || bytes`. */
function catLen(data: Uint8Array): Uint8Array {
  return concatBytes(le32(data.length), data);
}

/**
 * Canonical preimage for SHA3-256: TLV-style fields, PQC-safe variable lengths.
 *
 * Order: magic tag → profile → identity signing pubkey → device id → SPK key id
 * → SPK ECDH pubkey → SPK ML-KEM pubkey → SPK signature.
 */
export function encodeSafetyFingerprintPreimageV2(input: {
  profile: CryptoProfile;
  /** Raw identity long-term signing public key (e.g. Ed25519 32 B; ML-DSA-* when used). */
  signingPublicKey: Uint8Array;
  deviceId: string;
  signedPreKey: SignedPreKeyPublic;
}): Uint8Array {
  const profileB = toBytes(input.profile);
  const deviceB = toBytes(input.deviceId);
  const keyIdB = toBytes(input.signedPreKey.keyId);
  return concatBytes(
    catLen(toBytes(ADIEUU_SAFETY_FINGERPRINT_V2)),
    catLen(profileB),
    catLen(input.signingPublicKey),
    catLen(deviceB),
    catLen(keyIdB),
    catLen(input.signedPreKey.ecdhPublicKey),
    catLen(input.signedPreKey.kemPublicKey),
    catLen(input.signedPreKey.signature)
  );
}

export interface SafetyFingerprintFromApiInput {
  profile: CryptoProfile;
  /**
   * Base64 identity signing public key. Length depends on profile
   * (e.g. Ed25519 32-byte raw; ML-DSA-87 when CNSA identity signing is active).
   */
  signingPublicKeyB64: string;
  deviceId: string;
  signedPreKey: {
    keyId: string;
    ecdhPublicKey: string;
    kemPublicKey: string;
    signature: string;
  };
}

/**
 * Computes the 32-byte safety fingerprint digest (v2 preimage).
 * Throws if the signed pre-key does not verify under the identity signing key.
 */
export function computeSafetyFingerprintDigestV2(
  input: SafetyFingerprintFromApiInput
): Uint8Array {
  const signingPub = fromBase64(input.signingPublicKeyB64);
  const spk: SignedPreKeyPublic = {
    keyId: input.signedPreKey.keyId,
    ecdhPublicKey: fromBase64(input.signedPreKey.ecdhPublicKey),
    kemPublicKey: fromBase64(input.signedPreKey.kemPublicKey),
    signature: fromBase64(input.signedPreKey.signature),
  };
  if (!verifySignedPreKey(spk, signingPub)) {
    throw new Error('Safety fingerprint: signed pre-key verification failed');
  }
  const preimage = encodeSafetyFingerprintPreimageV2({
    profile: input.profile,
    signingPublicKey: signingPub,
    deviceId: input.deviceId,
    signedPreKey: spk,
  });
  return sha3_256(preimage);
}

/**
 * Formats digest as 8 groups of 4 hex characters for display (16 bytes shown).
 */
export function formatSafetyFingerprintDisplay(digest: Uint8Array): string {
  const n = Math.min(16, digest.length);
  const hex = Array.from(digest.slice(0, n))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const groups: string[] = [];
  for (let i = 0; i < hex.length; i += 4) {
    groups.push(hex.slice(i, i + 4));
  }
  return groups.join(' ');
}
