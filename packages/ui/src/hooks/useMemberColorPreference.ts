/**
 * Client-side preference for how per-member colours are displayed.
 * Stored in localStorage; mirrors the pattern used by message layout prefs.
 */

import { useSyncExternalStore } from 'react';

export type MemberColorDisplay = 'name-only' | 'name-and-accent' | 'name-and-bubble';

const STORAGE_KEY = 'adieuu.app.memberColorDisplay';
const DEFAULT_MODE: MemberColorDisplay = 'name-and-bubble';

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) {
    l();
  }
}

export function getMemberColorDisplay(): MemberColorDisplay {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'name-only' || raw === 'name-and-accent' || raw === 'name-and-bubble') return raw;
  return DEFAULT_MODE;
}

export function setMemberColorDisplay(mode: MemberColorDisplay): void {
  localStorage.setItem(STORAGE_KEY, mode);
  emit();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): MemberColorDisplay {
  return getMemberColorDisplay();
}

export function useMemberColorPreference(): MemberColorDisplay {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_MODE);
}
