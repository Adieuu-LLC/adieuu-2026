/**
 * Reaction Notification Preference
 *
 * Per-identity localStorage toggle controlling whether reactions
 * to the user's own messages generate unread indicators and
 * notifications. Defaults to enabled.
 *
 * @module hooks/useReactionNotificationPreference
 */

const STORAGE_KEY_PREFIX = 'adieuu-reaction-notifications-';

export function loadReactionNotificationsEnabled(identityId: string): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PREFIX + identityId);
    if (stored !== null) return JSON.parse(stored) as boolean;
  } catch {
    // Ignore parse errors
  }
  return true;
}

export function saveReactionNotificationsEnabled(
  identityId: string,
  enabled: boolean
): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + identityId, JSON.stringify(enabled));
  } catch {
    // Storage full or unavailable
  }
}
