/**
 * Device-trust v3 fingerprint display (static keys + Ed25519 attestation).
 */

import {
  computeDeviceTrustFingerprintDigestV3,
  formatSafetyFingerprintDisplay,
} from '@adieuu/crypto';
import type { IdentityPublicKeys } from '@adieuu/shared';

/**
 * Returns the formatted fingerprint line for `deviceId`, or null if static keys or
 * attestation are missing, or verification fails.
 */
export function getSafetyFingerprintDisplayForDevice(
  keys: IdentityPublicKeys,
  deviceId: string,
): string | null {
  const device = keys.devices.find((d) => d.deviceId === deviceId);
  if (!device?.ecdhPublicKey || !device.staticKeyAttestation) {
    return null;
  }
  try {
    const digest = computeDeviceTrustFingerprintDigestV3({
      profile: keys.preferredCryptoProfile ?? 'default',
      signingPublicKeyB64: keys.signingPublicKey,
      deviceId: device.deviceId,
      ecdhPublicKeyB64: device.ecdhPublicKey,
      kemPublicKeyB64: device.kemPublicKey,
      staticKeyAttestationB64: device.staticKeyAttestation,
    });
    return formatSafetyFingerprintDisplay(digest);
  } catch {
    return null;
  }
}
