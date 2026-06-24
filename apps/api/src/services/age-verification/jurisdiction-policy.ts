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
  /** Raw method slugs from seed data (e.g. 'credit_card', 'email_age_check'). */
  compatibleMethodSlugs: string[];
  /** VerifyMy method name for the least invasive compatible method. */
  leastInvasiveMethod: string;
  legislation: LegislationRef[];
  notes?: string;
  /** VerifyMy business settings ID for this jurisdiction. */
  vmyBusinessSettingsId?: string;
  /** ISO country code the business settings are registered under. */
  vmyBusinessSettingsCountry?: string;
  /** Parent jurisdiction code for fallback resolution. */
  parentJurisdiction?: string;
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
      compatibleMethodSlugs: [],
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

  const verificationConfig = extractVerificationConfig(doc);

  return {
    required: true,
    compatibleMethods: orderedMethods.length > 0 ? orderedMethods : ['Email'],
    compatibleMethodSlugs: doc.compatibleMethods,
    leastInvasiveMethod: leastInvasive,
    legislation: doc.legislation,
    notes: doc.notes,
    vmyBusinessSettingsId: verificationConfig?.vmyBusinessSettingsId,
    vmyBusinessSettingsCountry: verificationConfig?.vmyBusinessSettingsCountry,
    parentJurisdiction: doc.parentJurisdiction,
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

export interface ResolvedBusinessSettings {
  id: string;
  /** ISO country code to send to VerifyMy (matches the business settings registration). */
  country: string;
}

/**
 * Derives the country code from a jurisdiction code when no explicit
 * vmyBusinessSettingsCountry is configured. Takes the portion before the
 * first dash (e.g. "US-TX" -> "US", "DE" -> "DE").
 */
function deriveCountryFromJurisdiction(jurisdiction: string): string {
  return jurisdiction.split('-')[0]!.toUpperCase();
}

/**
 * Resolves the VerifyMy business settings for a verification request.
 *
 * 3-tier fallback:
 *   1. Jurisdiction-specific (from getAgeVerificationPolicy)
 *   2. Parent jurisdiction doc (via parentJurisdiction field)
 *   3. Platform-level default
 *
 * Returns both the business_settings_id and the country code that must
 * accompany it in the VerifyMy API request.
 */
export async function resolveBusinessSettings(
  jurisdiction: string,
  policy: Pick<JurisdictionAgePolicy, 'vmyBusinessSettingsId' | 'vmyBusinessSettingsCountry' | 'parentJurisdiction'> | null,
): Promise<ResolvedBusinessSettings | undefined> {
  // Tier 1: jurisdiction-specific
  const directId = policy?.vmyBusinessSettingsId?.trim();
  if (directId) {
    const country = policy?.vmyBusinessSettingsCountry?.trim()
      || deriveCountryFromJurisdiction(jurisdiction);
    return { id: directId, country };
  }

  // Tier 2: parent jurisdiction
  const parentCode = policy?.parentJurisdiction?.trim();
  if (parentCode) {
    const repo = getJurisdictionRequirementRepository();
    const parentDoc = await repo.findByJurisdiction(parentCode);
    if (parentDoc) {
      const parentConfig = extractVerificationConfig(parentDoc);
      const parentId = parentConfig?.vmyBusinessSettingsId?.trim();
      if (parentId) {
        const country = parentConfig?.vmyBusinessSettingsCountry?.trim()
          || deriveCountryFromJurisdiction(parentCode);
        return { id: parentId, country };
      }
    }
  }

  // Tier 3: platform default
  try {
    const repo = getPlatformSettingsRepository();
    const idDoc = await repo.findByKey(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_VERIFYMY_DEFAULT_BUSINESS_SETTINGS_ID);
    if (idDoc?.valueType === 'string' && typeof idDoc.value === 'string') {
      const trimmedId = idDoc.value.trim();
      if (trimmedId.length > 0) {
        let country = 'US';
        try {
          const countryDoc = await repo.findByKey(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_VERIFYMY_DEFAULT_BUSINESS_SETTINGS_COUNTRY);
          if (countryDoc?.valueType === 'string' && typeof countryDoc.value === 'string') {
            const trimmedCountry = countryDoc.value.trim();
            if (trimmedCountry.length > 0) country = trimmedCountry.toUpperCase();
          }
        } catch {
          // fall through with default 'US'
        }
        return { id: trimmedId, country };
      }
    }
  } catch (err) {
    elog.warn('Failed to read default VerifyMy business settings', { error: err });
  }

  return undefined;
}

/**
 * @deprecated Use resolveBusinessSettings instead. Kept for backward compatibility
 * during migration; will be removed once all callers are updated.
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
