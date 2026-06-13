import { describe, expect, test } from 'bun:test';
import {
  upsertSanctionedCountryAdminResult,
  runSanctionedCountriesSeedAdminResult,
} from './sanctioned-countries.controller';

describe('upsertSanctionedCountryAdminResult', () => {
  test('rejects invalid country code param', async () => {
    const result = await upsertSanctionedCountryAdminResult('USA', {
      countryName: 'United States',
      active: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('validation_failed');
    }
  });

  test('rejects invalid body', async () => {
    const result = await upsertSanctionedCountryAdminResult('CU', {
      countryName: '',
      active: true,
    });
    expect(result.ok).toBe(false);
  });
});

describe('runSanctionedCountriesSeedAdminResult', () => {
  test('rejects invalid mode', async () => {
    const result = await runSanctionedCountriesSeedAdminResult({ mode: 'replace' });
    expect(result.ok).toBe(false);
  });
});
