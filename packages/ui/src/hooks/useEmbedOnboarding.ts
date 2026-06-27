/**
 * Tracks whether the embed onboarding prompt has been shown (one-shot per identity).
 *
 * @module hooks/useEmbedOnboarding
 */

import { useSyncExternalStore, useCallback } from 'react';

const STORAGE_KEY_PREFIX = 'adieuu.app.embedOnboardingSeen.';

const listeners = new Set<() => void>();
function emitChange() {
  listeners.forEach((fn) => fn());
}
function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function hasSeen(identityId: string): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_PREFIX + identityId) === '1';
  } catch {
    return false;
  }
}

function markSeen(identityId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + identityId, '1');
    emitChange();
  } catch {
    // Storage unavailable
  }
}

export function useEmbedOnboarding(
  identityId: string
): { seen: boolean; dismiss: () => void } {
  const seen = useSyncExternalStore(
    subscribe,
    () => hasSeen(identityId),
    () => false
  );

  const dismiss = useCallback(() => {
    markSeen(identityId);
  }, [identityId]);

  return { seen, dismiss };
}
