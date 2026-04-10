/**
 * Lightweight pub/sub for achievement unlock events.
 *
 * The WebSocket handler publishes here; the UI (modal or toast) subscribes.
 * Tracks already-emitted achievement IDs so duplicates (e.g. WS + REST
 * fetch on connect) are silently dropped.
 */

export interface AchievementUnlockEvent {
  achievementId: string;
  definition: {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string;
  };
}

type Listener = (event: AchievementUnlockEvent) => void;

const listeners = new Set<Listener>();
const emittedIds = new Set<string>();

export function emitAchievementUnlocked(event: AchievementUnlockEvent): void {
  if (emittedIds.has(event.achievementId)) return;
  emittedIds.add(event.achievementId);

  for (const fn of listeners) {
    try { fn(event); } catch { /* swallow */ }
  }
}

export function onAchievementUnlocked(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Clear dedup state (call on identity change / logout). */
export function resetAchievementEmitHistory(): void {
  emittedIds.clear();
}
