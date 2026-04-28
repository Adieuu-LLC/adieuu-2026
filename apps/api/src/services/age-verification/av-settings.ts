/**
 * Reads age-verification and geofence platform settings with fallbacks.
 *
 * Separated so the alias gate and orchestration service don't depend
 * on the full platform-settings module at the type level.
 */

import { PLATFORM_SETTING_KEYS } from '../../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../../repositories/platform-settings.repository';
import elog from '../../utils/adieuuLogger';

/**
 * Returns true when age verification enforcement is enabled.
 */
export async function isAgeVerificationEnabled(): Promise<boolean> {
  try {
    const repo = getPlatformSettingsRepository();
    const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_ENABLED);
    if (doc && doc.valueType === 'boolean') {
      return doc.value === true;
    }
  } catch (err) {
    elog.warn('Failed to read AGE_VERIFICATION_ENABLED setting', { error: err });
  }
  return false;
}

/**
 * Returns the set of jurisdictions that are completely blocked (geofenced).
 */
export async function getBlockedJurisdictions(): Promise<Set<string>> {
  try {
    const repo = getPlatformSettingsRepository();
    const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.GEOFENCE_BLOCKED_JURISDICTIONS);
    if (doc?.valueType === 'stringArray' && Array.isArray(doc.value)) {
      return new Set((doc.value as string[]).map((j) => j.trim().toUpperCase()).filter(Boolean));
    }
  } catch (err) {
    elog.warn('Failed to read GEOFENCE_BLOCKED_JURISDICTIONS setting', { error: err });
  }
  return new Set();
}

/**
 * Returns the law-link URL for a jurisdiction, if configured.
 * Format in the setting: "US-TN|https://..."
 */
/**
 * Returns the current required mode: 'all' means every account must verify
 * regardless of jurisdiction; 'jurisdictions' means only jurisdictions with
 * matching seed data or admin overrides.
 */
export async function getRequiredMode(): Promise<'jurisdictions' | 'all'> {
  try {
    const repo = getPlatformSettingsRepository();
    const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_REQUIRED_MODE);
    if (doc?.valueType === 'string' && doc.value === 'all') return 'all';
  } catch (err) {
    elog.warn('Failed to read AV required mode setting', { error: err });
  }
  return 'jurisdictions';
}

export async function getLawLinkForJurisdiction(jurisdiction: string): Promise<string | undefined> {
  try {
    const repo = getPlatformSettingsRepository();
    const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.GEOFENCE_LAW_LINKS);
    if (doc?.valueType === 'stringArray' && Array.isArray(doc.value)) {
      const upper = jurisdiction.toUpperCase();
      for (const entry of doc.value as string[]) {
        const pipeIdx = entry.indexOf('|');
        if (pipeIdx === -1) continue;
        const code = entry.slice(0, pipeIdx).trim().toUpperCase();
        if (code === upper) return entry.slice(pipeIdx + 1).trim();
      }
    }
  } catch (err) {
    elog.warn('Failed to read GEOFENCE_LAW_LINKS setting', { error: err });
  }
  return undefined;
}
