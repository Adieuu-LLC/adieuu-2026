import type { TFunction } from 'i18next';

/**
 * Human-readable length of a friendship (from `friendsSince` ISO) for use inside
 * `friends.friendsForDuration` and related copy.
 */
export function formatFriendshipLengthSegment(friendsSinceIso: string, t: TFunction): string {
  const start = new Date(friendsSinceIso).getTime();
  const ms = Date.now() - start;
  if (!Number.isFinite(ms) || ms < 0) {
    return t('friends.friendshipLengthUnknown', 'a while');
  }

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return t('friends.friendshipLengthLessThanMinute', 'less than a minute');
  }
  if (minutes < 60) {
    return t('friends.friendshipLengthMinutes', { count: minutes });
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return t('friends.friendshipLengthHours', { count: hours });
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return t('friends.friendshipLengthDays', { count: days });
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return t('friends.friendshipLengthMonths', { count: months });
  }

  const years = Math.max(1, Math.floor(days / 365));
  return t('friends.friendshipLengthYears', { count: years });
}

/** One line, e.g. "Friends for 2 years" (uses `friends.friendsForDuration`). */
export function formatFriendsForLine(friendsSinceIso: string, t: TFunction): string {
  const duration = formatFriendshipLengthSegment(friendsSinceIso, t);
  return t('friends.friendsForDuration', { duration });
}
