/**
 * Achievement notification preferences.
 *
 * Per-identity localStorage toggles controlling whether achievements
 * show a full popup modal and play a sound, or just show a basic toast.
 * Both default to enabled.
 *
 * Also stores which built-in (or custom) sound plays on unlock and gain.
 *
 * @module hooks/useAchievementPreferences
 */

import {
  BUILTIN_NOTIFICATION_SOUND_ID_SET,
  DEFAULT_ACHIEVEMENT_NOTIFICATION_SOUND_ID,
} from '../constants/builtinNotificationSounds';
import {
  MAX_NOTIFICATION_GAIN,
  type NotificationSoundId,
} from '../constants/notificationSoundPreferenceShared';

const POPUP_KEY_PREFIX = 'adieuu-achievement-popup-';
const SOUND_KEY_PREFIX = 'adieuu-achievement-sound-';
const SOUND_ID_KEY_PREFIX = 'adieuu-achievement-sound-id-';
const SOUND_CUSTOM_PATH_KEY_PREFIX = 'adieuu-achievement-sound-custom-';
const SOUND_VOLUME_KEY_PREFIX = 'adieuu-achievement-sound-volume-';

const DEFAULT_VOLUME = 1;

function clampGain(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_VOLUME;
  return Math.min(MAX_NOTIFICATION_GAIN, Math.max(0, n));
}

function isValidNotificationSoundId(value: string | null): value is NotificationSoundId {
  if (value === null) return false;
  if (value === 'none' || value === 'custom') return true;
  return BUILTIN_NOTIFICATION_SOUND_ID_SET.has(value);
}

function parseStoredVolume(raw: string | null): number {
  if (raw === null) return DEFAULT_VOLUME;
  try {
    if (raw.includes('.')) {
      const f = parseFloat(raw);
      return Number.isFinite(f) ? clampGain(f) : DEFAULT_VOLUME;
    }
    const units = parseInt(raw, 10);
    if (!Number.isFinite(units)) return DEFAULT_VOLUME;
    return clampGain(units / 100);
  } catch {
    return DEFAULT_VOLUME;
  }
}

export interface AchievementPreferences {
  popupEnabled: boolean;
  soundEnabled: boolean;
  achievementSoundId: NotificationSoundId;
  achievementSoundCustomPath: string | null;
  achievementSoundVolume: number;
}

export function loadAchievementPreferences(identityId: string): AchievementPreferences {
  let popupEnabled = true;
  let soundEnabled = true;
  let achievementSoundId: NotificationSoundId = DEFAULT_ACHIEVEMENT_NOTIFICATION_SOUND_ID;
  let achievementSoundCustomPath: string | null = null;
  let achievementSoundVolume = DEFAULT_VOLUME;

  try {
    const popup = localStorage.getItem(POPUP_KEY_PREFIX + identityId);
    if (popup !== null) popupEnabled = JSON.parse(popup) as boolean;
  } catch {
    // Ignore parse errors
  }

  try {
    const sound = localStorage.getItem(SOUND_KEY_PREFIX + identityId);
    if (sound !== null) soundEnabled = JSON.parse(sound) as boolean;
  } catch {
    // Ignore parse errors
  }

  try {
    const id = localStorage.getItem(SOUND_ID_KEY_PREFIX + identityId);
    if (id !== null && isValidNotificationSoundId(id)) {
      achievementSoundId = id;
    }
  } catch {
    // Ignore
  }

  try {
    const p = localStorage.getItem(SOUND_CUSTOM_PATH_KEY_PREFIX + identityId);
    achievementSoundCustomPath = p && p.length > 0 ? p : null;
  } catch {
    // Ignore
  }

  try {
    const v = localStorage.getItem(SOUND_VOLUME_KEY_PREFIX + identityId);
    achievementSoundVolume = parseStoredVolume(v);
  } catch {
    // Ignore
  }

  return {
    popupEnabled,
    soundEnabled,
    achievementSoundId,
    achievementSoundCustomPath,
    achievementSoundVolume,
  };
}

export function saveAchievementPopupEnabled(
  identityId: string,
  enabled: boolean
): void {
  try {
    localStorage.setItem(POPUP_KEY_PREFIX + identityId, JSON.stringify(enabled));
  } catch {
    // Storage full or unavailable
  }
}

export function saveAchievementSoundEnabled(
  identityId: string,
  enabled: boolean
): void {
  try {
    localStorage.setItem(SOUND_KEY_PREFIX + identityId, JSON.stringify(enabled));
  } catch {
    // Storage full or unavailable
  }
}

export function saveAchievementSoundId(
  identityId: string,
  soundId: NotificationSoundId
): void {
  try {
    localStorage.setItem(SOUND_ID_KEY_PREFIX + identityId, soundId);
  } catch {
    // Storage full or unavailable
  }
}

export function saveAchievementSoundCustomPath(
  identityId: string,
  path: string | null
): void {
  try {
    if (path === null || path === '') {
      localStorage.removeItem(SOUND_CUSTOM_PATH_KEY_PREFIX + identityId);
    } else {
      localStorage.setItem(SOUND_CUSTOM_PATH_KEY_PREFIX + identityId, path);
    }
  } catch {
    // Storage full or unavailable
  }
}

export function saveAchievementSoundVolume(identityId: string, gain: number): void {
  try {
    const units = Math.round(clampGain(gain) * 100);
    localStorage.setItem(SOUND_VOLUME_KEY_PREFIX + identityId, String(units));
  } catch {
    // Storage full or unavailable
  }
}
