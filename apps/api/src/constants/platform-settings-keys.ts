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
  SUPPORT_AGENT_IDENTITY_LIST: 'platform-support-agent-identity-list',
  /** Upper bound for video duration (seconds); per-account limits must not exceed this. */
  MEDIA_MAX_VIDEO_DURATION_SECONDS: 'platform-media-max-video-duration-seconds',
  /** Whether IP-based geo lookups are enabled at runtime. */
  GEO_LOOKUP_ENABLED: 'platform-geo-lookup-enabled',
  /** Whether age verification enforcement is active. */
  AGE_VERIFICATION_ENABLED: 'platform-age-verification-enabled',
  /** Whether silent post-subscription email background age checks run automatically. */
  AGE_VERIFICATION_AUTO_EMAIL_CHECK: 'platform-age-verification-auto-email-check',
  /** Active age verification provider id (default: 'verifymy'). */
  AGE_VERIFICATION_ACTIVE_PROVIDER: 'platform-age-verification-active-provider',
  /** VerifyMy environment override ('sandbox' | 'production'). */
  AGE_VERIFICATION_VERIFYMY_ENV: 'platform-age-verification-verifymy-env',
  /** Enforcement mode: 'jurisdictions' (seed-data-driven) or 'all' (every account). */
  AGE_VERIFICATION_REQUIRED_MODE: 'platform-age-verification-required-mode',
  /** Additional jurisdictions that require AV (additive to seed data). */
  AGE_VERIFICATION_REQUIRED_JURISDICTIONS: 'platform-age-verification-required-jurisdictions',
  /** Jurisdictions where the service is entirely blocked. */
  GEOFENCE_BLOCKED_JURISDICTIONS: 'platform-geofence-blocked-jurisdictions',
  /** Jurisdiction-to-law-URL pairs for geofence UI (format: "US-TN|https://..."). */
  GEOFENCE_LAW_LINKS: 'platform-geofence-law-links',
} as const;

export type PlatformSettingKey =
  (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];

const KEY_SET = new Set<string>(Object.values(PLATFORM_SETTING_KEYS));

export function isRegisteredPlatformSettingKey(key: string): key is PlatformSettingKey {
  return KEY_SET.has(key);
}
