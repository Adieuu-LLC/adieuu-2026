/**
 * Device-trust fingerprint v3 and static device-key attestation (Ed25519).
 *
 * Attestation binds static ECDH/KEM device keys to the identity signing key.
 * Display digest is separate from the attestation signature (different domain tag).
 *
 * @module crypto/safety/device-trust-fingerprint
 */

import { sha3_256 } from '@noble/hashes/sha3';
import type { CryptoProfile } from '../types';
import { sign, verify } from '../sign/ed25519';
import { concatBytes, fromBase64, toBytes } from '../utils';

/** Domain tag for Ed25519 attestation preimage over static device keys. */
export const ADIEUU_DEVICE_STATIC_ATTESTATION_V1 = 'adieuu-device-static-v1';

/** Domain tag for v3 device-trust display digest preimage. */
export const ADIEUU_DEVICE_TRUST_FINGERPRINT_V3 = 'adieuu-device-trust-v3';

function le32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function catLen(data: Uint8Array): Uint8Array {
  return concatBytes(le32(data.length), data);
}

export interface DeviceStaticKeyAttestationMaterial {
  profile: CryptoProfile;
  deviceId: string;
  /** Raw X25519 public key bytes */
  ecdhPublicKey: Uint8Array;
  /** Raw ML-KEM public key bytes; use empty when device has no KEM key */
  kemPublicKey: Uint8Array;
}

/**
 * Canonical message bytes signed for static device key attestation.
 * Order: domain → profile → deviceId → ECDH → KEM.
 */
export function encodeDeviceStaticKeyAttestationPreimage(
  input: DeviceStaticKeyAttestationMaterial
): Uint8Array {
  const profileB = toBytes(input.profile);
  const deviceB = toBytes(input.deviceId);
  return concatBytes(
    catLen(toBytes(ADIEUU_DEVICE_STATIC_ATTESTATION_V1)),
    catLen(profileB),
    catLen(deviceB),
    catLen(input.ecdhPublicKey),
    catLen(input.kemPublicKey)
  );
}

export function signDeviceStaticKeyAttestation(
  signingPrivateKey: Uint8Array,
  input: DeviceStaticKeyAttestationMaterial
): Uint8Array {
  const preimage = encodeDeviceStaticKeyAttestationPreimage(input);
  return sign(signingPrivateKey, preimage);
}

export function verifyDeviceStaticKeyAttestation(
  signingPublicKey: Uint8Array,
  signature: Uint8Array,
  input: DeviceStaticKeyAttestationMaterial
): boolean {
  const preimage = encodeDeviceStaticKeyAttestationPreimage(input);
  return verify(signingPublicKey, preimage, signature);
}

/**
 * v3 display preimage: domain → profile → signing pubkey → deviceId → ECDH → KEM.
 * Key material must match attestation material byte-for-byte.
 */
export function encodeDeviceTrustFingerprintPreimageV3(input: {
  profile: CryptoProfile;
  signingPublicKey: Uint8Array;
  deviceId: string;
  ecdhPublicKey: Uint8Array;
  kemPublicKey: Uint8Array;
}): Uint8Array {
  const profileB = toBytes(input.profile);
  const deviceB = toBytes(input.deviceId);
  return concatBytes(
    catLen(toBytes(ADIEUU_DEVICE_TRUST_FINGERPRINT_V3)),
    catLen(profileB),
    catLen(input.signingPublicKey),
    catLen(deviceB),
    catLen(input.ecdhPublicKey),
    catLen(input.kemPublicKey)
  );
}

export interface DeviceTrustFingerprintV3FromApiInput {
  profile: CryptoProfile;
  signingPublicKeyB64: string;
  deviceId: string;
  ecdhPublicKeyB64: string;
  kemPublicKeyB64?: string;
  staticKeyAttestationB64: string;
}

/**
 * Verifies static-key attestation then returns SHA3-256 digest for display.
 * @throws If base64 decode fails or attestation does not verify.
 */
export function computeDeviceTrustFingerprintDigestV3(
  input: DeviceTrustFingerprintV3FromApiInput
): Uint8Array {
  const signingPub = fromBase64(input.signingPublicKeyB64);
  const ecdh = fromBase64(input.ecdhPublicKeyB64);
  const kem =
    input.kemPublicKeyB64 != null && input.kemPublicKeyB64.length > 0
      ? fromBase64(input.kemPublicKeyB64)
      : new Uint8Array(0);
  const signature = fromBase64(input.staticKeyAttestationB64);

  const attestationMaterial: DeviceStaticKeyAttestationMaterial = {
    profile: input.profile,
    deviceId: input.deviceId,
    ecdhPublicKey: ecdh,
    kemPublicKey: kem,
  };

  if (!verifyDeviceStaticKeyAttestation(signingPub, signature, attestationMaterial)) {
    throw new Error('Device trust fingerprint: static key attestation verification failed');
  }

  const preimage = encodeDeviceTrustFingerprintPreimageV3({
    profile: input.profile,
    signingPublicKey: signingPub,
    deviceId: input.deviceId,
    ecdhPublicKey: ecdh,
    kemPublicKey: kem,
  });
  return sha3_256(preimage);
}
