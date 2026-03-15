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
  getRetiredSignedPreKeys,
  retireSignedPreKey,
  deleteSignedPreKey,
} from './preKeyStorage';

// ============================================================================
// Configuration
// ============================================================================

export type Platform = 'desktop' | 'web' | 'mobile';
export type SecurityLevel = 'standard' | 'high' | 'maximum';
export type SpkDeletionPolicy = 'after-sync' | 'timed' | 'immediate';

export interface ForwardSecrecyConfig {
  securityLevel: SecurityLevel;
  spkDeletionPolicy: SpkDeletionPolicy;
  clearCacheOnRotation: boolean;
}

export const DEFAULT_FS_CONFIG: ForwardSecrecyConfig = {
  securityLevel: 'standard',
  spkDeletionPolicy: 'after-sync',
  clearCacheOnRotation: false,
};

export const SECURITY_LEVEL_CONFIG = {
  standard: {
    spkRotationIntervalMs: 24 * 60 * 60 * 1000,    // 24h
    maxRetiredSpks: 5,
    hardDeleteCapMs: 7 * 24 * 60 * 60 * 1000,      // 7 days
  },
  high: {
    spkRotationIntervalMs: 4 * 60 * 60 * 1000,     // 4h
    maxRetiredSpks: 8,
    hardDeleteCapMs: 48 * 60 * 60 * 1000,           // 48h
  },
  maximum: {
    spkRotationIntervalMs: 1 * 60 * 60 * 1000,     // 1h
    maxRetiredSpks: 12,
    hardDeleteCapMs: 24 * 60 * 60 * 1000,           // 24h
  },
} as const;

const PLATFORM_OTPK_BATCH_SIZE: Record<Platform, number> = {
  desktop: 50,
  web: 10,
  mobile: 50,
};

export const PLATFORM_OTPK_REPLENISH_THRESHOLD: Record<Platform, number> = {
  desktop: 10,
  web: 3,
  mobile: 10,
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

// ============================================================================
// SPK Rotation Check
// ============================================================================

/**
 * Checks if the active SPK needs rotation based on the configured security level.
 * If overdue (or missing), rotates immediately.
 *
 * @returns Whether a rotation occurred, and the time until next rotation is due.
 */
export async function checkAndRotateSpk(
  input: Omit<GeneratePreKeysInput, 'platform'>,
  identityApi: IdentityApi,
  config: ForwardSecrecyConfig
): Promise<{ rotated: boolean; newKeyId?: string; nextRotationMs: number }> {
  const levelConfig = SECURITY_LEVEL_CONFIG[config.securityLevel];
  const currentSpk = await getActiveSignedPreKey(input.identityId, input.deviceId);

  if (!currentSpk) {
    const keyId = await rotateSignedPreKey(input, identityApi);
    return { rotated: true, newKeyId: keyId, nextRotationMs: levelConfig.spkRotationIntervalMs };
  }

  const age = Date.now() - new Date(currentSpk.createdAt).getTime();

  if (age >= levelConfig.spkRotationIntervalMs) {
    const keyId = await rotateSignedPreKey(input, identityApi);
    return { rotated: true, newKeyId: keyId, nextRotationMs: levelConfig.spkRotationIntervalMs };
  }

  const remaining = levelConfig.spkRotationIntervalMs - age;
  return { rotated: false, nextRotationMs: remaining };
}

// ============================================================================
// Retired SPK Cleanup
// ============================================================================

/**
 * Cleans up retired SPK private keys according to the configured deletion policy.
 *
 * - `after-sync`: Applies safety caps only (hard-delete time cap and max retained count).
 *   Full pending-message-aware deletion requires local message storage (deferred).
 * - `timed`: Deletes any retired SPK older than the rotation interval unconditionally.
 *
 * @returns Number of retired SPKs deleted.
 */
export async function cleanupRetiredSpks(
  identityId: string,
  deviceId: string,
  config: ForwardSecrecyConfig
): Promise<number> {
  const retired = await getRetiredSignedPreKeys(identityId, deviceId);
  if (retired.length === 0) return 0;

  const levelConfig = SECURITY_LEVEL_CONFIG[config.securityLevel];
  const now = Date.now();
  let deletedCount = 0;

  if (config.spkDeletionPolicy === 'immediate') {
    for (const spk of retired) {
      await deleteSignedPreKey(spk.keyId, identityId);
      deletedCount++;
      console.debug(`[PreKey] Immediate-deleted retired SPK ${spk.keyId}`);
    }
    return deletedCount;
  }

  if (config.spkDeletionPolicy === 'timed') {
    for (const spk of retired) {
      if (!spk.retiredAt) continue;
      const retiredAge = now - new Date(spk.retiredAt).getTime();
      if (retiredAge >= levelConfig.spkRotationIntervalMs) {
        await deleteSignedPreKey(spk.keyId, identityId);
        deletedCount++;
        console.debug(`[PreKey] Timed-deleted retired SPK ${spk.keyId} (age: ${Math.round(retiredAge / 1000)}s)`);
      }
    }
    return deletedCount;
  }

  // after-sync policy: apply safety caps as backstop
  // Hard-delete cap: delete retired SPKs older than the tier's time cap
  for (const spk of retired) {
    if (!spk.retiredAt) continue;
    const retiredAge = now - new Date(spk.retiredAt).getTime();
    if (retiredAge >= levelConfig.hardDeleteCapMs) {
      await deleteSignedPreKey(spk.keyId, identityId);
      deletedCount++;
      console.debug(`[PreKey] Hard-cap deleted retired SPK ${spk.keyId} (age: ${Math.round(retiredAge / 1000)}s)`);
    }
  }

  // Max retained SPK cap: if still too many retired, delete oldest
  const remaining = await getRetiredSignedPreKeys(identityId, deviceId);
  if (remaining.length > levelConfig.maxRetiredSpks) {
    const toDelete = remaining.slice(0, remaining.length - levelConfig.maxRetiredSpks);
    for (const spk of toDelete) {
      await deleteSignedPreKey(spk.keyId, identityId);
      deletedCount++;
      console.debug(`[PreKey] Cap-deleted oldest retired SPK ${spk.keyId}`);
    }
  }

  return deletedCount;
}

// ============================================================================
// Manual Purge
// ============================================================================

/**
 * Unconditionally deletes all retired SPK private keys for a device.
 * This is a destructive action: FS-encrypted messages from those key periods
 * become permanently unreadable unless cached locally.
 *
 * @returns Number of retired SPKs deleted.
 */
export async function purgeRetiredKeys(
  identityId: string,
  deviceId: string
): Promise<number> {
  const retired = await getRetiredSignedPreKeys(identityId, deviceId);
  if (retired.length === 0) return 0;

  for (const spk of retired) {
    await deleteSignedPreKey(spk.keyId, identityId);
    console.debug(`[PreKey] Purged retired SPK ${spk.keyId}`);
  }

  return retired.length;
}

// ============================================================================
// OTPK Replenishment
// ============================================================================

/**
 * Checks the server-side OTPK count and replenishes if below the
 * platform-appropriate threshold.
 *
 * @returns Number of new OTPKs uploaded, or 0 if no replenishment needed.
 */
export async function checkAndReplenishOtpks(
  input: GeneratePreKeysInput,
  identityApi: IdentityApi
): Promise<number> {
  const threshold = PLATFORM_OTPK_REPLENISH_THRESHOLD[input.platform];

  try {
    const countResponse = await identityApi.getPreKeyCount(input.identityId, input.deviceId);
    if (!countResponse.success || !countResponse.data) {
      console.warn('[PreKey] Failed to get OTPK count, skipping replenishment');
      return 0;
    }

    const remaining = countResponse.data.oneTimePreKeysRemaining;
    if (remaining >= threshold) {
      console.debug(`[PreKey] OTPK count ${remaining} >= threshold ${threshold}, no replenishment needed`);
      return 0;
    }

    console.debug(`[PreKey] OTPK count ${remaining} < threshold ${threshold}, replenishing...`);
    return await replenishOneTimePreKeys(input, identityApi);
  } catch (err) {
    console.error('[PreKey] OTPK replenishment check failed:', err);
    return 0;
  }
}

// ============================================================================
// FS Config Persistence (localStorage, per-identity)
// ============================================================================

const FS_CONFIG_KEY_PREFIX = 'adieuu-fs-config-';

export function loadFsConfig(identityId: string): ForwardSecrecyConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_FS_CONFIG };
  try {
    const stored = localStorage.getItem(FS_CONFIG_KEY_PREFIX + identityId);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ForwardSecrecyConfig>;
      return { ...DEFAULT_FS_CONFIG, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return { ...DEFAULT_FS_CONFIG };
}

export function saveFsConfig(identityId: string, config: ForwardSecrecyConfig): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(FS_CONFIG_KEY_PREFIX + identityId, JSON.stringify(config));
}
