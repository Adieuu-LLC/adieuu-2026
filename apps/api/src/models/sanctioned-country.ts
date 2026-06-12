/**
 * OFAC and other export-control sanctioned countries (seeded reference data).
 */

import type { BaseDocument } from './base';

export interface PublicSanctionedCountry {
  countryCode: string;
  countryName: string;
  program?: string;
}

export interface SanctionedCountryDocument extends BaseDocument {
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;
  /** Human-readable name for UI lists */
  countryName: string;
  /** Sanctions program identifier, e.g. "OFAC" */
  program?: string;
  /** When false, row is ignored for enforcement */
  active: boolean;
}

export function toPublicSanctionedCountry(
  doc: SanctionedCountryDocument,
): PublicSanctionedCountry {
  return {
    countryCode: doc.countryCode,
    countryName: doc.countryName,
    program: doc.program,
  };
}
