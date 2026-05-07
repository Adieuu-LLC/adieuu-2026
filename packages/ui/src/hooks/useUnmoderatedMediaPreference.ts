/**
 * Unmoderated Media Display Preference
 *
 * Per-identity localStorage setting controlling whether media that skipped
 * moderation scanning is auto-displayed or hidden behind a placeholder.
 *
 * @module hooks/useUnmoderatedMediaPreference
 */

import { useSyncExternalStore, useCallback } from 'react';

export type UnmoderatedMediaDisplay = 'allow' | 'hide';

const STORAGE_KEY_PREFIX = 'adieuu.unmoderated-media-display.';
const DEFAULT: UnmoderatedMediaDisplay = 'allow';
const VALID: Set<string> = new Set(['allow', 'hide']);

const listeners = new Set<() => void>();
function emitChange() {
  listeners.forEach((fn) => fn());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(identityId: string): UnmoderatedMediaDisplay {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + identityId);
    if (raw && VALID.has(raw)) return raw as UnmoderatedMediaDisplay;
  } catch {
    // Storage unavailable
  }
  return DEFAULT;
}

export function loadUnmoderatedMediaDisplay(identityId: string): UnmoderatedMediaDisplay {
  return getSnapshot(identityId);
}

export function saveUnmoderatedMediaDisplay(identityId: string, value: UnmoderatedMediaDisplay): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + identityId, value);
    emitChange();
  } catch {
    // Storage full or unavailable
  }
}

/**
 * React hook returning the current unmoderated media display preference for
 * a given identity, and a setter to update it.
 */
export function useUnmoderatedMediaPreference(
  identityId: string
): [UnmoderatedMediaDisplay, (v: UnmoderatedMediaDisplay) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => getSnapshot(identityId),
    () => DEFAULT
  );

  const setValue = useCallback(
    (v: UnmoderatedMediaDisplay) => saveUnmoderatedMediaDisplay(identityId, v),
    [identityId]
  );

  return [value, setValue];
}
