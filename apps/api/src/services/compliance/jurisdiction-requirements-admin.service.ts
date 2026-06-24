/**
 * Admin list, verification-config patch, and seed operations for jurisdiction requirements.
 */

import { AGE_VERIFICATION_REQUIREMENT_SLUGS } from '@adieuu/shared';
import { JURISDICTION_REQUIREMENT_SEED } from '../../data/jurisdiction-requirements.seed';
import {
  toAdminJurisdictionRequirement,
  type AdminJurisdictionRequirement,
} from '../../models/jurisdiction-requirement';
import { getJurisdictionRequirementRepository } from '../../repositories/jurisdiction-requirement.repository';
import { sanitizeString } from '../../utils/sanitize';

export type JurisdictionRequirementSeedMode = 'additive' | 'clobber';

export interface UpdateJurisdictionVerificationConfigInput {
  jurisdiction: string;
  vmyBusinessSettingsId?: string;
  vmyBusinessSettingsCountry?: string;
}

export interface RunJurisdictionRequirementSeedResult {
  upserted: number;
}

function normalizeJurisdictionCode(raw: string): string | null {
  const { value } = sanitizeString(raw, 'alphanumdash');
  const code = value.trim().toUpperCase();
  if (!code || code.length > 32) return null;
  return code;
}

function normalizeBusinessSettingsId(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const { value } = sanitizeString(raw, 'general');
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 128) {
    throw new Error('vmyBusinessSettingsId exceeds maximum length of 128 characters');
  }
  return trimmed;
}

function normalizeCountryCode(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const { value } = sanitizeString(raw, 'alphanumdash');
  const trimmed = value.trim().toUpperCase();
  if (!trimmed || trimmed.length > 8) return undefined;
  return trimmed;
}

/** @internal test helper */
export function parseJurisdictionVerificationConfigInput(
  input: UpdateJurisdictionVerificationConfigInput,
): { jurisdiction: string; vmyBusinessSettingsId?: string; vmyBusinessSettingsCountry?: string } | null {
  const jurisdiction = normalizeJurisdictionCode(input.jurisdiction);
  if (!jurisdiction) return null;
  return {
    jurisdiction,
    vmyBusinessSettingsId: normalizeBusinessSettingsId(input.vmyBusinessSettingsId),
    vmyBusinessSettingsCountry: normalizeCountryCode(input.vmyBusinessSettingsCountry),
  };
}

export async function listJurisdictionRequirementsForAdmin(): Promise<AdminJurisdictionRequirement[]> {
  const repo = getJurisdictionRequirementRepository();
  const docs = await repo.findRequiringAgeVerification(AGE_VERIFICATION_REQUIREMENT_SLUGS);
  return docs.map(toAdminJurisdictionRequirement);
}

export async function updateJurisdictionVerificationConfigForAdmin(
  input: UpdateJurisdictionVerificationConfigInput,
): Promise<AdminJurisdictionRequirement | null> {
  const jurisdiction = normalizeJurisdictionCode(input.jurisdiction);
  if (!jurisdiction) return null;

  const vmyBusinessSettingsId = normalizeBusinessSettingsId(input.vmyBusinessSettingsId);
  const vmyBusinessSettingsCountry = normalizeCountryCode(input.vmyBusinessSettingsCountry);
  const repo = getJurisdictionRequirementRepository();
  const doc = await repo.patchVerificationConfig(jurisdiction, {
    vmyBusinessSettingsId,
    vmyBusinessSettingsCountry,
  });
  return doc ? toAdminJurisdictionRequirement(doc) : null;
}

export async function runJurisdictionRequirementsSeed(
  mode: JurisdictionRequirementSeedMode,
): Promise<RunJurisdictionRequirementSeedResult> {
  const repo = getJurisdictionRequirementRepository();
  let upserted = 0;

  for (const row of JURISDICTION_REQUIREMENT_SEED) {
    await repo.upsertSeedRow(row, {
      preserveVerificationConfig: mode === 'additive',
    });
    upserted += 1;
  }

  return { upserted };
}
