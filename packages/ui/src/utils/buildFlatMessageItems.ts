/**
 * Pure function that inserts day separators and unread markers into a
 * chronologically-ordered list of channel messages.
 *
 * Channel-agnostic: works with any message shape that has `id` and
 * `createdAt`. Conversation-specific concerns (pending outbox, expired
 * message filtering) are layered on by callers.
 */

export type ChannelListItem<M> =
  | { type: 'day-separator'; date: Date; key: string }
  | { type: 'message'; msg: M; key: string; isFirstUnread?: boolean };

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatDayLabel(date: Date): string {
  const now = new Date();
  if (isSameDay(date, now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }

  return date.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Build a flat item list from chronologically-ordered messages (oldest first).
 *
 * @param messages - Messages in display order (oldest → newest).
 * @param unreadCount - Number of trailing messages to mark as unread.
 * @param nowMs - Current timestamp for expiry filtering (0 to skip).
 */
export function buildFlatMessageItems<
  M extends { id: string; createdAt: string; expiresAt?: string },
>(
  messages: M[],
  unreadCount: number,
  nowMs: number,
): ChannelListItem<M>[] {
  const items: ChannelListItem<M>[] = [];
  const unreadIdx =
    unreadCount > 0 && unreadCount < messages.length
      ? messages.length - unreadCount
      : -1;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    if (nowMs > 0 && msg.expiresAt && new Date(msg.expiresAt).getTime() <= nowMs) continue;

    const currDate = new Date(msg.createdAt);
    const prevItem = items.length > 0 ? items[items.length - 1] : null;
    const prevMsgDate =
      prevItem?.type === 'message' ? new Date(prevItem.msg.createdAt) : null;
    const showDaySep = !prevMsgDate || !isSameDay(prevMsgDate, currDate);

    if (showDaySep) {
      items.push({ type: 'day-separator', date: currDate, key: `day-${msg.id}` });
    }
    items.push({
      type: 'message',
      msg,
      key: msg.id,
      isFirstUnread: i === unreadIdx || undefined,
    });
  }
  return items;
}
