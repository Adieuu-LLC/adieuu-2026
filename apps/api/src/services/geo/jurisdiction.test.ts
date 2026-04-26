import { describe, expect, test } from 'bun:test';
import {
  toJurisdictionCode,
  isStateAwareCountry,
  parseJurisdictionList,
  resolveRegionCode,
  fromIpLocateResult,
} from './jurisdiction';

describe('isStateAwareCountry', () => {
  test('returns true for US and CA', () => {
    expect(isStateAwareCountry('US')).toBe(true);
    expect(isStateAwareCountry('CA')).toBe(true);
    expect(isStateAwareCountry('us')).toBe(true);
  });

  test('returns false for non-state-aware countries', () => {
    expect(isStateAwareCountry('IT')).toBe(false);
    expect(isStateAwareCountry('GB')).toBe(false);
    expect(isStateAwareCountry('DE')).toBe(false);
  });
});

describe('toJurisdictionCode', () => {
  test('US with region produces US-TN', () => {
    expect(toJurisdictionCode({ countryCode: 'US', regionCode: 'TN' })).toBe('US-TN');
  });

  test('US without region produces US', () => {
    expect(toJurisdictionCode({ countryCode: 'US' })).toBe('US');
  });

  test('CA with region produces CA-ON', () => {
    expect(toJurisdictionCode({ countryCode: 'CA', regionCode: 'ON' })).toBe('CA-ON');
  });

  test('non-state-aware country ignores region', () => {
    expect(toJurisdictionCode({ countryCode: 'GB', regionCode: 'ENG' })).toBe('GB');
  });

  test('normalises to uppercase', () => {
    expect(toJurisdictionCode({ countryCode: 'us', regionCode: 'tn' })).toBe('US-TN');
    expect(toJurisdictionCode({ countryCode: 'it' })).toBe('IT');
  });
});

describe('resolveRegionCode', () => {
  test('maps US state names to codes', () => {
    expect(resolveRegionCode('US', 'Tennessee')).toBe('TN');
    expect(resolveRegionCode('US', 'California')).toBe('CA');
    expect(resolveRegionCode('US', 'new york')).toBe('NY');
  });

  test('maps CA province names to codes', () => {
    expect(resolveRegionCode('CA', 'Ontario')).toBe('ON');
    expect(resolveRegionCode('CA', 'British Columbia')).toBe('BC');
  });

  test('returns undefined for unknown names', () => {
    expect(resolveRegionCode('US', 'Atlantis')).toBeUndefined();
  });

  test('returns undefined for non-state-aware countries', () => {
    expect(resolveRegionCode('IT', 'Lazio')).toBeUndefined();
  });

  test('returns undefined when subdivisionName is absent', () => {
    expect(resolveRegionCode('US', undefined)).toBeUndefined();
  });
});

describe('fromIpLocateResult', () => {
  test('resolves US result with subdivision', () => {
    const result = fromIpLocateResult({
      countryCode: 'US',
      subdivisionName: 'Tennessee',
    });
    expect(result).toEqual({
      jurisdiction: 'US-TN',
      countryCode: 'US',
      regionCode: 'TN',
    });
  });

  test('resolves country-only for non-state-aware', () => {
    const result = fromIpLocateResult({
      countryCode: 'IT',
      subdivisionName: 'Lazio',
    });
    expect(result).toEqual({
      jurisdiction: 'IT',
      countryCode: 'IT',
      regionCode: undefined,
    });
  });

  test('returns null for empty countryCode', () => {
    expect(fromIpLocateResult({ countryCode: '' })).toBeNull();
  });
});

describe('parseJurisdictionList', () => {
  test('normalises and deduplicates', () => {
    const result = parseJurisdictionList(['US-TN', ' it ', 'US-TN', 'de']);
    expect(result).toEqual(new Set(['US-TN', 'IT', 'DE']));
  });

  test('ignores empty strings', () => {
    const result = parseJurisdictionList(['', '  ', 'GB']);
    expect(result).toEqual(new Set(['GB']));
  });

  test('empty input yields empty set', () => {
    expect(parseJurisdictionList([])).toEqual(new Set());
  });
});
