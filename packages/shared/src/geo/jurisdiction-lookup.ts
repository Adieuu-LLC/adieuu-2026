/**
 * Derives which jurisdiction codes to request from GET /api/geo/requirements
 * so parent regions (e.g. EU DSA) are included alongside member-state rows.
 */

/** EU member state ISO 3166-1 alpha-2 codes (post-UK exit). */
const EU_MEMBER_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

export interface GeoSessionSlice {
  jurisdiction: string;
  countryCode: string;
}

/**
 * Returns deduped jurisdiction codes to look up, including `EU` when the
 * user is in an EU member state (for EU-wide DSA and cross-cutting rules).
 */
export function expandedJurisdictionCodesForRequirements(geo: GeoSessionSlice): string[] {
  const codes = new Set<string>();
  codes.add(geo.jurisdiction.trim().toUpperCase());
  const country = geo.countryCode.trim().toUpperCase();
  if (EU_MEMBER_COUNTRIES.has(country)) {
    codes.add('EU');
  }
  /** Proposed federal bill; show for any Canadian connection. */
  if (country === 'CA') {
    codes.add('CA-PROPOSED');
  }
  return [...codes];
}
