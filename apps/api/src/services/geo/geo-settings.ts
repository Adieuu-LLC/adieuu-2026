/**
 * Reads the GEO_LOOKUP_ENABLED platform setting, falling back to
 * the env-level config.geo.enabled default.
 *
 * Separated so the geo service does not depend on the full
 * platform-settings module at the type level.
 */

import { config } from '../../config';
import { PLATFORM_SETTING_KEYS } from '../../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../../repositories/platform-settings.repository';
import elog from '../../utils/adieuuLogger';

/**
 * Returns true when geo lookups are enabled. The platform setting
 * (writable from the admin UI) takes precedence over the env default
 * so operators can toggle without a redeploy.
 */
export async function isGeoLookupEnabled(): Promise<boolean> {
  try {
    const repo = getPlatformSettingsRepository();
    const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.GEO_LOOKUP_ENABLED);
    if (doc && doc.valueType === 'boolean') {
      return doc.value === true;
    }
  } catch (err) {
    elog.warn('Failed to read GEO_LOOKUP_ENABLED setting; using env default', { error: err });
  }

  return config.geo.enabled;
}
