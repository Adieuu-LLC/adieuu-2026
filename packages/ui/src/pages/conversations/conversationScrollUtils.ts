/**
 * Pure helpers for the conversation message scroller (non-virtualized).
 */

/** Max decrypted messages kept per conversation in memory before trimming. */
export const MAX_LOADED_MESSAGES = 120;

/**
 * `messages` order matches API / {@link useConversations}: index 0 = newest, last = oldest.
 * When over capacity: at bottom keep the newest window; when reading history, keep the oldest window.
 */
export function trimMessagesBuffer<T>(messages: T[], atBottom: boolean): T[] {
  if (messages.length <= MAX_LOADED_MESSAGES) return messages;
  if (atBottom) {
    return messages.slice(0, MAX_LOADED_MESSAGES);
  }
  return messages.slice(-MAX_LOADED_MESSAGES);
}

export function computeIsAtBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  thresholdPx: number,
): boolean {
  if (scrollHeight <= clientHeight) return true;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  return distanceFromBottom <= thresholdPx;
}

export function computeScrollTopAfterPrepend(
  prevScrollTop: number,
  prevScrollHeight: number,
  nextScrollHeight: number,
): number {
  return prevScrollTop + (nextScrollHeight - prevScrollHeight);
}
