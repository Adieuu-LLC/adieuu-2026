/**
 * Verifies Ed25519 static device-key attestations against identity signing keys.
 */

import { fromBase64, verifyDeviceStaticKeyAttestation } from '@adieuu/crypto';
import type { IdentityDevice, IdentityDocument } from '../models/identity';

export function verifyDeviceStoredStaticKeyAttestation(
  identity: IdentityDocument,
  device: IdentityDevice,
  signatureB64: string
): boolean {
  if (!identity.signingPublicKey) {
    return false;
  }
  let signingPub: Uint8Array;
  let ecdh: Uint8Array;
  let kem: Uint8Array;
  let signature: Uint8Array;
  try {
    signingPub = fromBase64(identity.signingPublicKey);
    ecdh = fromBase64(device.ecdhPublicKey);
    kem =
      device.kemPublicKey != null && device.kemPublicKey.length > 0
        ? fromBase64(device.kemPublicKey)
        : new Uint8Array(0);
    signature = fromBase64(signatureB64);
  } catch {
    return false;
  }

  return verifyDeviceStaticKeyAttestation(signingPub, signature, {
    profile: identity.preferredCryptoProfile ?? 'default',
    deviceId: device.deviceId,
    ecdhPublicKey: ecdh,
    kemPublicKey: kem,
  });
}
