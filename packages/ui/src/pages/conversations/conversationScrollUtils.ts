/**
 * Conversation-specific scroll helpers.
 *
 * Generic DOM math lives in {@link ../../utils/messageScrollUtils} and is
 * re-exported here so existing callers don't break.
 */

// Re-export shared utilities so existing imports keep working.
export {
  computeIsAtBottom,
  scrollViewportCanScroll,
  SCROLL_OVERFLOW_EPS_PX,
  computeScrollTopAfterPrepend,
  readDistanceFromBottom,
  applyDistanceFromBottom,
  applyHistoryScrollAnchor,
  type HistoryScrollAnchor,
} from '../../utils/messageScrollUtils';

// ---------------------------------------------------------------------------
// Conversation-specific constants & helpers
// ---------------------------------------------------------------------------

/** Max decrypted messages kept per conversation in memory before trimming. */
export const MAX_LOADED_MESSAGES = 120;

/**
 * Default page size for `getMessages` in the client — used to size reply/deep-link jumps as
 * "half a page" on each side of the target (plus the target).
 */
export const DEFAULT_MESSAGE_PAGE_LIMIT = 30;

/** Older-side window when jumping to a reply target (API `before`); half of {@link DEFAULT_MESSAGE_PAGE_LIMIT}. */
export const REPLY_JUMP_CONTEXT_BEFORE = Math.floor(DEFAULT_MESSAGE_PAGE_LIMIT / 2);
/** Newer-side window when jumping to a reply target (API `after`); half of {@link DEFAULT_MESSAGE_PAGE_LIMIT}. */
export const REPLY_JUMP_CONTEXT_AFTER = Math.floor(DEFAULT_MESSAGE_PAGE_LIMIT / 2);

/** Smallest valid `getMessagesAround` window when hydrating reply-quote parents outside the buffer (API minimum is 1). */
export const REPLY_QUOTE_HYDRATION_BEFORE = 1;
export const REPLY_QUOTE_HYDRATION_AFTER = 1;

/**
 * `messages` order matches API / {@link useConversations}: index 0 = newest, last = oldest.
 * When over capacity: at bottom keep the newest window; when reading history, keep the oldest window.
 * When not at bottom and `unreadCount` &gt; 0, also retain the newest `unreadCount` messages so
 * unread separators stay aligned with `ConversationView` (last-N-unreads heuristic).
 */
export function trimMessagesBuffer<T extends { id: string }>(
  messages: T[],
  atBottom: boolean,
  unreadCount = 0,
): T[] {
  if (messages.length <= MAX_LOADED_MESSAGES) return messages;
  if (atBottom) {
    return messages.slice(0, MAX_LOADED_MESSAGES);
  }
  const keepOldest = messages.slice(-MAX_LOADED_MESSAGES);
  if (unreadCount <= 0) return keepOldest;

  const n = Math.min(unreadCount, messages.length);
  const keepNewest = messages.slice(0, n);
  const keepId = new Set<string>([...keepOldest, ...keepNewest].map((m) => m.id));
  return messages.filter((m) => keepId.has(m.id));
}
