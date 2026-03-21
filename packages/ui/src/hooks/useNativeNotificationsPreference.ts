/**
 * Client-side preference for whether to show OS-level (Web Notification API)
 * alerts for DMs, in addition to in-app toasts. Stored in localStorage so it
 * applies per browser profile / device.
 */

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'adieuu.app.nativeNotificationsEnabled';

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) {
    l();
  }
}

export function getNativeNotificationsEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Persist preference and notify all subscribers (same tab + other tabs via `storage`).
 */
export function setNativeNotificationsEnabled(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    return;
  }
  emit();
}

function subscribeNativeNotificationsEnabled(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      onStoreChange();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Subscribe to preference changes across tabs and within the same tab.
 */
export function useNativeNotificationsPreference(): boolean {
  return useSyncExternalStore(
    subscribeNativeNotificationsEnabled,
    getNativeNotificationsEnabled,
    () => false
  );
}
