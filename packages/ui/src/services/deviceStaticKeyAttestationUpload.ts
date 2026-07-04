/**
 * Lazy migration: upload static device-key attestation (device-trust v3) when missing.
 */

import {
  fromBase64,
  signDeviceStaticKeyAttestation,
  toBase64,
  type CryptoProfile,
} from '@adieuu/crypto';
import type { IdentityApi } from '@adieuu/shared';

/**
 * Signs a static device-key attestation over base64-encoded public keys and
 * returns the base64 signature. Used at device registration time so the
 * server can require proof that the device keys were endorsed by the
 * identity signing key.
 */
export function buildDeviceStaticKeyAttestationB64(input: {
  signingPrivateKey: Uint8Array;
  profile?: CryptoProfile;
  deviceId: string;
  ecdhPublicKey: string;
  kemPublicKey?: string;
}): string {
  const ecdhPublicKey = fromBase64(input.ecdhPublicKey);
  const kemPublicKey =
    input.kemPublicKey != null && input.kemPublicKey.length > 0
      ? fromBase64(input.kemPublicKey)
      : new Uint8Array(0);

  const signature = signDeviceStaticKeyAttestation(input.signingPrivateKey, {
    profile: input.profile ?? 'default',
    deviceId: input.deviceId,
    ecdhPublicKey,
    kemPublicKey,
  });
  return toBase64(signature);
}

/**
 * If GET /keys shows the current device has no `staticKeyAttestation`, sign and upload.
 * Uses public keys from the server response so the preimage matches stored device material.
 */
export async function ensureDeviceStaticKeyAttestationUploaded(input: {
  identityId: string;
  deviceId: string;
  signingPrivateKey: Uint8Array;
  identityApi: IdentityApi;
}): Promise<void> {
  const keysResp = await input.identityApi.getPublicKeys(input.identityId);
  if (!keysResp.success || !keysResp.data) {
    return;
  }

  const device = keysResp.data.devices.find((d) => d.deviceId === input.deviceId);
  if (!device?.ecdhPublicKey) {
    return;
  }
  if (device.staticKeyAttestation) {
    return;
  }

  const signature = buildDeviceStaticKeyAttestationB64({
    signingPrivateKey: input.signingPrivateKey,
    profile: keysResp.data.preferredCryptoProfile ?? 'default',
    deviceId: input.deviceId,
    ecdhPublicKey: device.ecdhPublicKey,
    kemPublicKey: device.kemPublicKey,
  });

  const putResp = await input.identityApi.putDeviceStaticKeyAttestation(
    input.identityId,
    input.deviceId,
    { signature },
  );

  if (!putResp.success) {
    console.warn('[DeviceStaticAttestation] upload failed:', putResp.error?.message);
  }
}
