/**
 * OFAC comprehensive sanctions country seed data.
 *
 * Source: U.S. Treasury OFAC Sanctions Programs
 * https://ofac.treasury.gov/sanctions-programs-and-country-information
 *
 * These are countries/regions subject to comprehensive U.S. sanctions where
 * virtually all transactions are prohibited. Maintainers should review Treasury
 * guidance periodically and re-run the seed script after updates.
 */

import type { SanctionedCountryDocument } from '../../src/models/sanctioned-country';

type SeedRow = Omit<SanctionedCountryDocument, '_id' | 'createdAt' | 'updatedAt'>;

export const SANCTIONED_COUNTRY_SEED: SeedRow[] = [
  {
    countryCode: 'CU',
    countryName: 'Cuba',
    program: 'OFAC',
    active: true,
  },
  {
    countryCode: 'IR',
    countryName: 'Iran',
    program: 'OFAC',
    active: true,
  },
  {
    countryCode: 'KP',
    countryName: 'North Korea',
    program: 'OFAC',
    active: true,
  },
  {
    countryCode: 'SY',
    countryName: 'Syria',
    program: 'OFAC',
    active: true,
  },
  {
    countryCode: 'RU',
    countryName: 'Russia',
    program: 'OFAC',
    active: true,
  },
  {
    countryCode: 'BY',
    countryName: 'Belarus',
    program: 'OFAC',
    active: true,
  },
  {
    countryCode: 'VE',
    countryName: 'Venezuela',
    program: 'OFAC',
    active: true,
  },
];
