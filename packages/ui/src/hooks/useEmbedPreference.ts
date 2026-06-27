/**
 * Embed Visibility Preference
 *
 * Per-identity localStorage setting controlling how link embeds are displayed
 * in message conversations.
 *
 * @module hooks/useEmbedPreference
 */

import { useSyncExternalStore, useCallback } from 'react';

export type EmbedVisibilityMode = 'none' | 'all' | 'allowlist';
export type EmbedMaxWidth = 0 | 100 | 300 | 500;

export interface EmbedPreference {
  mode: EmbedVisibilityMode;
  allowlist: string[];
  maxWidth: EmbedMaxWidth;
}

const STORAGE_KEY_PREFIX = 'adieuu.app.embedVisibility.';
const DEFAULT_PREFERENCE: EmbedPreference = { mode: 'allowlist', allowlist: [], maxWidth: 500 };
const VALID_MODES: Set<string> = new Set(['none', 'all', 'allowlist']);
const VALID_MAX_WIDTHS: Set<number> = new Set([0, 100, 300, 500]);

const listeners = new Set<() => void>();
function emitChange() {
  listeners.forEach((fn) => fn());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// Cache to ensure stable object references for useSyncExternalStore
const snapshotCache = new Map<string, { raw: string | null; pref: EmbedPreference }>();

function getSnapshot(identityId: string): EmbedPreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + identityId);
    const cached = snapshotCache.get(identityId);
    if (cached && cached.raw === raw) return cached.pref;

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && VALID_MODES.has(parsed.mode)) {
        const pref: EmbedPreference = {
          mode: parsed.mode as EmbedVisibilityMode,
          allowlist: Array.isArray(parsed.allowlist)
            ? parsed.allowlist.filter((s: unknown) => typeof s === 'string')
            : [],
          maxWidth: VALID_MAX_WIDTHS.has(parsed.maxWidth) ? parsed.maxWidth : 500,
        };
        snapshotCache.set(identityId, { raw, pref });
        return pref;
      }
    }
    snapshotCache.set(identityId, { raw, pref: DEFAULT_PREFERENCE });
  } catch {
    // Storage unavailable or corrupt
  }
  return DEFAULT_PREFERENCE;
}

export function loadEmbedPreference(identityId: string): EmbedPreference {
  return getSnapshot(identityId);
}

export function saveEmbedPreference(identityId: string, pref: EmbedPreference): void {
  try {
    const raw = JSON.stringify(pref);
    localStorage.setItem(STORAGE_KEY_PREFIX + identityId, raw);
    snapshotCache.set(identityId, { raw, pref });
    emitChange();
  } catch {
    // Storage full or unavailable
  }
}

/**
 * React hook returning the current embed visibility preference for a
 * given identity, and a setter to update it.
 */
export function useEmbedPreference(
  identityId: string
): [EmbedPreference, (pref: EmbedPreference) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => getSnapshot(identityId),
    () => DEFAULT_PREFERENCE
  );

  const setValue = useCallback(
    (pref: EmbedPreference) => saveEmbedPreference(identityId, pref),
    [identityId]
  );

  return [value, setValue];
}

/**
 * Check whether a given domain is allowed by the user's embed preference.
 */
export function isDomainAllowed(domain: string, pref: EmbedPreference): boolean {
  if (pref.mode === 'none') return false;
  if (pref.mode === 'all') return true;
  const normalized = domain.replace(/^www\./, '').toLowerCase();
  return pref.allowlist.some(
    (entry) => normalized === entry.toLowerCase() || normalized.endsWith('.' + entry.toLowerCase())
  );
}
