/**
 * Lightweight in-session pub-sub for Space-membership changes.
 *
 * The Spaces sidebar loads membership once via `client.spaces.listMine()`, so a
 * Space created or joined elsewhere in the app wouldn't appear until a reload.
 * Until the provider-backed Spaces store lands (Space-view phase), this notifies
 * interested views (the sidebar) to refetch when membership changes.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Notifies subscribers that the current Alias's Space membership changed. */
export function emitSpacesChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A failing subscriber must not prevent the others from being notified.
    }
  }
}

/** Subscribes to membership changes; returns an unsubscribe function. */
export function onSpacesChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
