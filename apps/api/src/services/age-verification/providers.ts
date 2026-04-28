/**
 * Age verification provider registry.
 *
 * Maps provider IDs to implementations. The active provider is
 * selected via the AGE_VERIFICATION_ACTIVE_PROVIDER platform setting.
 */

import { PLATFORM_SETTING_KEYS } from '../../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../../repositories/platform-settings.repository';
import type { AgeVerificationProvider } from './provider';
import { VerifyMyProvider } from './verifymy.provider';

const registry = new Map<string, AgeVerificationProvider>();

function ensureRegistered(): void {
  if (registry.size > 0) return;
  const verifymy = new VerifyMyProvider();
  registry.set(verifymy.id, verifymy);
}

/**
 * Returns the currently active age verification provider based on
 * the platform setting, falling back to 'verifymy'.
 */
export async function getActiveProvider(): Promise<AgeVerificationProvider> {
  ensureRegistered();

  let providerId = 'verifymy';
  try {
    const repo = getPlatformSettingsRepository();
    const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_ACTIVE_PROVIDER);
    if (doc?.valueType === 'string' && typeof doc.value === 'string' && doc.value.length > 0) {
      providerId = doc.value;
    }
  } catch {
    // fall through to default
  }

  const provider = registry.get(providerId);
  if (!provider) {
    throw new Error(`Age verification provider '${providerId}' is not registered`);
  }
  return provider;
}

export function getProviderById(id: string): AgeVerificationProvider | undefined {
  ensureRegistered();
  return registry.get(id);
}
