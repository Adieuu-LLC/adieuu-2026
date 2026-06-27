/**
 * Lazy migration: upload static device-key attestation (device-trust v3) when missing.
 */

import {
  fromBase64,
  signDeviceStaticKeyAttestation,
  toBase64,
} from '@adieuu/crypto';
import type { IdentityApi } from '@adieuu/shared';

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

  const profile = keysResp.data.preferredCryptoProfile ?? 'default';
  const ecdhPublicKey = fromBase64(device.ecdhPublicKey);
  const kemPublicKey =
    device.kemPublicKey != null && device.kemPublicKey.length > 0
      ? fromBase64(device.kemPublicKey)
      : new Uint8Array(0);

  const signature = signDeviceStaticKeyAttestation(input.signingPrivateKey, {
    profile,
    deviceId: input.deviceId,
    ecdhPublicKey,
    kemPublicKey,
  });

  const putResp = await input.identityApi.putDeviceStaticKeyAttestation(
    input.identityId,
    input.deviceId,
    { signature: toBase64(signature) },
  );

  if (!putResp.success) {
    console.warn('[DeviceStaticAttestation] upload failed:', putResp.error?.message);
  }
}
