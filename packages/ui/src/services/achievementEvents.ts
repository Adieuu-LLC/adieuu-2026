/**
 * Lightweight pub/sub for achievement unlock events.
 *
 * The WebSocket handler publishes here; the UI (modal or toast) subscribes.
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

export function emitAchievementUnlocked(event: AchievementUnlockEvent): void {
  for (const fn of listeners) {
    try { fn(event); } catch { /* swallow */ }
  }
}

export function onAchievementUnlocked(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
