/**
 * OS-level (Web Notification API) alert preference — localStorage only, no React.
 * Used by `useNativeNotificationsPreference` and unit tests (avoids loading `react`).
 */

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

export function subscribeNativeNotificationsEnabled(onStoreChange: () => void): () => void {
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
