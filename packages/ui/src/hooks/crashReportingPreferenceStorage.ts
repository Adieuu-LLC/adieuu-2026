/**
 * Crash reporting preference — localStorage only, no React.
 * Used by `useCrashReportingPreference` hook and the `crashReporter` service
 * (which runs outside React and cannot use hooks).
 *
 * Two independent preferences:
 * - `enabled` — whether auto crash reports are sent at all (default: OFF)
 * - `includeUser` — whether to attach account/alias identifiers (default: OFF)
 */

const STORAGE_KEY_ENABLED = 'adieuu.app.crashReportingEnabled';
const STORAGE_KEY_INCLUDE_USER = 'adieuu.app.crashReportingIncludeUser';

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) {
    l();
  }
}

export function getCrashReportingEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY_ENABLED) === '1';
  } catch {
    return false;
  }
}

export function setCrashReportingEnabled(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_ENABLED, value ? '1' : '0');
  } catch {
    return;
  }
  emit();
}

export function getCrashReportingIncludeUser(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY_INCLUDE_USER) === '1';
  } catch {
    return false;
  }
}

export function setCrashReportingIncludeUser(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_INCLUDE_USER, value ? '1' : '0');
  } catch {
    return;
  }
  emit();
}

export function subscribeCrashReportingPreference(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === STORAGE_KEY_ENABLED ||
      e.key === STORAGE_KEY_INCLUDE_USER ||
      e.key === null
    ) {
      onStoreChange();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener('storage', onStorage);
  };
}

export interface CrashReportingPreferenceSnapshot {
  enabled: boolean;
  includeUser: boolean;
}

export function getCrashReportingPreferenceSnapshot(): CrashReportingPreferenceSnapshot {
  return {
    enabled: getCrashReportingEnabled(),
    includeUser: getCrashReportingIncludeUser(),
  };
}
