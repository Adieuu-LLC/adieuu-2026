/**
 * Achievement notification preferences.
 *
 * Per-identity localStorage toggles controlling whether achievements
 * show a full popup modal and play a sound, or just show a basic toast.
 * Both default to enabled.
 *
 * @module hooks/useAchievementPreferences
 */

const POPUP_KEY_PREFIX = 'adieuu-achievement-popup-';
const SOUND_KEY_PREFIX = 'adieuu-achievement-sound-';

export interface AchievementPreferences {
  popupEnabled: boolean;
  soundEnabled: boolean;
}

export function loadAchievementPreferences(identityId: string): AchievementPreferences {
  let popupEnabled = true;
  let soundEnabled = true;

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

  return { popupEnabled, soundEnabled };
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
