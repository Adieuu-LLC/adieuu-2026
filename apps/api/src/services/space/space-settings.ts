/**
 * Reads Space-related platform settings with safe defaults.
 *
 * @module services/space/space-settings
 */

import { PLATFORM_SETTING_KEYS } from '../../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../../repositories/platform-settings.repository';
import elog from '../../utils/adieuuLogger';

/**
 * Returns true when non-admin identities may create new Spaces.
 * Platform admins can always create; missing/invalid docs default to false.
 */
export async function isSpaceCreationEnabled(): Promise<boolean> {
  try {
    const repo = getPlatformSettingsRepository();
    const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.SPACE_CREATION_ENABLED);
    if (doc && doc.valueType === 'boolean') {
      return doc.value === true;
    }
  } catch (err) {
    elog.warn('Failed to read SPACE_CREATION_ENABLED setting', { error: err });
  }
  return false;
}
