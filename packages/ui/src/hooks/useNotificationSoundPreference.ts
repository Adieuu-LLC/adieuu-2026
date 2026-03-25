/**
 * Client-side preferences for notification sounds (built-in presets or custom file on desktop).
 * Stored in localStorage; never uploads custom audio to any server.
 */

import { useSyncExternalStore } from 'react';
import {
  BUILTIN_NOTIFICATION_SOUND_ID_SET,
  DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID,
  LEGACY_NOTIFICATION_SOUND_ID_MAP,
} from '../constants/builtinNotificationSounds';
import type { BuiltinNotificationSoundId } from '../constants/builtinNotificationSounds';

export type NotificationSoundId = BuiltinNotificationSoundId | 'none' | 'custom';

const STORAGE_KEY_ENABLED = 'adieuu.app.notificationSoundEnabled';
const STORAGE_KEY_SOUND_ID = 'adieuu.app.notificationSoundId';
const STORAGE_KEY_CUSTOM_PATH = 'adieuu.app.notificationSoundCustomPath';
const STORAGE_KEY_SUPPRESS_FOCUSED = 'adieuu.app.notificationSoundSuppressWhenFocused';

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) {
    l();
  }
}

function normalizeStoredSoundId(raw: string | null): string | null {
  if (raw === null) return null;
  return LEGACY_NOTIFICATION_SOUND_ID_MAP[raw] ?? raw;
}

function isValidSoundId(value: string | null): value is NotificationSoundId {
  if (value === null) return false;
  if (value === 'none' || value === 'custom') return true;
  return BUILTIN_NOTIFICATION_SOUND_ID_SET.has(value);
}

export function getNotificationSoundEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    const v = localStorage.getItem(STORAGE_KEY_ENABLED);
    if (v === null) return true;
    return v === '1';
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_ENABLED, value ? '1' : '0');
  } catch {
    return;
  }
  emit();
}

export function getNotificationSoundId(): NotificationSoundId {
  if (typeof localStorage === 'undefined') return DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID;
  try {
    const v = normalizeStoredSoundId(localStorage.getItem(STORAGE_KEY_SOUND_ID));
    if (isValidSoundId(v)) return v;
    return DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID;
  } catch {
    return DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID;
  }
}

export function setNotificationSoundId(value: NotificationSoundId): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_SOUND_ID, value);
  } catch {
    return;
  }
  emit();
}

export function getNotificationSoundCustomPath(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY_CUSTOM_PATH);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setNotificationSoundCustomPath(path: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (path === null || path === '') {
      localStorage.removeItem(STORAGE_KEY_CUSTOM_PATH);
    } else {
      localStorage.setItem(STORAGE_KEY_CUSTOM_PATH, path);
    }
  } catch {
    return;
  }
  emit();
}

export function getNotificationSoundSuppressWhenFocused(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    const v = localStorage.getItem(STORAGE_KEY_SUPPRESS_FOCUSED);
    if (v === null) return true;
    return v === '1';
  } catch {
    return true;
  }
}

export function setNotificationSoundSuppressWhenFocused(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_SUPPRESS_FOCUSED, value ? '1' : '0');
  } catch {
    return;
  }
  emit();
}

function subscribeNotificationSoundPreference(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === STORAGE_KEY_ENABLED ||
      e.key === STORAGE_KEY_SOUND_ID ||
      e.key === STORAGE_KEY_CUSTOM_PATH ||
      e.key === STORAGE_KEY_SUPPRESS_FOCUSED ||
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

export interface NotificationSoundPreferenceSnapshot {
  enabled: boolean;
  soundId: NotificationSoundId;
  customPath: string | null;
  suppressWhenFocused: boolean;
}

/**
 * React requires getSnapshot to return a cached reference when values are unchanged;
 * a fresh object each call triggers infinite re-renders (useSyncExternalStore + Object.is).
 */
let cachedClientSnapshot: NotificationSoundPreferenceSnapshot | null = null;

function getSnapshot(): NotificationSoundPreferenceSnapshot {
  const enabled = getNotificationSoundEnabled();
  const soundId = getNotificationSoundId();
  const customPath = getNotificationSoundCustomPath();
  const suppressWhenFocused = getNotificationSoundSuppressWhenFocused();

  if (
    cachedClientSnapshot &&
    cachedClientSnapshot.enabled === enabled &&
    cachedClientSnapshot.soundId === soundId &&
    cachedClientSnapshot.customPath === customPath &&
    cachedClientSnapshot.suppressWhenFocused === suppressWhenFocused
  ) {
    return cachedClientSnapshot;
  }

  cachedClientSnapshot = {
    enabled,
    soundId,
    customPath,
    suppressWhenFocused,
  };
  return cachedClientSnapshot;
}

const SERVER_SNAPSHOT: NotificationSoundPreferenceSnapshot = {
  enabled: true,
  soundId: DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID,
  customPath: null,
  suppressWhenFocused: true,
};

export function useNotificationSoundPreference(): NotificationSoundPreferenceSnapshot {
  return useSyncExternalStore(
    subscribeNotificationSoundPreference,
    getSnapshot,
    () => SERVER_SNAPSHOT
  );
}
