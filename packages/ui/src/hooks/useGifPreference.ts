/**
 * GIF Visibility Preference
 *
 * Per-identity localStorage setting controlling when GIF/sticker content
 * from external providers (Klipy) loads in the browser.
 *
 * @module hooks/useGifPreference
 */

import { useSyncExternalStore, useCallback } from 'react';

export type GifVisibility = 'all' | 'private_only' | 'friends_only' | 'disabled';

const STORAGE_KEY_PREFIX = 'adieuu.gif-visibility.';
const DEFAULT: GifVisibility = 'all';
const VALID: Set<string> = new Set(['all', 'private_only', 'friends_only', 'disabled']);

const listeners = new Set<() => void>();
function emitChange() {
  listeners.forEach((fn) => fn());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(identityId: string): GifVisibility {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + identityId);
    if (raw && VALID.has(raw)) return raw as GifVisibility;
  } catch {
    // Storage unavailable
  }
  return DEFAULT;
}

export function loadGifVisibility(identityId: string): GifVisibility {
  return getSnapshot(identityId);
}

export function saveGifVisibility(identityId: string, value: GifVisibility): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + identityId, value);
    emitChange();
  } catch {
    // Storage full or unavailable
  }
}

/**
 * React hook returning the current GIF visibility preference for a
 * given identity, and a setter to update it.
 */
export function useGifPreference(identityId: string): [GifVisibility, (v: GifVisibility) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => getSnapshot(identityId),
    () => DEFAULT
  );

  const setValue = useCallback(
    (v: GifVisibility) => saveGifVisibility(identityId, v),
    [identityId]
  );

  return [value, setValue];
}

// ---------------------------------------------------------------------------
// Per-conversation user-level GIF hide (localStorage only)
// ---------------------------------------------------------------------------

const CONV_KEY_PREFIX = 'adieuu.conv-gif-disabled.';

export function loadConversationGifHidden(conversationId: string): boolean {
  try {
    return localStorage.getItem(CONV_KEY_PREFIX + conversationId) === 'true';
  } catch {
    return false;
  }
}

export function saveConversationGifHidden(conversationId: string, hidden: boolean): void {
  try {
    if (hidden) {
      localStorage.setItem(CONV_KEY_PREFIX + conversationId, 'true');
    } else {
      localStorage.removeItem(CONV_KEY_PREFIX + conversationId);
    }
    emitChange();
  } catch {
    // Ignore
  }
}

export function useConversationGifHidden(conversationId: string): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => loadConversationGifHidden(conversationId),
    () => false
  );

  const setValue = useCallback(
    (v: boolean) => saveConversationGifHidden(conversationId, v),
    [conversationId]
  );

  return [value, setValue];
}
