/**
 * Admin CRUD and seed operations for OFAC / export-control sanctioned countries.
 */

import { SANCTIONED_COUNTRY_SEED } from '../../data/sanctioned-countries.seed';
import {
  toAdminSanctionedCountry,
  type AdminSanctionedCountry,
  type SanctionedCountryDocument,
} from '../../models/sanctioned-country';
import { getSanctionedCountryRepository } from '../../repositories/sanctioned-country.repository';
import { invalidateSanctionedCountriesCache } from './compliance-enforcement.service';
import { sanitizeString } from '../../utils/sanitize';

export type SanctionedCountrySeedMode = 'additive' | 'clobber';

export interface UpsertSanctionedCountryInput {
  countryCode: string;
  countryName: string;
  program?: string;
  active: boolean;
}

export interface RunSanctionedCountrySeedResult {
  upserted: number;
  deactivated: number;
}

function normalizeCountryCode(raw: string): string | null {
  const { value } = sanitizeString(raw, 'alphanumdash');
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

function normalizeCountryName(raw: string): string | null {
  const { value } = sanitizeString(raw, 'general');
  const name = value.trim();
  if (!name || name.length > 128) return null;
  return name;
}

function normalizeProgram(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const { value } = sanitizeString(raw, 'alphanumdash');
  const program = value.trim();
  if (!program || program.length > 32) return undefined;
  return program;
}

export async function listSanctionedCountriesForAdmin(): Promise<AdminSanctionedCountry[]> {
  const repo = getSanctionedCountryRepository();
  const docs = await repo.findAll();
  return docs.map(toAdminSanctionedCountry);
}

export async function upsertSanctionedCountryForAdmin(
  input: UpsertSanctionedCountryInput,
): Promise<AdminSanctionedCountry | null> {
  const countryCode = normalizeCountryCode(input.countryCode);
  const countryName = normalizeCountryName(input.countryName);
  const program = normalizeProgram(input.program);
  if (!countryCode || !countryName) return null;

  const repo = getSanctionedCountryRepository();
  await repo.upsertSeedRow({
    countryCode,
    countryName,
    program,
    active: input.active === true,
  });

  await invalidateSanctionedCountriesCache();

  const doc = await repo.findActiveByCountryCode(countryCode);
  if (doc) return toAdminSanctionedCountry(doc);

  const all = await repo.findAll();
  const match = all.find((row) => row.countryCode === countryCode);
  return match ? toAdminSanctionedCountry(match) : null;
}

export async function runSanctionedCountriesSeed(
  mode: SanctionedCountrySeedMode,
): Promise<RunSanctionedCountrySeedResult> {
  const repo = getSanctionedCountryRepository();
  let upserted = 0;

  for (const row of SANCTIONED_COUNTRY_SEED) {
    await repo.upsertSeedRow(row);
    upserted += 1;
  }

  let deactivated = 0;
  if (mode === 'clobber') {
    const seedCodes = SANCTIONED_COUNTRY_SEED.map((row) => row.countryCode);
    deactivated = await repo.deactivateNotIn(seedCodes);
  }

  await invalidateSanctionedCountriesCache();

  return { upserted, deactivated };
}

/** @internal test helper */
export function parseSanctionedCountryInput(
  input: UpsertSanctionedCountryInput,
): Omit<SanctionedCountryDocument, '_id' | 'createdAt' | 'updatedAt'> | null {
  const countryCode = normalizeCountryCode(input.countryCode);
  const countryName = normalizeCountryName(input.countryName);
  const program = normalizeProgram(input.program);
  if (!countryCode || !countryName) return null;
  return {
    countryCode,
    countryName,
    program,
    active: input.active === true,
  };
}
