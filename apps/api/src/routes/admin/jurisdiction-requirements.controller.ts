/**
 * Admin routes for jurisdiction regulatory requirements.
 */

import { z } from '@adieuu/shared/schemas';
import { sanitizeString } from '../../utils/sanitize';
import {
  listJurisdictionRequirementsForAdmin,
  runJurisdictionRequirementsSeed,
  updateJurisdictionVerificationConfigForAdmin,
  type JurisdictionRequirementSeedMode,
} from '../../services/compliance/jurisdiction-requirements-admin.service';

const UpdateVerificationConfigSchema = z.object({
  vmyBusinessSettingsId: z.string().max(128).optional(),
});

const RunSeedSchema = z.object({
  mode: z.enum(['additive', 'clobber']),
});

function parseJurisdictionParam(raw: string): string | null {
  const { value } = sanitizeString(raw, 'alphanumdash');
  const code = value.trim().toUpperCase();
  if (!code || code.length > 32) return null;
  return code;
}

export async function listJurisdictionRequirementsAdminResult() {
  const jurisdictions = await listJurisdictionRequirementsForAdmin();
  return { ok: true as const, jurisdictions };
}

export async function updateJurisdictionVerificationConfigAdminResult(
  jurisdictionParam: string,
  body: unknown,
) {
  const jurisdiction = parseJurisdictionParam(jurisdictionParam);
  if (!jurisdiction) {
    return { ok: false as const, reason: 'validation_failed' as const };
  }

  const parsed = UpdateVerificationConfigSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false as const, reason: 'validation_failed' as const };
  }

  const row = await updateJurisdictionVerificationConfigForAdmin({
    jurisdiction,
    vmyBusinessSettingsId: parsed.data.vmyBusinessSettingsId,
  });

  if (!row) {
    return { ok: false as const, reason: 'not_found' as const };
  }

  return { ok: true as const, jurisdiction: row };
}

export async function runJurisdictionRequirementsSeedAdminResult(body: unknown) {
  const parsed = RunSeedSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false as const, reason: 'validation_failed' as const };
  }

  const result = await runJurisdictionRequirementsSeed(
    parsed.data.mode as JurisdictionRequirementSeedMode,
  );
  const jurisdictions = await listJurisdictionRequirementsForAdmin();
  return { ok: true as const, result, jurisdictions };
}
