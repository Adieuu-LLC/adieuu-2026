/**
 * Notification sound preferences in localStorage — no React.
 * Hooks in `useNotificationSoundPreference` subscribe via `useSyncExternalStore`;
 * tests import this module so they never load the `react` package graph.
 */

import {
  BUILTIN_NOTIFICATION_SOUND_ID_SET,
  DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID,
} from '../constants/builtinNotificationSounds';
import type { BuiltinNotificationSoundId } from '../constants/builtinNotificationSounds';
import {
  MAX_NOTIFICATION_GAIN,
  type NotificationSoundId,
} from '../constants/notificationSoundPreferenceShared';

export type { NotificationSoundId };
export { MAX_NOTIFICATION_GAIN };

const STORAGE_KEY_ENABLED = 'adieuu.app.notificationSoundEnabled';
const STORAGE_KEY_SOUND_ID = 'adieuu.app.notificationSoundId';
const STORAGE_KEY_CUSTOM_PATH = 'adieuu.app.notificationSoundCustomPath';
const STORAGE_KEY_SUPPRESS_FOCUSED = 'adieuu.app.notificationSoundSuppressWhenFocused';
const STORAGE_KEY_VOLUME = 'adieuu.app.notificationSoundVolume';

const DEFAULT_VOLUME = 1;

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

export function subscribeNotificationSoundPreference(onStoreChange: () => void): () => void {
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

// ---------------------------------------------------------------------------
// TTL (disappearing message) notification sound
// ---------------------------------------------------------------------------

const TTL_STORAGE_KEY_SOUND_ID = 'adieuu.app.ttlNotificationSoundId';
const TTL_STORAGE_KEY_CUSTOM_PATH = 'adieuu.app.ttlNotificationSoundCustomPath';
const TTL_STORAGE_KEY_VOLUME = 'adieuu.app.ttlNotificationSoundVolume';

export const DEFAULT_TTL_NOTIFICATION_SOUND_ID: BuiltinNotificationSoundId = 'adieuu_click';

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

export function subscribeTtlNotificationSoundPreference(onStoreChange: () => void): () => void {
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

// ---------------------------------------------------------------------------
// Mention notification sound
// ---------------------------------------------------------------------------

const MENTION_STORAGE_KEY_SOUND_ID = 'adieuu.app.mentionNotificationSoundId';
const MENTION_STORAGE_KEY_CUSTOM_PATH = 'adieuu.app.mentionNotificationSoundCustomPath';
const MENTION_STORAGE_KEY_VOLUME = 'adieuu.app.mentionNotificationSoundVolume';

export const DEFAULT_MENTION_NOTIFICATION_SOUND_ID: BuiltinNotificationSoundId = 'adieuu_mention';

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

export function subscribeMentionNotificationSoundPreference(onStoreChange: () => void): () => void {
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
