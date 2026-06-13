import { describe, expect, test } from 'bun:test';
import { parseSanctionedCountryInput } from './sanctioned-countries-admin.service';

describe('parseSanctionedCountryInput', () => {
  test('accepts valid ISO country code and name', () => {
    const parsed = parseSanctionedCountryInput({
      countryCode: 'cu',
      countryName: 'Cuba',
      program: 'OFAC',
      active: true,
    });
    expect(parsed).toEqual({
      countryCode: 'CU',
      countryName: 'Cuba',
      program: 'OFAC',
      active: true,
    });
  });

  test('rejects invalid country code', () => {
    const parsed = parseSanctionedCountryInput({
      countryCode: 'USA',
      countryName: 'United States',
      active: true,
    });
    expect(parsed).toBeNull();
  });

  test('rejects empty country name', () => {
    const parsed = parseSanctionedCountryInput({
      countryCode: 'CU',
      countryName: '   ',
      active: true,
    });
    expect(parsed).toBeNull();
  });
});
