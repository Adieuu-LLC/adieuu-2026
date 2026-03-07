/**
 * Pre-Key Service
 *
 * Handles generation, local storage, and server upload of pre-keys (SPK + OTPK)
 * for forward secrecy. Called during device setup and SPK rotation.
 *
 * @module services/preKeyService
 */

import {
  generateSignedPreKey,
  generateOneTimePreKeys,
  toBase64,
  type CryptoProfile,
} from '@adieuu/crypto';
import type { IdentityApi, UploadPreKeysParams } from '@adieuu/shared';

import {
  storeSignedPreKey,
  storeOneTimePreKeys,
  getActiveSignedPreKey,
  retireSignedPreKey,
} from './preKeyStorage';

// ============================================================================
// Configuration
// ============================================================================

export type Platform = 'desktop' | 'web' | 'mobile';

const PLATFORM_OTPK_BATCH_SIZE: Record<Platform, number> = {
  desktop: 50,
  web: 10,
  mobile: 50,
};

// ============================================================================
// Types
// ============================================================================

export interface GeneratePreKeysInput {
  identityId: string;
  deviceId: string;
  signingPrivateKey: Uint8Array;
  wrappingKey: Uint8Array;
  platform: Platform;
  cryptoProfile?: CryptoProfile;
}

export interface GeneratePreKeysResult {
  signedPreKeyId: string;
  oneTimePreKeyCount: number;
}

// ============================================================================
// Pre-Key Generation and Upload
// ============================================================================

/**
 * Generates a full pre-key bundle (SPK + OTPKs), stores private keys locally,
 * and uploads public keys to the server.
 *
 * Called during:
 * - Device registration (identity creation or new device login)
 * - SPK rotation (only generates new SPK, optionally replenishes OTPKs)
 */
export async function generateAndUploadPreKeys(
  input: GeneratePreKeysInput,
  identityApi: IdentityApi
): Promise<GeneratePreKeysResult> {
  const profile = input.cryptoProfile ?? 'default';
  const otpkCount = PLATFORM_OTPK_BATCH_SIZE[input.platform];

  const spk = generateSignedPreKey(input.signingPrivateKey, profile);

  const otpks = generateOneTimePreKeys(otpkCount, profile);

  await storeSignedPreKey(
    spk.keyId,
    input.identityId,
    input.deviceId,
    spk.ecdh.privateKey,
    spk.kem.privateKey,
    input.wrappingKey
  );

  await storeOneTimePreKeys(
    otpks.map((otpk) => ({
      keyId: otpk.keyId,
      ecdhPrivateKey: otpk.ecdh.privateKey,
      kemPrivateKey: otpk.kem.privateKey,
    })),
    input.identityId,
    input.deviceId,
    input.wrappingKey
  );

  const uploadParams: UploadPreKeysParams = {
    signedPreKey: {
      keyId: spk.keyId,
      ecdhPublicKey: toBase64(spk.ecdh.publicKey),
      kemPublicKey: toBase64(spk.kem.publicKey),
      signature: toBase64(spk.signature),
    },
    oneTimePreKeys: otpks.map((otpk) => ({
      keyId: otpk.keyId,
      ecdhPublicKey: toBase64(otpk.ecdh.publicKey),
      kemPublicKey: toBase64(otpk.kem.publicKey),
    })),
  };

  const response = await identityApi.uploadPreKeys(
    input.identityId,
    input.deviceId,
    uploadParams
  );

  if (!response.success) {
    console.error('[PreKey] Failed to upload pre-keys:', response.error);
    throw new Error(`Pre-key upload failed: ${response.error?.message ?? 'Unknown error'}`);
  }

  console.debug(
    `[PreKey] Uploaded SPK ${spk.keyId} and ${otpkCount} OTPKs for device ${input.deviceId}`
  );

  return {
    signedPreKeyId: spk.keyId,
    oneTimePreKeyCount: otpkCount,
  };
}

/**
 * Rotates the signed pre-key: retires the current active SPK, generates a new one,
 * and uploads it to the server. Optionally replenishes OTPKs.
 *
 * The old SPK private key is retained locally for pending message decryption
 * (see preKeyStorage.retireSignedPreKey).
 */
export async function rotateSignedPreKey(
  input: Omit<GeneratePreKeysInput, 'platform'>,
  identityApi: IdentityApi
): Promise<string> {
  const profile = input.cryptoProfile ?? 'default';

  const currentSpk = await getActiveSignedPreKey(input.identityId, input.deviceId);
  if (currentSpk) {
    await retireSignedPreKey(currentSpk.keyId, input.identityId);
    console.debug(`[PreKey] Retired SPK ${currentSpk.keyId}`);
  }

  const spk = generateSignedPreKey(input.signingPrivateKey, profile);

  await storeSignedPreKey(
    spk.keyId,
    input.identityId,
    input.deviceId,
    spk.ecdh.privateKey,
    spk.kem.privateKey,
    input.wrappingKey
  );

  const uploadParams: UploadPreKeysParams = {
    signedPreKey: {
      keyId: spk.keyId,
      ecdhPublicKey: toBase64(spk.ecdh.publicKey),
      kemPublicKey: toBase64(spk.kem.publicKey),
      signature: toBase64(spk.signature),
    },
  };

  const response = await identityApi.uploadPreKeys(
    input.identityId,
    input.deviceId,
    uploadParams
  );

  if (!response.success) {
    console.error('[PreKey] Failed to upload rotated SPK:', response.error);
    throw new Error(`SPK rotation upload failed: ${response.error?.message ?? 'Unknown error'}`);
  }

  console.debug(`[PreKey] Rotated to new SPK ${spk.keyId}`);
  return spk.keyId;
}

/**
 * Generates and uploads a fresh batch of OTPKs to replenish the server supply.
 */
export async function replenishOneTimePreKeys(
  input: GeneratePreKeysInput,
  identityApi: IdentityApi
): Promise<number> {
  const profile = input.cryptoProfile ?? 'default';
  const count = PLATFORM_OTPK_BATCH_SIZE[input.platform];

  const otpks = generateOneTimePreKeys(count, profile);

  await storeOneTimePreKeys(
    otpks.map((otpk) => ({
      keyId: otpk.keyId,
      ecdhPrivateKey: otpk.ecdh.privateKey,
      kemPrivateKey: otpk.kem.privateKey,
    })),
    input.identityId,
    input.deviceId,
    input.wrappingKey
  );

  const uploadParams: UploadPreKeysParams = {
    oneTimePreKeys: otpks.map((otpk) => ({
      keyId: otpk.keyId,
      ecdhPublicKey: toBase64(otpk.ecdh.publicKey),
      kemPublicKey: toBase64(otpk.kem.publicKey),
    })),
  };

  const response = await identityApi.uploadPreKeys(
    input.identityId,
    input.deviceId,
    uploadParams
  );

  if (!response.success) {
    console.error('[PreKey] Failed to upload OTPKs:', response.error);
    throw new Error(`OTPK replenishment upload failed: ${response.error?.message ?? 'Unknown error'}`);
  }

  console.debug(`[PreKey] Replenished ${count} OTPKs for device ${input.deviceId}`);
  return count;
}
