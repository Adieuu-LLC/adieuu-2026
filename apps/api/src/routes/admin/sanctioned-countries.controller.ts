/**
 * Admin routes for OFAC / export-control sanctioned countries.
 */

import { z } from '@adieuu/shared/schemas';
import { sanitizeString } from '../../utils/sanitize';
import {
  listSanctionedCountriesForAdmin,
  runSanctionedCountriesSeed,
  upsertSanctionedCountryForAdmin,
  type SanctionedCountrySeedMode,
} from '../../services/compliance/sanctioned-countries-admin.service';

const UpsertSanctionedCountrySchema = z.object({
  countryName: z.string().min(1).max(128),
  program: z.string().max(32).optional(),
  active: z.boolean(),
});

const RunSeedSchema = z.object({
  mode: z.enum(['additive', 'clobber']),
});

function parseCountryCodeParam(raw: string): string | null {
  const { value } = sanitizeString(raw, 'alphanumdash');
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

export async function listSanctionedCountriesAdminResult() {
  const countries = await listSanctionedCountriesForAdmin();
  return { ok: true as const, countries };
}

export async function upsertSanctionedCountryAdminResult(
  countryCodeParam: string,
  body: unknown,
) {
  const countryCode = parseCountryCodeParam(countryCodeParam);
  if (!countryCode) {
    return { ok: false as const, reason: 'validation_failed' as const };
  }

  const parsed = UpsertSanctionedCountrySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false as const, reason: 'validation_failed' as const };
  }

  const country = await upsertSanctionedCountryForAdmin({
    countryCode,
    countryName: parsed.data.countryName,
    program: parsed.data.program,
    active: parsed.data.active,
  });

  if (!country) {
    return { ok: false as const, reason: 'validation_failed' as const };
  }

  return { ok: true as const, country };
}

export async function runSanctionedCountriesSeedAdminResult(body: unknown) {
  const parsed = RunSeedSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false as const, reason: 'validation_failed' as const };
  }

  const result = await runSanctionedCountriesSeed(parsed.data.mode as SanctionedCountrySeedMode);
  const countries = await listSanctionedCountriesForAdmin();
  return { ok: true as const, result, countries };
}
