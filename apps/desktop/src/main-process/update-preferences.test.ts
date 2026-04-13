import { describe, it, expect } from 'bun:test';
import {
  normalizeUpdatePreferences,
  DEFAULT_UPDATE_PREFS,
  MIN_CHECK_INTERVAL_MINUTES,
} from './update-preferences';

describe('normalizeUpdatePreferences', () => {
  it('fills missing fields from defaults', () => {
    expect(normalizeUpdatePreferences({})).toEqual(DEFAULT_UPDATE_PREFS);
  });

  it('respects valid partial overrides', () => {
    expect(
      normalizeUpdatePreferences({
        autoCheckEnabled: false,
        checkIntervalMinutes: 120,
      }),
    ).toEqual({
      autoCheckEnabled: false,
      autoDownloadEnabled: DEFAULT_UPDATE_PREFS.autoDownloadEnabled,
      checkIntervalMinutes: 120,
    });
  });

  it('rejects check interval below minimum', () => {
    expect(
      normalizeUpdatePreferences({
        checkIntervalMinutes: MIN_CHECK_INTERVAL_MINUTES - 1,
      }).checkIntervalMinutes,
    ).toBe(DEFAULT_UPDATE_PREFS.checkIntervalMinutes);
  });
});
