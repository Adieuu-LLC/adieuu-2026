import { describe, expect, mock, test } from 'bun:test';

const mockUpdateJurisdictionVerificationConfigForAdmin = mock(() => Promise.resolve(null));

mock.module('../../services/compliance/jurisdiction-requirements-admin.service', () => ({
  listJurisdictionRequirementsForAdmin: mock(() => Promise.resolve([])),
  runJurisdictionRequirementsSeed: mock(() => Promise.resolve({ upserted: 0 })),
  updateJurisdictionVerificationConfigForAdmin: mockUpdateJurisdictionVerificationConfigForAdmin,
}));

import {
  updateJurisdictionVerificationConfigAdminResult,
  runJurisdictionRequirementsSeedAdminResult,
} from './jurisdiction-requirements.controller';

describe('updateJurisdictionVerificationConfigAdminResult', () => {
  test('rejects invalid jurisdiction param', async () => {
    const result = await updateJurisdictionVerificationConfigAdminResult('', {
      vmyBusinessSettingsId: 'bs-123',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('validation_failed');
    }
  });

  test('returns not_found when jurisdiction row does not exist', async () => {
    mockUpdateJurisdictionVerificationConfigForAdmin.mockResolvedValueOnce(null);

    const result = await updateJurisdictionVerificationConfigAdminResult('US-TN', {
      vmyBusinessSettingsId: 'bs-123',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('not_found');
    }
  });

  test('returns jurisdiction when update succeeds', async () => {
    mockUpdateJurisdictionVerificationConfigForAdmin.mockResolvedValueOnce({
      jurisdiction: 'US-TN',
      jurisdictionName: 'Tennessee',
      region: 'United States',
      status: 'enacted',
      verificationConfig: { vmyBusinessSettingsId: 'bs-123' },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });

    const result = await updateJurisdictionVerificationConfigAdminResult('US-TN', {
      vmyBusinessSettingsId: 'bs-123',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.jurisdiction.verificationConfig?.vmyBusinessSettingsId).toBe('bs-123');
    }
  });
});

describe('runJurisdictionRequirementsSeedAdminResult', () => {
  test('rejects invalid mode', async () => {
    const result = await runJurisdictionRequirementsSeedAdminResult({ mode: 'replace' });
    expect(result.ok).toBe(false);
  });
});
