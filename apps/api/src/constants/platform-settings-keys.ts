/**
 * Canonical platform setting keys (Mongo `platform_settings.key`).
 * Single source of truth for registry validation.
 */
export const PLATFORM_SETTING_KEYS = {
  AUTH_ALLOWLIST_ENFORCED: 'platform-auth-allowlist-enforced',
  AUTH_ALLOWLIST_EMAIL: 'platform-auth-allowlist-email',
  AUTH_ALLOWLIST_PHONE: 'platform-auth-allowlist-phone',
  ADMIN_IDENTITY_LIST: 'platform-admin-identity-list',
  MODERATOR_IDENTITY_LIST: 'platform-moderator-identity-list',
  /** Upper bound for video duration (seconds); per-account limits must not exceed this. */
  MEDIA_MAX_VIDEO_DURATION_SECONDS: 'platform-media-max-video-duration-seconds',
  /** Whether IP-based geo lookups are enabled at runtime. */
  GEO_LOOKUP_ENABLED: 'platform-geo-lookup-enabled',
} as const;

export type PlatformSettingKey =
  (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];

const KEY_SET = new Set<string>(Object.values(PLATFORM_SETTING_KEYS));

export function isRegisteredPlatformSettingKey(key: string): key is PlatformSettingKey {
  return KEY_SET.has(key);
}
