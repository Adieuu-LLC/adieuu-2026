import { describe, expect, test } from 'bun:test';
import { mergeEffectiveAvJurisdictions } from './effective-age-verification-jurisdictions';
import type { PublicJurisdictionRequirement } from './jurisdiction-types';

const catalogRow = (
  overrides: Partial<PublicJurisdictionRequirement> & Pick<PublicJurisdictionRequirement, 'jurisdiction'>,
): PublicJurisdictionRequirement => ({
  jurisdictionName: overrides.jurisdiction,
  region: 'United States',
  requirements: ['age_verification'],
  compatibleMethods: ['email_age_check'],
  legislation: [],
  status: 'enacted',
  ...overrides,
});

describe('mergeEffectiveAvJurisdictions', () => {
  test('returns catalog rows as regulatory source', () => {
    const catalog = [
      catalogRow({ jurisdiction: 'US-TN', jurisdictionName: 'Tennessee', region: 'United States' }),
    ];
    const result = mergeEffectiveAvJurisdictions(catalog, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      jurisdiction: 'US-TN',
      jurisdictionName: 'Tennessee',
      region: 'United States',
      source: 'regulatory',
    });
  });

  test('adds admin overrides not in catalog', () => {
    const result = mergeEffectiveAvJurisdictions([], ['US-CA']);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('admin');
    expect(result[0]?.jurisdiction).toBe('US-CA');
    expect(result[0]?.region).toBe('Admin overrides');
  });

  test('does not duplicate catalog entries when also listed as admin override', () => {
    const catalog = [
      catalogRow({ jurisdiction: 'US-TN', jurisdictionName: 'Tennessee', region: 'United States' }),
    ];
    const result = mergeEffectiveAvJurisdictions(catalog, ['US-TN']);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('regulatory');
  });

  test('enriches admin overrides from lookup rows', () => {
    const enriched = [
      catalogRow({
        jurisdiction: 'US-CA',
        jurisdictionName: 'California',
        region: 'United States',
        requirements: ['other'],
      }),
    ];
    const result = mergeEffectiveAvJurisdictions([], ['US-CA'], enriched);
    expect(result[0]).toEqual({
      jurisdiction: 'US-CA',
      jurisdictionName: 'California',
      region: 'United States',
      source: 'admin',
    });
  });

  test('sorts by region then name', () => {
    const catalog = [
      catalogRow({ jurisdiction: 'GB', jurisdictionName: 'United Kingdom', region: 'Europe' }),
      catalogRow({ jurisdiction: 'US-TN', jurisdictionName: 'Tennessee', region: 'United States' }),
    ];
    const result = mergeEffectiveAvJurisdictions(catalog, []);
    expect(result.map((r) => r.jurisdiction)).toEqual(['GB', 'US-TN']);
  });

  test('normalizes override codes to uppercase', () => {
    const result = mergeEffectiveAvJurisdictions([], [' us-ca ']);
    expect(result[0]?.jurisdiction).toBe('US-CA');
  });
});
