/**
 * Plays optional notification sounds (built-in assets or custom file bytes from disk).
 * No network; custom audio is loaded only via platform capabilities on desktop.
 */

import type { NotificationSoundId } from '../hooks/useNotificationSoundPreference';
import {
  getBuiltinNotificationSoundSrc,
  isBuiltinNotificationSoundId,
} from '../constants/builtinNotificationSounds';
import {
  shouldSuppressInAppToastForConversation,
  type FocusVisibilitySnapshot,
} from './dmNotificationRules';

let cachedBuiltinKey: string | null = null;
let cachedBuiltinAudio: HTMLAudioElement | null = null;

let cachedCustomPath: string | null = null;
let cachedCustomUrl: string | null = null;
let cachedCustomAudio: HTMLAudioElement | null = null;

function revokeCustomUrl(): void {
  if (cachedCustomUrl) {
    URL.revokeObjectURL(cachedCustomUrl);
    cachedCustomUrl = null;
  }
  cachedCustomAudio = null;
  cachedCustomPath = null;
}

/**
 * Whether a notification sound should play given preferences and focus state.
 */
export function shouldPlayNotificationSound(
  enabled: boolean,
  soundId: NotificationSoundId,
  customPath: string | null,
  suppressWhenFocused: boolean,
  isViewingConversation: boolean,
  snapshot: FocusVisibilitySnapshot | null
): boolean {
  if (!enabled || soundId === 'none') {
    return false;
  }
  if (soundId === 'custom' && (!customPath || customPath.length === 0)) {
    return false;
  }
  if (suppressWhenFocused && shouldSuppressInAppToastForConversation(isViewingConversation, snapshot)) {
    return false;
  }
  return true;
}

function getBuiltinSrc(id: Exclude<NotificationSoundId, 'none' | 'custom'>): string {
  return getBuiltinNotificationSoundSrc(id);
}

async function playBuiltin(id: Exclude<NotificationSoundId, 'none' | 'custom'>): Promise<void> {
  const src = getBuiltinSrc(id);
  const key = `builtin:${src}`;
  if (cachedBuiltinKey !== key || !cachedBuiltinAudio) {
    cachedBuiltinKey = key;
    cachedBuiltinAudio = new Audio(src);
    cachedBuiltinAudio.preload = 'auto';
  }
  try {
    cachedBuiltinAudio.currentTime = 0;
    await cachedBuiltinAudio.play();
  } catch {
    // Autoplay policy or missing asset; ignore
  }
}

async function playCustom(
  path: string,
  loadCustomSound: (p: string) => Promise<ArrayBuffer | null>
): Promise<void> {
  if (cachedCustomPath !== path) {
    revokeCustomUrl();
    cachedCustomPath = path;
    const buf = await loadCustomSound(path);
    if (!buf || buf.byteLength === 0) {
      revokeCustomUrl();
      return;
    }
    const blob = new Blob([buf]);
    cachedCustomUrl = URL.createObjectURL(blob);
    cachedCustomAudio = new Audio(cachedCustomUrl);
    cachedCustomAudio.preload = 'auto';
  }
  if (!cachedCustomAudio) return;
  try {
    cachedCustomAudio.currentTime = 0;
    await cachedCustomAudio.play();
  } catch {
    // Ignore playback errors
  }
}

export interface PlayNotificationSoundOptions {
  enabled: boolean;
  soundId: NotificationSoundId;
  customPath: string | null;
  suppressWhenFocused: boolean;
  isViewingConversation: boolean;
  snapshot: FocusVisibilitySnapshot | null;
  /** Required when soundId is 'custom' and path is set */
  loadCustomSound?: (path: string) => Promise<ArrayBuffer | null>;
}

/**
 * Plays the configured notification sound if preferences allow.
 */
export async function playNotificationSound(options: PlayNotificationSoundOptions): Promise<void> {
  const {
    enabled,
    soundId,
    customPath,
    suppressWhenFocused,
    isViewingConversation,
    snapshot,
    loadCustomSound,
  } = options;

  if (
    !shouldPlayNotificationSound(
      enabled,
      soundId,
      customPath,
      suppressWhenFocused,
      isViewingConversation,
      snapshot
    )
  ) {
    return;
  }

  if (soundId === 'custom') {
    if (!customPath || !loadCustomSound) {
      return;
    }
    await playCustom(customPath, loadCustomSound);
    return;
  }

  if (isBuiltinNotificationSoundId(soundId)) {
    await playBuiltin(soundId);
  }
}

/**
 * Preview helper for settings: plays regardless of focus suppression.
 */
export async function previewNotificationSound(options: {
  soundId: NotificationSoundId;
  customPath: string | null;
  loadCustomSound?: (path: string) => Promise<ArrayBuffer | null>;
}): Promise<void> {
  const { soundId, customPath, loadCustomSound } = options;
  if (soundId === 'none') return;
  if (soundId === 'custom') {
    if (!customPath || !loadCustomSound) return;
    await playCustom(customPath, loadCustomSound);
    return;
  }
  if (isBuiltinNotificationSoundId(soundId)) {
    await playBuiltin(soundId);
  }
}

/** Clears cached custom blob URL (e.g. when user picks a new file). */
export function invalidateNotificationSoundCustomCache(): void {
  revokeCustomUrl();
}
