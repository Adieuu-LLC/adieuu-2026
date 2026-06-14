/**
 * Lightweight pub/sub for subscription upgrade events on account sessions.
 *
 * The polling hook and promo redemption flow publish here; the listener
 * subscribes and shows the upgrade modal. Deduplicates by event id.
 */

import type { PublicPendingAccountEvent } from '@adieuu/shared';

export type SubscriptionUpgradedEvent = PublicPendingAccountEvent;

type Listener = (event: SubscriptionUpgradedEvent) => void;

const listeners = new Set<Listener>();
const emittedIds = new Set<string>();

export function emitSubscriptionUpgraded(event: SubscriptionUpgradedEvent): void {
  if (emittedIds.has(event.id)) return;
  emittedIds.add(event.id);

  for (const fn of listeners) {
    try { fn(event); } catch { /* swallow */ }
  }
}

export function onSubscriptionUpgraded(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Clear dedup state (call on logout / account session change). */
export function resetSubscriptionEmitHistory(): void {
  emittedIds.clear();
}
