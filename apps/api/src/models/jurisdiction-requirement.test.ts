import { describe, expect, test } from 'bun:test';
import {
  extractVerificationConfig,
  toAdminJurisdictionRequirement,
  type JurisdictionRequirementDocument,
} from './jurisdiction-requirement';

function makeDoc(
  overrides: Partial<JurisdictionRequirementDocument> = {},
): JurisdictionRequirementDocument {
  const now = new Date('2024-01-01T00:00:00.000Z');
  return {
    _id: overrides._id ?? ({} as JurisdictionRequirementDocument['_id']),
    jurisdiction: 'US-TN',
    jurisdictionName: 'Tennessee',
    region: 'United States',
    requirements: ['age_verification'],
    compatibleMethods: ['email_age_check'],
    legislation: [],
    status: 'enacted',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('extractVerificationConfig', () => {
  test('reads nested verificationConfig.vmyBusinessSettingsId', () => {
    const config = extractVerificationConfig(
      makeDoc({
        verificationConfig: { vmyBusinessSettingsId: ' nested-id ' },
      }),
    );
    expect(config).toEqual({ vmyBusinessSettingsId: 'nested-id' });
  });

  test('reads legacy top-level vmyBusinessSettingsId', () => {
    const doc = makeDoc();
    (doc as JurisdictionRequirementDocument & { vmyBusinessSettingsId: string }).vmyBusinessSettingsId =
      'legacy-id';

    expect(extractVerificationConfig(doc)).toEqual({ vmyBusinessSettingsId: 'legacy-id' });
  });

  test('prefers nested value over legacy top-level field', () => {
    const doc = makeDoc({
      verificationConfig: { vmyBusinessSettingsId: 'nested-id' },
    });
    (doc as JurisdictionRequirementDocument & { vmyBusinessSettingsId: string }).vmyBusinessSettingsId =
      'legacy-id';

    expect(extractVerificationConfig(doc)).toEqual({ vmyBusinessSettingsId: 'nested-id' });
  });

  test('returns undefined when no ID is configured', () => {
    expect(extractVerificationConfig(makeDoc())).toBeUndefined();
  });
});

describe('toAdminJurisdictionRequirement', () => {
  test('includes verificationConfig from legacy top-level field', () => {
    const doc = makeDoc();
    (doc as JurisdictionRequirementDocument & { vmyBusinessSettingsId: string }).vmyBusinessSettingsId =
      'legacy-id';

    const admin = toAdminJurisdictionRequirement(doc);
    expect(admin.verificationConfig?.vmyBusinessSettingsId).toBe('legacy-id');
  });
});
