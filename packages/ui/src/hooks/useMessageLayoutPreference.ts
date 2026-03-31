/**
 * Client-side preference for conversation message layout.
 * Stored in localStorage; mirrors the pattern used by notification sound prefs.
 */

import { useSyncExternalStore } from 'react';

export type MessageLayout = 'linear' | 'bubble';

const STORAGE_KEY = 'adieuu.app.messageLayout';
const DEFAULT_LAYOUT: MessageLayout = 'linear';

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) {
    l();
  }
}

export function getMessageLayout(): MessageLayout {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'linear' || raw === 'bubble') return raw;
  return DEFAULT_LAYOUT;
}

export function setMessageLayout(layout: MessageLayout): void {
  localStorage.setItem(STORAGE_KEY, layout);
  emit();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): MessageLayout {
  return getMessageLayout();
}

export function useMessageLayoutPreference(): MessageLayout {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_LAYOUT);
}
