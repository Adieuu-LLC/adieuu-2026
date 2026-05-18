/**
 * Resolves account-scoped media limits for bridging tokens and identity sessions.
 * Identity routes consume the value stored on the session — they do not load User.
 */

import { resolveScalableDmOrConvMaxUploadBytes, type SubscriptionTierId } from '@adieuu/shared';
import { PLATFORM_SETTING_KEYS } from '../constants/platform-settings-keys';
import { DEFAULT_MAX_VIDEO_DURATION_SECONDS } from '../constants/media-limits';
import type { UserDocument } from '../models/user';
import type { UploadPurpose } from '../models/media-upload';
import { UPLOAD_PURPOSE_CONFIG } from '../models/media-upload';
import { getPlatformSettingsRepository } from '../repositories/platform-settings.repository';

function clampPositiveInt(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

/**
 * Platform ceiling for max video duration (seconds). Missing or invalid rows use default.
 */
export async function getPlatformMaxVideoDurationSeconds(): Promise<number> {
  const repo = getPlatformSettingsRepository();
  const row = await repo.findByKey(PLATFORM_SETTING_KEYS.MEDIA_MAX_VIDEO_DURATION_SECONDS);
  if (!row || row.valueType !== 'number' || typeof row.value !== 'number') {
    return DEFAULT_MAX_VIDEO_DURATION_SECONDS;
  }
  return clampPositiveInt(row.value, DEFAULT_MAX_VIDEO_DURATION_SECONDS);
}

/**
 * Effective max video duration for an account: min(platform ceiling, optional account cap).
 */
export function resolveMaxVideoDurationSecondsForAccount(
  platformMaxSeconds: number,
  user: Pick<UserDocument, 'maxVideoDurationSeconds'> | null | undefined,
): number {
  const platform = clampPositiveInt(platformMaxSeconds, DEFAULT_MAX_VIDEO_DURATION_SECONDS);
  const accountCap = user?.maxVideoDurationSeconds;
  if (accountCap === undefined || accountCap === null) {
    return platform;
  }
  return Math.min(platform, clampPositiveInt(accountCap, platform));
}

/** Options for entitlement-aware upload caps (conversation media / DM attachments). */
export interface ResolveMaxUploadBytesOptions {
  entitlements?: string[];
  isLifetime?: boolean;
}

/**
 * Resolves the effective max upload size (bytes) for a given purpose,
 * taking subscription tiers and entitlement grants into account.
 *
 * Insider subscribers get elevated caps on scalable purposes; Lifetime Founder
 * (`founder` entitlement with lifetime billing) receives the highest ceiling.
 */
export function resolveMaxUploadBytes(
  purpose: UploadPurpose,
  subscriptions: SubscriptionTierId[],
  opts?: ResolveMaxUploadBytesOptions,
): number {
  const base = UPLOAD_PURPOSE_CONFIG[purpose].maxBytes;
  if (purpose === 'conv_media' || purpose === 'dm_attachment') {
    return resolveScalableDmOrConvMaxUploadBytes(purpose, subscriptions, {
      entitlements: opts?.entitlements ?? [],
      isLifetime: opts?.isLifetime ?? false,
    });
  }

  return base;
}
