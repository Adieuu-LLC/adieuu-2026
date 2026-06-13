/**
 * OFAC comprehensive sanctions country seed data.
 *
 * Source: U.S. Treasury OFAC Sanctions Programs
 * https://ofac.treasury.gov/sanctions-programs-and-country-information
 *
 * These are countries/regions subject to U.S. sanctions where
 * transactions are or may be prohibited. Maintainers should review Treasury
 * guidance periodically and re-run the seed script after updates.
 *
 * Accounts or Aliases that establish a session from an active OFAC/sanctioned location are permanently banned immediately,
 * and self-attesting sanctioned residency on VPN also results in a permanent ban.
 * 
 * Additional countries can be manually added through admin UI.
 * 
 * 'program` value is metadata/display only, allowing for list to expand/replace OFAC where applicable (e.g. if hosting where OFAC does not apply)
 */

import type { SanctionedCountryDocument } from '../models/sanctioned-country';

type SeedRow = Omit<SanctionedCountryDocument, '_id' | 'createdAt' | 'updatedAt'>;

export const SANCTIONED_COUNTRY_SEED: SeedRow[] = [
  {
    countryCode: 'AF',
    countryName: 'Afghanistan',
    program: 'OFAC',
    active: true,
  },
  {
    countryCode: 'MM',
    countryName: 'Myanmar',
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
    countryCode: 'CU',
    countryName: 'Cuba',
    program: 'OFAC',
    active: true,
  },
  {
    countryCode: 'IQ',
    countryName: 'Iraq',
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
    countryCode: 'LB',
    countryName: 'Lebanon',
    program: 'OFAC',
    active: true,
  },
  {
    countryCode: 'LY',
    countryName: 'Libya',
    program: 'OFAC',
    active: true,
  },
  {
    countryCode: 'ML',
    countryName: 'Mali',
    program: 'OFAC',
    active: true,
  },
  {
    countryCode: 'NI',
    countryName: 'Nicaragua',
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
    countryCode: 'SO',
    countryName: 'Somalia',
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
    countryCode: 'VE',
    countryName: 'Venezuela',
    program: 'OFAC',
    active: true,
  },
  {
    countryCode: 'YE',
    countryName: 'Yemen',
    program: 'OFAC',
    active: true,
  },
];
