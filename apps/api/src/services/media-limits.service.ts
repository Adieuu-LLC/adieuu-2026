/**
 * Resolves account-scoped media limits for bridging tokens and identity sessions.
 * Identity routes consume the value stored on the session — they do not load User.
 */

import { PLATFORM_SETTING_KEYS } from '../constants/platform-settings-keys';
import { DEFAULT_MAX_VIDEO_DURATION_SECONDS } from '../constants/media-limits';
import type { UserDocument } from '../models/user';
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
