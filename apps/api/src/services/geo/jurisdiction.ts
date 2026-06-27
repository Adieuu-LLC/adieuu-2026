/**
 * Pure jurisdiction helpers — no I/O, fully unit-testable.
 *
 * A "jurisdiction code" is an ISO 3166-1 alpha-2 country code, optionally
 * combined with a region code for state-aware countries (US, CA).
 * Examples: 'US-TN', 'US-CA', 'CA-ON', 'IT', 'DE', 'GB'.
 */

import type { IpLocateResult } from './iplocate.client';

const STATE_AWARE_COUNTRIES = new Set(['US', 'CA']);

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY',
  'district of columbia': 'DC',
  'american samoa': 'AS', 'guam': 'GU', 'northern mariana islands': 'MP',
  'puerto rico': 'PR', 'u.s. virgin islands': 'VI',
};

const CA_PROVINCE_NAME_TO_CODE: Record<string, string> = {
  'alberta': 'AB', 'british columbia': 'BC', 'manitoba': 'MB',
  'new brunswick': 'NB', 'newfoundland and labrador': 'NL',
  'northwest territories': 'NT', 'nova scotia': 'NS', 'nunavut': 'NU',
  'ontario': 'ON', 'prince edward island': 'PE', 'quebec': 'QC',
  'saskatchewan': 'SK', 'yukon': 'YT',
};

/**
 * Returns true if the given country's sub-national regions are tracked
 * individually for regulatory purposes.
 */
export function isStateAwareCountry(countryCode: string): boolean {
  return STATE_AWARE_COUNTRIES.has(countryCode.toUpperCase());
}

/**
 * Produces a canonical jurisdiction code from a country + optional region.
 *
 * For state-aware countries (US, CA), the region is appended with a hyphen
 * when present.  For all others, only the country code is returned.
 */
export function toJurisdictionCode(input: {
  countryCode: string;
  regionCode?: string;
}): string {
  const country = input.countryCode.toUpperCase();

  if (isStateAwareCountry(country) && input.regionCode) {
    return `${country}-${input.regionCode.toUpperCase()}`;
  }

  return country;
}

/**
 * Resolves a subdivision name to an ISO 3166-2 region code for
 * state-aware countries. Returns undefined for unknown names or
 * countries we don't track at sub-national level.
 */
export function resolveRegionCode(
  countryCode: string,
  subdivisionName?: string,
): string | undefined {
  if (!subdivisionName) return undefined;
  const key = subdivisionName.toLowerCase().trim();
  const country = countryCode.toUpperCase();

  if (country === 'US') return US_STATE_NAME_TO_CODE[key];
  if (country === 'CA') return CA_PROVINCE_NAME_TO_CODE[key];
  return undefined;
}

/**
 * Convenience: derive jurisdiction + regionCode directly from an
 * IPLocate result. Returns null if the result has no country code.
 */
export function fromIpLocateResult(result: IpLocateResult): {
  jurisdiction: string;
  countryCode: string;
  regionCode?: string;
} | null {
  if (!result.countryCode) return null;

  const countryCode = result.countryCode.toUpperCase();
  const regionCode = resolveRegionCode(countryCode, result.subdivisionName);
  const jurisdiction = toJurisdictionCode({ countryCode, regionCode });

  return { jurisdiction, countryCode, regionCode };
}

/**
 * Parses a platform-setting string array into a normalised Set of
 * jurisdiction codes. Used by the geofence and age-verification layers.
 */
export function parseJurisdictionList(setting: string[]): Set<string> {
  const result = new Set<string>();
  for (const raw of setting) {
    const trimmed = raw.trim().toUpperCase();
    if (trimmed.length > 0) {
      result.add(trimmed);
    }
  }
  return result;
}
