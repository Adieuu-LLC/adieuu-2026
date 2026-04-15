/**
 * Derives the same safety fingerprint display string as the member security modal
 * for a given identity public key bundle and device id.
 */

import {
  computeSafetyFingerprintDigestV2,
  formatSafetyFingerprintDisplay,
} from '@adieuu/crypto';
import type { IdentityPublicKeys } from '@adieuu/shared';

/**
 * Returns the formatted fingerprint line for `deviceId`, or null if the device
 * is missing, has no signed pre-key, or the SPK does not verify.
 */
export function getSafetyFingerprintDisplayForDevice(
  keys: IdentityPublicKeys,
  deviceId: string,
): string | null {
  const device = keys.devices.find((d) => d.deviceId === deviceId);
  if (device?.signedPreKey == null) return null;
  try {
    const digest = computeSafetyFingerprintDigestV2({
      profile: keys.preferredCryptoProfile,
      signingPublicKeyB64: keys.signingPublicKey,
      deviceId: device.deviceId,
      signedPreKey: {
        keyId: device.signedPreKey.keyId,
        ecdhPublicKey: device.signedPreKey.ecdhPublicKey,
        kemPublicKey: device.signedPreKey.kemPublicKey,
        signature: device.signedPreKey.signature,
      },
    });
    return formatSafetyFingerprintDisplay(digest);
  } catch {
    return null;
  }
}
