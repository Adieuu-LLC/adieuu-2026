export const MIN_CHECK_INTERVAL_MINUTES = 60;
export const DEFAULT_CHECK_INTERVAL_MINUTES = 60;

export interface UpdatePreferences {
  autoCheckEnabled: boolean;
  autoDownloadEnabled: boolean;
  checkIntervalMinutes: number;
}

export const DEFAULT_UPDATE_PREFS: UpdatePreferences = {
  autoCheckEnabled: true,
  autoDownloadEnabled: false,
  checkIntervalMinutes: DEFAULT_CHECK_INTERVAL_MINUTES,
};

export function normalizeUpdatePreferences(
  parsed: Partial<UpdatePreferences>,
  defaults: UpdatePreferences = DEFAULT_UPDATE_PREFS,
): UpdatePreferences {
  return {
    autoCheckEnabled: typeof parsed.autoCheckEnabled === 'boolean'
      ? parsed.autoCheckEnabled
      : defaults.autoCheckEnabled,
    autoDownloadEnabled: typeof parsed.autoDownloadEnabled === 'boolean'
      ? parsed.autoDownloadEnabled
      : defaults.autoDownloadEnabled,
    checkIntervalMinutes:
      typeof parsed.checkIntervalMinutes === 'number'
        && parsed.checkIntervalMinutes >= MIN_CHECK_INTERVAL_MINUTES
        ? parsed.checkIntervalMinutes
        : defaults.checkIntervalMinutes,
  };
}
