import type {
  ActivityInterval,
  ActivityPreferences,
  ActivityTrackingMode,
} from '../hooks/useDeviceManagement';

export const ACTIVITY_PREFS_KEY = 'adieuu-activity-prefs';

export function getActivityPreferences(): ActivityPreferences {
  if (typeof localStorage === 'undefined') {
    return { mode: 'disabled', intervalMinutes: 15 };
  }

  try {
    const stored = localStorage.getItem(ACTIVITY_PREFS_KEY);
    if (!stored) return { mode: 'disabled', intervalMinutes: 15 };
    const parsed = JSON.parse(stored) as Partial<ActivityPreferences>;
    const mode: ActivityTrackingMode =
      parsed.mode === 'periodic' || parsed.mode === 'disabled' || parsed.mode === 'active-only'
        ? parsed.mode
        : 'disabled';
    const interval: ActivityInterval =
      parsed.intervalMinutes === 15 ||
      parsed.intervalMinutes === 30 ||
      parsed.intervalMinutes === 60
        ? parsed.intervalMinutes
        : 15;
    return { mode, intervalMinutes: interval };
  } catch {
    return { mode: 'disabled', intervalMinutes: 15 };
  }
}

export function saveActivityPreferences(prefs: ActivityPreferences): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ACTIVITY_PREFS_KEY, JSON.stringify(prefs));
}
