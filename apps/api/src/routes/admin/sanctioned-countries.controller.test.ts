import { describe, expect, mock, test } from 'bun:test';

const mockUpsertSanctionedCountryForAdmin = mock(() => Promise.resolve(null));

mock.module('../../services/compliance/sanctioned-countries-admin.service', () => ({
  listSanctionedCountriesForAdmin: mock(() => Promise.resolve([])),
  runSanctionedCountriesSeed: mock(() => Promise.resolve({ upserted: 0, deactivated: 0 })),
  upsertSanctionedCountryForAdmin: mockUpsertSanctionedCountryForAdmin,
}));

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

  test('returns upsert_failed when service upsert returns null', async () => {
    mockUpsertSanctionedCountryForAdmin.mockResolvedValueOnce(null);

    const result = await upsertSanctionedCountryAdminResult('CU', {
      countryName: 'Cuba',
      active: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('upsert_failed');
    }
  });
});

describe('runSanctionedCountriesSeedAdminResult', () => {
  test('rejects invalid mode', async () => {
    const result = await runSanctionedCountriesSeedAdminResult({ mode: 'replace' });
    expect(result.ok).toBe(false);
  });
});
