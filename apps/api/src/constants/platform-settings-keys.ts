/**
 * Canonical platform setting keys (Mongo `platform_settings.key`).
 * Single source of truth for registry validation.
 */
export const PLATFORM_SETTING_KEYS = {
  AUTH_ALLOWLIST_ENFORCED: 'platform-auth-allowlist-enforced',
  AUTH_ALLOWLIST_EMAIL: 'platform-auth-allowlist-email',
  AUTH_ALLOWLIST_PHONE: 'platform-auth-allowlist-phone',
  ADMIN_ACCOUNT_LIST: 'platform-admin-account-list',
  MODERATOR_ACCOUNT_LIST: 'platform-moderator-account-list',
} as const;

export type PlatformSettingKey =
  (typeof PLATFORM_SETTING_KEYS)[keyof typeof PLATFORM_SETTING_KEYS];

const KEY_SET = new Set<string>(Object.values(PLATFORM_SETTING_KEYS));

export function isRegisteredPlatformSettingKey(key: string): key is PlatformSettingKey {
  return KEY_SET.has(key);
}
