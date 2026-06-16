/**
 * Pub/sub for feedback realtime updates (WebSocket -> sidebar badges).
 */

type UnreadListener = () => void;

const unreadListeners = new Set<UnreadListener>();

export function emitFeedbackUnreadChanged(): void {
  for (const fn of unreadListeners) {
    try {
      fn();
    } catch {
      /* swallow */
    }
  }
}

export function onFeedbackUnreadChanged(fn: UnreadListener): () => void {
  unreadListeners.add(fn);
  return () => {
    unreadListeners.delete(fn);
  };
}
