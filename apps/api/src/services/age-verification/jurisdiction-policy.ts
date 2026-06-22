/**
 * Jurisdiction age-verification policy module.
 *
 * Queries the existing jurisdiction_requirements collection (seeded with
 * regulatory data) to determine whether a jurisdiction requires age
 * verification, and which methods are compatible.
 *
 * Admin overrides (additive jurisdictions, required-mode) are applied on top.
 */

import { requirementImpliesAgeVerification } from '@adieuu/shared';
import { PLATFORM_SETTING_KEYS } from '../../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../../repositories/platform-settings.repository';
import { getJurisdictionRequirementRepository } from '../../repositories/jurisdiction-requirement.repository';
import {
  extractVerificationConfig,
  type LegislationRef,
} from '../../models/jurisdiction-requirement';
import elog from '../../utils/adieuuLogger';

/**
 * Maps seed-data compatible method slugs to VerifyMy method names,
 * ordered from least to most invasive.
 */
const METHOD_ESCALATION_ORDER: ReadonlyArray<{ slug: string; verifyMyMethod: string }> = [
  { slug: 'email_age_check', verifyMyMethod: 'Email' },
  { slug: 'mobile_phone', verifyMyMethod: 'Mobile' },
  { slug: 'credit_card', verifyMyMethod: 'CreditCard' },
  { slug: 'facial_age_estimation', verifyMyMethod: 'AgeEstimation' },
  { slug: 'double_blind', verifyMyMethod: 'DoubleBlind' },
  { slug: 'double_blind_facial_age_estimation', verifyMyMethod: 'DoubleBlind' },
  { slug: 'id_scan_face_match', verifyMyMethod: 'IDScanFaceMatch' },
];

export interface JurisdictionAgePolicy {
  required: boolean;
  compatibleMethods: string[];
  /** VerifyMy method name for the least invasive compatible method. */
  leastInvasiveMethod: string;
  legislation: LegislationRef[];
  notes?: string;
  /** VerifyMy business settings ID for this jurisdiction (US states). */
  vmyBusinessSettingsId?: string;
}

/**
 * Returns the age verification policy for a jurisdiction, or null if
 * no requirements exist in the seed data or admin overrides.
 */
export async function getAgeVerificationPolicy(
  jurisdiction: string,
): Promise<JurisdictionAgePolicy | null> {
  const repo = getJurisdictionRequirementRepository();
  const doc = await repo.findByJurisdiction(jurisdiction);

  if (!doc) {
    const isOverride = await isAdminOverrideJurisdiction(jurisdiction);
    if (!isOverride) return null;

    return {
      required: true,
      compatibleMethods: ['Email'],
      leastInvasiveMethod: 'Email',
      legislation: [],
    };
  }

  const hasAvRequirement = doc.requirements.some((r) => requirementImpliesAgeVerification(r));
  if (!hasAvRequirement) {
    const isOverride = await isAdminOverrideJurisdiction(jurisdiction);
    if (!isOverride) return null;
  }

  const orderedMethods = METHOD_ESCALATION_ORDER
    .filter((m) => doc.compatibleMethods.includes(m.slug))
    .map((m) => m.verifyMyMethod);

  const leastInvasive = orderedMethods[0] ?? 'Email';

  return {
    required: true,
    compatibleMethods: orderedMethods.length > 0 ? orderedMethods : ['Email'],
    leastInvasiveMethod: leastInvasive,
    legislation: doc.legislation,
    notes: doc.notes,
    vmyBusinessSettingsId: extractVerificationConfig(doc)?.vmyBusinessSettingsId,
  };
}

/**
 * Returns true if the jurisdiction requires age verification
 * (from seed data or admin overrides).
 */
export async function requiresAgeVerification(jurisdiction: string): Promise<boolean> {
  const requiredMode = await getRequiredMode();
  if (requiredMode === 'all') return true;

  const repo = getJurisdictionRequirementRepository();
  const doc = await repo.findByJurisdiction(jurisdiction);

  if (doc && doc.requirements.some((r) => requirementImpliesAgeVerification(r))) {
    return true;
  }

  return isAdminOverrideJurisdiction(jurisdiction);
}

async function getRequiredMode(): Promise<'jurisdictions' | 'all'> {
  try {
    const repo = getPlatformSettingsRepository();
    const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_REQUIRED_MODE);
    if (doc?.valueType === 'string' && doc.value === 'all') return 'all';
  } catch (err) {
    elog.warn('Failed to read AV required mode setting', { error: err });
  }
  return 'jurisdictions';
}

async function isAdminOverrideJurisdiction(jurisdiction: string): Promise<boolean> {
  try {
    const repo = getPlatformSettingsRepository();
    const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_REQUIRED_JURISDICTIONS);
    if (doc?.valueType === 'stringArray' && Array.isArray(doc.value)) {
      const upper = jurisdiction.toUpperCase();
      return (doc.value as string[]).some((j) => j.trim().toUpperCase() === upper);
    }
  } catch (err) {
    elog.warn('Failed to read AV required jurisdictions setting', { error: err });
  }
  return false;
}

/**
 * Resolves the VerifyMy business_settings_id for a verification request.
 * Returns the jurisdiction-specific ID if configured, otherwise the
 * platform-level default, or undefined if neither is set.
 */
export async function resolveBusinessSettingsId(
  jurisdictionId: string | undefined,
): Promise<string | undefined> {
  const trimmedJurisdictionId = jurisdictionId?.trim();
  if (trimmedJurisdictionId) return trimmedJurisdictionId;

  try {
    const repo = getPlatformSettingsRepository();
    const doc = await repo.findByKey(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_VERIFYMY_DEFAULT_BUSINESS_SETTINGS_ID);
    if (doc?.valueType === 'string' && typeof doc.value === 'string') {
      const trimmedValue = doc.value.trim();
      if (trimmedValue.length > 0) return trimmedValue;
    }
  } catch (err) {
    elog.warn('Failed to read default VerifyMy business settings ID', { error: err });
  }
  return undefined;
}
