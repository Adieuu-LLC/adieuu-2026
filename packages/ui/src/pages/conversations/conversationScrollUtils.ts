/**
 * Pure helpers for the conversation message scroller (non-virtualized).
 */

/** Max decrypted messages kept per conversation in memory before trimming. */
export const MAX_LOADED_MESSAGES = 120;

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

/** Distance from the scroll viewport bottom edge to content bottom (px). */
export function readDistanceFromBottom(scrollViewport: HTMLElement): number {
  return scrollViewport.scrollHeight - scrollViewport.scrollTop - scrollViewport.clientHeight;
}

/** Restore the same distance-from-bottom after content height changes (e.g. prepending newer history). */
export function applyDistanceFromBottom(
  scrollViewport: HTMLElement,
  distanceFromBottom: number,
): void {
  scrollViewport.scrollTop = Math.max(
    0,
    scrollViewport.scrollHeight - scrollViewport.clientHeight - distanceFromBottom,
  );
}

export type HistoryScrollAnchor = {
  /** Stable row key (matches `ChatItem.key` / `data-scroll-anchor-key`). */
  anchorKey: string;
  /** Desired distance from the scroll viewport top to the anchor element top (px). */
  targetViewportOffsetPx: number;
};

/**
 * Keeps a row at the same visual offset after older history is prepended above it.
 * Prefer this over scrollHeight deltas when row heights are asynchronous (images, fonts).
 */
export function applyHistoryScrollAnchor(
  scrollViewport: HTMLElement,
  contentRoot: HTMLElement,
  anchor: HistoryScrollAnchor,
): 'aligned' | 'adjusted' | 'missing' {
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(anchor.anchorKey)
      : anchor.anchorKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const el = contentRoot.querySelector(`[data-scroll-anchor-key="${escaped}"]`);
  if (!el) return 'missing';

  const vRect = scrollViewport.getBoundingClientRect();
  const cr = el.getBoundingClientRect();
  const currentOffset = cr.top - vRect.top;
  const diff = currentOffset - anchor.targetViewportOffsetPx;
  if (Math.abs(diff) < 0.5) return 'aligned';
  scrollViewport.scrollTop += diff;
  return 'adjusted';
}
