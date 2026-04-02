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
  clearOneTimePreKeysExcept,
  getOneTimePreKeyCount,
  getOneTimePreKeyIds,
} from './preKeyStorage';

// ============================================================================
// Configuration
// ============================================================================

export type Platform = 'desktop' | 'web' | 'mobile';
export type SecurityLevel = 'very_lax' | 'lax' | 'standard' | 'medium' | 'high' | 'maximum';
export type SpkDeletionPolicy = 'after-sync' | 'timed' | 'immediate';

export interface ForwardSecrecyConfig {
  enabled: boolean;
  securityLevel: SecurityLevel;
  spkDeletionPolicy: SpkDeletionPolicy;
  clearCacheOnRotation: boolean;
}

export const DEFAULT_FS_CONFIG: ForwardSecrecyConfig = {
  enabled: true,
  securityLevel: 'standard',
  spkDeletionPolicy: 'after-sync',
  clearCacheOnRotation: false,
};

export const SECURITY_LEVEL_CONFIG = {
  very_lax: {
    spkRotationIntervalMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxRetiredSpks: 3,
    hardDeleteCapMs: 60 * 24 * 60 * 60 * 1000,       // 60 days
  },
  lax: {
    spkRotationIntervalMs: 14 * 24 * 60 * 60 * 1000, // 14 days
    maxRetiredSpks: 3,
    hardDeleteCapMs: 30 * 24 * 60 * 60 * 1000,       // 30 days
  },
  standard: {
    spkRotationIntervalMs: 7 * 24 * 60 * 60 * 1000,  // 7 days
    maxRetiredSpks: 5,
    hardDeleteCapMs: 14 * 24 * 60 * 60 * 1000,       // 14 days
  },
  medium: {
    spkRotationIntervalMs: 24 * 60 * 60 * 1000,      // 24h
    maxRetiredSpks: 5,
    hardDeleteCapMs: 7 * 24 * 60 * 60 * 1000,        // 7 days
  },
  high: {
    spkRotationIntervalMs: 4 * 60 * 60 * 1000,       // 4h
    maxRetiredSpks: 8,
    hardDeleteCapMs: 48 * 60 * 60 * 1000,             // 48h
  },
  maximum: {
    spkRotationIntervalMs: 1 * 60 * 60 * 1000,       // 1h
    maxRetiredSpks: 12,
    hardDeleteCapMs: 24 * 60 * 60 * 1000,             // 24h
  },
} as const;

const PLATFORM_OTPK_BATCH_SIZE: Record<Platform, number> = {
  desktop: 50,
  web: 25,
  mobile: 50,
};

export const PLATFORM_OTPK_REPLENISH_THRESHOLD: Record<Platform, number> = {
  desktop: 10,
  web: 5,
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
// OTPK Digest (server-local consistency checking)
// ============================================================================

/**
 * Computes a SHA-256 hex digest of sorted local OTPK key IDs for a device.
 * Must produce the same output as the server's `getUnconsumedOtpkDigest`
 * for an identical set of key IDs.
 */
export async function computeLocalOtpkDigest(
  identityId: string,
  deviceId: string
): Promise<string> {
  const ids = await getOneTimePreKeyIds(identityId, deviceId);
  const data = new TextEncoder().encode(ids.join(','));
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

// ============================================================================
// OTPK Consumption Counter
// ============================================================================

export const RESYNC_AFTER_N_OTPKS = 30;

const COUNTER_HMR_KEY = '__adieuu_otpkConsumedCounter__' as const;

interface OtpkCounterHmrState {
  count: number;
  resyncCallback: (() => Promise<void>) | null;
}

function getCounterState(): OtpkCounterHmrState {
  const g = globalThis as Record<string, unknown>;
  if (!g[COUNTER_HMR_KEY]) {
    g[COUNTER_HMR_KEY] = { count: 0, resyncCallback: null };
  }
  return g[COUNTER_HMR_KEY] as OtpkCounterHmrState;
}

/**
 * Registers a callback to be invoked when the OTPK consumption counter
 * reaches the threshold. Typically called by usePreKeys to wire up
 * resyncOneTimePreKeys.
 */
export function registerOtpkResyncCallback(cb: () => Promise<void>): void {
  getCounterState().resyncCallback = cb;
}

/**
 * Increments the OTPK consumption counter. When the counter reaches
 * `RESYNC_AFTER_N_OTPKS`, the registered callback is invoked via
 * `queueMicrotask` to avoid firing mid-decryption-batch.
 */
export function notifyOtpkConsumed(): void {
  const state = getCounterState();
  state.count++;
  if (state.count >= RESYNC_AFTER_N_OTPKS && state.resyncCallback) {
    const cb = state.resyncCallback;
    state.count = 0;
    queueMicrotask(() => {
      cb().catch((err) => {
        console.error('[PreKey] Deferred OTPK resync failed:', err);
      });
    });
  }
}

/**
 * Resets the OTPK consumption counter to 0. Called after a successful resync.
 */
export function resetOtpkConsumedCounter(): void {
  getCounterState().count = 0;
}

// ============================================================================
// OTPK Re-sync (full pool reset)
// ============================================================================

/**
 * Performs a full reset of the OTPK pool for this device: purges all
 * unconsumed OTPKs on the server, clears all locally stored OTPK private
 * keys, then generates and uploads a fresh batch.
 *
 * This is the nuclear option for resolving a server-local OTPK
 * desynchronisation. Any in-flight messages encrypted to the old OTPKs
 * become undecryptable, but they already were (that is the bug this fixes).
 *
 * @returns Number of fresh OTPKs uploaded.
 */
export async function resyncOneTimePreKeys(
  input: GeneratePreKeysInput,
  identityApi: IdentityApi
): Promise<number> {
  // 1. Purge unconsumed OTPKs on the server
  const purgeResp = await identityApi.purgeOneTimePreKeys(input.identityId, input.deviceId);
  if (!purgeResp.success) {
    throw new Error(
      `Server OTPK purge failed: ${purgeResp.error?.message ?? 'Unknown error'}`
    );
  }
  console.debug(`[PreKey] Purged ${purgeResp.data?.purged ?? '?'} server OTPKs for device ${input.deviceId}`);

  // 2. Selective local purge: keep private keys for OTPKs the server has
  //    already marked as consumed (in-flight messages). Their private keys
  //    will be cleaned up via deleteOneTimePreKey after decryption.
  const consumedKeyIds = purgeResp.data?.consumedKeyIds ?? [];
  const localRemoved = await clearOneTimePreKeysExcept(
    input.identityId, input.deviceId, consumedKeyIds
  );
  console.debug(
    `[PreKey] Cleared ${localRemoved} local OTPKs for device ${input.deviceId}` +
    (consumedKeyIds.length > 0 ? ` (preserved ${consumedKeyIds.length} in-flight)` : '')
  );

  // 3. Generate, store, and upload a fresh batch
  const uploaded = await replenishOneTimePreKeys(input, identityApi);
  console.debug(`[PreKey] Re-sync complete: uploaded ${uploaded} fresh OTPKs for device ${input.deviceId}`);

  resetOtpkConsumedCounter();

  return uploaded;
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
 * Also detects server-local OTPK desynchronisation: if the server count
 * exceeds the local count by a significant margin (the server is holding
 * stale OTPKs we no longer have private keys for), a full resync is
 * triggered automatically rather than a simple replenishment.
 *
 * @returns Number of new OTPKs uploaded, or 0 if no replenishment needed.
 */
export async function checkAndReplenishOtpks(
  input: GeneratePreKeysInput,
  identityApi: IdentityApi
): Promise<number> {
  const threshold = PLATFORM_OTPK_REPLENISH_THRESHOLD[input.platform];

  try {
    const [countResponse, localDigest] = await Promise.all([
      identityApi.getPreKeyCount(input.identityId, input.deviceId),
      computeLocalOtpkDigest(input.identityId, input.deviceId),
    ]);

    if (!countResponse.success || !countResponse.data) {
      console.warn('[PreKey] Failed to get OTPK count, skipping replenishment');
      return 0;
    }

    const serverCount = countResponse.data.oneTimePreKeysRemaining;
    const serverDigest = countResponse.data.otpkDigest;

    // Digest-based consistency check: detects both count mismatches AND
    // the more subtle case where counts match but key IDs differ (the
    // bug that originally motivated resyncOneTimePreKeys).
    if (localDigest !== serverDigest) {
      console.warn(
        `[PreKey] OTPK digest mismatch: server=${serverDigest.slice(0, 12)}..., ` +
        `local=${localDigest.slice(0, 12)}... Triggering full OTPK resync.`
      );
      return await resyncOneTimePreKeys(input, identityApi);
    }

    if (serverCount >= threshold) {
      console.debug(`[PreKey] OTPK count ${serverCount} >= threshold ${threshold}, no replenishment needed`);
      return 0;
    }

    console.debug(`[PreKey] OTPK count ${serverCount} < threshold ${threshold}, replenishing...`);
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

// ============================================================================
// Message Artifacts Preference (localStorage, per-identity)
// ============================================================================

const SHOW_ARTIFACTS_KEY_PREFIX = 'adieuu-show-artifacts-';

/**
 * Loads whether the user wants to see message artifacts (deleted,
 * undecryptable, FS-expired messages). Returns false when not set.
 */
export function loadShowMessageArtifacts(identityId: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const stored = localStorage.getItem(SHOW_ARTIFACTS_KEY_PREFIX + identityId);
    if (stored !== null) return JSON.parse(stored) as boolean;
  } catch {
    // Ignore parse errors
  }
  return false;
}

export function saveShowMessageArtifacts(identityId: string, enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SHOW_ARTIFACTS_KEY_PREFIX + identityId, JSON.stringify(enabled));
}

// ============================================================================
// Per-Conversation FS Default (localStorage, per-conversation)
// ============================================================================

const CONV_FS_CONFIG_KEY_PREFIX = 'adieuu-conv-fs-';

/**
 * Loads the per-conversation forward secrecy override.
 * Returns `null` when no override is set (falls through to global default).
 */
export function loadConversationFsDefault(conversationId: string): boolean | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const stored = localStorage.getItem(CONV_FS_CONFIG_KEY_PREFIX + conversationId);
    if (stored !== null) return JSON.parse(stored) as boolean;
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Saves a per-conversation forward secrecy override.
 * Pass `null` to remove the override (revert to global default).
 */
export function saveConversationFsDefault(conversationId: string, enabled: boolean | null): void {
  if (typeof localStorage === 'undefined') return;
  if (enabled === null) {
    localStorage.removeItem(CONV_FS_CONFIG_KEY_PREFIX + conversationId);
  } else {
    localStorage.setItem(CONV_FS_CONFIG_KEY_PREFIX + conversationId, JSON.stringify(enabled));
  }
}
