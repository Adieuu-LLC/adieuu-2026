import { describe, expect, mock, test } from 'bun:test';

const mockListJurisdictionRequirementsForAdmin = mock(() => Promise.resolve([]));
const mockUpdateJurisdictionVerificationConfigForAdmin = mock(() => Promise.resolve(null));
const mockRunJurisdictionRequirementsSeed = mock(() => Promise.resolve({ upserted: 0 }));

mock.module('../../services/compliance/jurisdiction-requirements-admin.service', () => ({
  listJurisdictionRequirementsForAdmin: mockListJurisdictionRequirementsForAdmin,
  runJurisdictionRequirementsSeed: mockRunJurisdictionRequirementsSeed,
  updateJurisdictionVerificationConfigForAdmin: mockUpdateJurisdictionVerificationConfigForAdmin,
}));

import {
  listJurisdictionRequirementsAdminResult,
  updateJurisdictionVerificationConfigAdminResult,
  runJurisdictionRequirementsSeedAdminResult,
} from './jurisdiction-requirements.controller';

describe('listJurisdictionRequirementsAdminResult', () => {
  test('returns jurisdictions from admin service', async () => {
    mockListJurisdictionRequirementsForAdmin.mockResolvedValueOnce([
      {
        jurisdiction: 'US-TN',
        jurisdictionName: 'Tennessee',
        region: 'United States',
        status: 'enacted',
        verificationConfig: { vmyBusinessSettingsId: 'bs-123' },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]);

    const result = await listJurisdictionRequirementsAdminResult();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.jurisdictions).toHaveLength(1);
      expect(result.jurisdictions[0]?.verificationConfig?.vmyBusinessSettingsId).toBe('bs-123');
    }
  });
});

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

  test('rejects invalid body', async () => {
    const result = await updateJurisdictionVerificationConfigAdminResult('US-TN', {
      vmyBusinessSettingsId: 'x'.repeat(129),
    });
    expect(result.ok).toBe(false);
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

  test('returns seed result and refreshed jurisdictions on success', async () => {
    mockRunJurisdictionRequirementsSeed.mockResolvedValueOnce({ upserted: 2 });
    mockListJurisdictionRequirementsForAdmin.mockResolvedValueOnce([
      {
        jurisdiction: 'US-TN',
        jurisdictionName: 'Tennessee',
        region: 'United States',
        status: 'enacted',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]);

    const result = await runJurisdictionRequirementsSeedAdminResult({ mode: 'additive' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.upserted).toBe(2);
      expect(result.jurisdictions).toHaveLength(1);
    }
  });
});
