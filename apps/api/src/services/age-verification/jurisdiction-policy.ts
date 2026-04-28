/**
 * Jurisdiction age-verification policy module.
 *
 * Queries the existing jurisdiction_requirements collection (seeded with
 * regulatory data) to determine whether a jurisdiction requires age
 * verification, and which methods are compatible.
 *
 * Admin overrides (additive jurisdictions, required-mode) are applied on top.
 */

import { PLATFORM_SETTING_KEYS } from '../../constants/platform-settings-keys';
import { getPlatformSettingsRepository } from '../../repositories/platform-settings.repository';
import { getJurisdictionRequirementRepository } from '../../repositories/jurisdiction-requirement.repository';
import type { LegislationRef } from '../../models/jurisdiction-requirement';
import elog from '../../utils/adieuuLogger';

/** Requirement slugs that imply age verification is needed. */
const AV_REQUIREMENT_SLUGS = new Set([
  'age_verification',
  'highly_effective_age_assurance',
  'appropriate_age_assurance',
  'reliable_age_and_identity_verification',
  'age_assurance',
]);

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

  const hasAvRequirement = doc.requirements.some((r) => AV_REQUIREMENT_SLUGS.has(r));
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

  if (doc && doc.requirements.some((r) => AV_REQUIREMENT_SLUGS.has(r))) {
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
