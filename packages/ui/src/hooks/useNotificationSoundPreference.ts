/**
 * Client-side preferences for notification sounds (built-in presets or custom file on desktop).
 * Stored in localStorage; never uploads custom audio to any server.
 */

import { useSyncExternalStore } from 'react';
import {
  BUILTIN_NOTIFICATION_SOUND_ID_SET,
  DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID,
} from '../constants/builtinNotificationSounds';
import type { BuiltinNotificationSoundId } from '../constants/builtinNotificationSounds';

export type NotificationSoundId = BuiltinNotificationSoundId | 'none' | 'custom';

const STORAGE_KEY_ENABLED = 'adieuu.app.notificationSoundEnabled';
const STORAGE_KEY_SOUND_ID = 'adieuu.app.notificationSoundId';
const STORAGE_KEY_CUSTOM_PATH = 'adieuu.app.notificationSoundCustomPath';
const STORAGE_KEY_SUPPRESS_FOCUSED = 'adieuu.app.notificationSoundSuppressWhenFocused';
const STORAGE_KEY_VOLUME = 'adieuu.app.notificationSoundVolume';

const DEFAULT_VOLUME = 1;

/** Gain multiplier 0 (silent) through 2 (200% / +6 dB nominal). Exported for UI + playback clamp. */
export const MAX_NOTIFICATION_GAIN = 2;

function clampNotificationGain(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(MAX_NOTIFICATION_GAIN, Math.max(0, n));
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) {
    l();
  }
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
    const v = localStorage.getItem(STORAGE_KEY_SOUND_ID);
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

/**
 * Notification sound gain (0–2, i.e. 0–200%). Applies only to DM notification sounds, not other app audio.
 * Persisted as an integer 0–200 (percentage of unity gain; 100 = 100%, 200 = 200% boost).
 */
export function getNotificationSoundVolume(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_VOLUME;
  try {
    const v = localStorage.getItem(STORAGE_KEY_VOLUME);
    if (v === null) return DEFAULT_VOLUME;
    if (v.includes('.')) {
      const f = parseFloat(v);
      return Number.isFinite(f) ? clampNotificationGain(f) : DEFAULT_VOLUME;
    }
    const units = parseInt(v, 10);
    if (!Number.isFinite(units)) return DEFAULT_VOLUME;
    return clampNotificationGain(units / 100);
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function setNotificationSoundVolume(gain: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const units = Math.round(clampNotificationGain(gain) * 100);
    localStorage.setItem(STORAGE_KEY_VOLUME, String(units));
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
      e.key === STORAGE_KEY_VOLUME ||
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
  /** Gain for notification sounds only (0–2, i.e. 0–200%). */
  volume: number;
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
  const volume = getNotificationSoundVolume();

  if (
    cachedClientSnapshot &&
    cachedClientSnapshot.enabled === enabled &&
    cachedClientSnapshot.soundId === soundId &&
    cachedClientSnapshot.customPath === customPath &&
    cachedClientSnapshot.suppressWhenFocused === suppressWhenFocused &&
    cachedClientSnapshot.volume === volume
  ) {
    return cachedClientSnapshot;
  }

  cachedClientSnapshot = {
    enabled,
    soundId,
    customPath,
    suppressWhenFocused,
    volume,
  };
  return cachedClientSnapshot;
}

const SERVER_SNAPSHOT: NotificationSoundPreferenceSnapshot = {
  enabled: true,
  soundId: DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID,
  customPath: null,
  suppressWhenFocused: true,
  volume: DEFAULT_VOLUME,
};

export function useNotificationSoundPreference(): NotificationSoundPreferenceSnapshot {
  return useSyncExternalStore(
    subscribeNotificationSoundPreference,
    getSnapshot,
    () => SERVER_SNAPSHOT
  );
}

// ---------------------------------------------------------------------------
// TTL (disappearing message) notification sound — independent sound/volume,
// shared enabled + suppressWhenFocused with the main preference.
// ---------------------------------------------------------------------------

const TTL_STORAGE_KEY_SOUND_ID = 'adieuu.app.ttlNotificationSoundId';
const TTL_STORAGE_KEY_CUSTOM_PATH = 'adieuu.app.ttlNotificationSoundCustomPath';
const TTL_STORAGE_KEY_VOLUME = 'adieuu.app.ttlNotificationSoundVolume';

export const DEFAULT_TTL_NOTIFICATION_SOUND_ID: BuiltinNotificationSoundId = 'hype';

export function getTtlNotificationSoundId(): NotificationSoundId {
  if (typeof localStorage === 'undefined') return DEFAULT_TTL_NOTIFICATION_SOUND_ID;
  try {
    const v = localStorage.getItem(TTL_STORAGE_KEY_SOUND_ID);
    if (isValidSoundId(v)) return v;
    return DEFAULT_TTL_NOTIFICATION_SOUND_ID;
  } catch {
    return DEFAULT_TTL_NOTIFICATION_SOUND_ID;
  }
}

export function setTtlNotificationSoundId(value: NotificationSoundId): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TTL_STORAGE_KEY_SOUND_ID, value);
  } catch {
    return;
  }
  emit();
}

export function getTtlNotificationSoundCustomPath(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(TTL_STORAGE_KEY_CUSTOM_PATH);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setTtlNotificationSoundCustomPath(path: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (path === null || path === '') {
      localStorage.removeItem(TTL_STORAGE_KEY_CUSTOM_PATH);
    } else {
      localStorage.setItem(TTL_STORAGE_KEY_CUSTOM_PATH, path);
    }
  } catch {
    return;
  }
  emit();
}

export function getTtlNotificationSoundVolume(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_VOLUME;
  try {
    const v = localStorage.getItem(TTL_STORAGE_KEY_VOLUME);
    if (v === null) return DEFAULT_VOLUME;
    if (v.includes('.')) {
      const f = parseFloat(v);
      return Number.isFinite(f) ? clampNotificationGain(f) : DEFAULT_VOLUME;
    }
    const units = parseInt(v, 10);
    if (!Number.isFinite(units)) return DEFAULT_VOLUME;
    return clampNotificationGain(units / 100);
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function setTtlNotificationSoundVolume(gain: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const units = Math.round(clampNotificationGain(gain) * 100);
    localStorage.setItem(TTL_STORAGE_KEY_VOLUME, String(units));
  } catch {
    return;
  }
  emit();
}

function subscribeTtlNotificationSoundPreference(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === STORAGE_KEY_ENABLED ||
      e.key === STORAGE_KEY_SUPPRESS_FOCUSED ||
      e.key === TTL_STORAGE_KEY_SOUND_ID ||
      e.key === TTL_STORAGE_KEY_CUSTOM_PATH ||
      e.key === TTL_STORAGE_KEY_VOLUME ||
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

let cachedTtlSnapshot: NotificationSoundPreferenceSnapshot | null = null;

function getTtlSnapshot(): NotificationSoundPreferenceSnapshot {
  const enabled = getNotificationSoundEnabled();
  const soundId = getTtlNotificationSoundId();
  const customPath = getTtlNotificationSoundCustomPath();
  const suppressWhenFocused = getNotificationSoundSuppressWhenFocused();
  const volume = getTtlNotificationSoundVolume();

  if (
    cachedTtlSnapshot &&
    cachedTtlSnapshot.enabled === enabled &&
    cachedTtlSnapshot.soundId === soundId &&
    cachedTtlSnapshot.customPath === customPath &&
    cachedTtlSnapshot.suppressWhenFocused === suppressWhenFocused &&
    cachedTtlSnapshot.volume === volume
  ) {
    return cachedTtlSnapshot;
  }

  cachedTtlSnapshot = { enabled, soundId, customPath, suppressWhenFocused, volume };
  return cachedTtlSnapshot;
}

const TTL_SERVER_SNAPSHOT: NotificationSoundPreferenceSnapshot = {
  enabled: true,
  soundId: DEFAULT_TTL_NOTIFICATION_SOUND_ID,
  customPath: null,
  suppressWhenFocused: true,
  volume: DEFAULT_VOLUME,
};

export function useTtlNotificationSoundPreference(): NotificationSoundPreferenceSnapshot {
  return useSyncExternalStore(
    subscribeTtlNotificationSoundPreference,
    getTtlSnapshot,
    () => TTL_SERVER_SNAPSHOT
  );
}

// ---------------------------------------------------------------------------
// Mention notification sound — independent sound/volume,
// shared enabled + suppressWhenFocused with the main preference.
// ---------------------------------------------------------------------------

const MENTION_STORAGE_KEY_SOUND_ID = 'adieuu.app.mentionNotificationSoundId';
const MENTION_STORAGE_KEY_CUSTOM_PATH = 'adieuu.app.mentionNotificationSoundCustomPath';
const MENTION_STORAGE_KEY_VOLUME = 'adieuu.app.mentionNotificationSoundVolume';

export const DEFAULT_MENTION_NOTIFICATION_SOUND_ID: BuiltinNotificationSoundId = 'magic';

export function getMentionNotificationSoundId(): NotificationSoundId {
  if (typeof localStorage === 'undefined') return DEFAULT_MENTION_NOTIFICATION_SOUND_ID;
  try {
    const v = localStorage.getItem(MENTION_STORAGE_KEY_SOUND_ID);
    if (isValidSoundId(v)) return v;
    return DEFAULT_MENTION_NOTIFICATION_SOUND_ID;
  } catch {
    return DEFAULT_MENTION_NOTIFICATION_SOUND_ID;
  }
}

export function setMentionNotificationSoundId(value: NotificationSoundId): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MENTION_STORAGE_KEY_SOUND_ID, value);
  } catch {
    return;
  }
  emit();
}

export function getMentionNotificationSoundCustomPath(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(MENTION_STORAGE_KEY_CUSTOM_PATH);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setMentionNotificationSoundCustomPath(path: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (path === null || path === '') {
      localStorage.removeItem(MENTION_STORAGE_KEY_CUSTOM_PATH);
    } else {
      localStorage.setItem(MENTION_STORAGE_KEY_CUSTOM_PATH, path);
    }
  } catch {
    return;
  }
  emit();
}

export function getMentionNotificationSoundVolume(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_VOLUME;
  try {
    const v = localStorage.getItem(MENTION_STORAGE_KEY_VOLUME);
    if (v === null) return DEFAULT_VOLUME;
    if (v.includes('.')) {
      const f = parseFloat(v);
      return Number.isFinite(f) ? clampNotificationGain(f) : DEFAULT_VOLUME;
    }
    const units = parseInt(v, 10);
    if (!Number.isFinite(units)) return DEFAULT_VOLUME;
    return clampNotificationGain(units / 100);
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function setMentionNotificationSoundVolume(gain: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const units = Math.round(clampNotificationGain(gain) * 100);
    localStorage.setItem(MENTION_STORAGE_KEY_VOLUME, String(units));
  } catch {
    return;
  }
  emit();
}

function subscribeMentionNotificationSoundPreference(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === STORAGE_KEY_ENABLED ||
      e.key === STORAGE_KEY_SUPPRESS_FOCUSED ||
      e.key === MENTION_STORAGE_KEY_SOUND_ID ||
      e.key === MENTION_STORAGE_KEY_CUSTOM_PATH ||
      e.key === MENTION_STORAGE_KEY_VOLUME ||
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

let cachedMentionSnapshot: NotificationSoundPreferenceSnapshot | null = null;

function getMentionSnapshot(): NotificationSoundPreferenceSnapshot {
  const enabled = getNotificationSoundEnabled();
  const soundId = getMentionNotificationSoundId();
  const customPath = getMentionNotificationSoundCustomPath();
  const suppressWhenFocused = getNotificationSoundSuppressWhenFocused();
  const volume = getMentionNotificationSoundVolume();

  if (
    cachedMentionSnapshot &&
    cachedMentionSnapshot.enabled === enabled &&
    cachedMentionSnapshot.soundId === soundId &&
    cachedMentionSnapshot.customPath === customPath &&
    cachedMentionSnapshot.suppressWhenFocused === suppressWhenFocused &&
    cachedMentionSnapshot.volume === volume
  ) {
    return cachedMentionSnapshot;
  }

  cachedMentionSnapshot = { enabled, soundId, customPath, suppressWhenFocused, volume };
  return cachedMentionSnapshot;
}

const MENTION_SERVER_SNAPSHOT: NotificationSoundPreferenceSnapshot = {
  enabled: true,
  soundId: DEFAULT_MENTION_NOTIFICATION_SOUND_ID,
  customPath: null,
  suppressWhenFocused: true,
  volume: DEFAULT_VOLUME,
};

export function useMentionNotificationSoundPreference(): NotificationSoundPreferenceSnapshot {
  return useSyncExternalStore(
    subscribeMentionNotificationSoundPreference,
    getMentionSnapshot,
    () => MENTION_SERVER_SNAPSHOT
  );
}
