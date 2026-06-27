import { describe, expect, test } from 'bun:test';
import { buildJurisdictionSeedUpsertUpdate } from './jurisdiction-requirement.repository';

const baseRow = {
  jurisdiction: 'US-TN',
  jurisdictionName: 'Tennessee',
  region: 'United States',
  requirements: ['age_verification'],
  compatibleMethods: ['email_age_check'],
  legislation: [],
  status: 'enacted' as const,
};

describe('buildJurisdictionSeedUpsertUpdate', () => {
  test('omits verificationConfig from $set when seed row has none (additive preserve)', () => {
    const update = buildJurisdictionSeedUpsertUpdate(
      { ...baseRow, verificationConfig: undefined },
      new Date('2024-06-01T00:00:00.000Z'),
      { preserveVerificationConfig: true },
    );

    expect(update.$set).not.toHaveProperty('verificationConfig');
    expect(update.$unset).toBeUndefined();
  });

  test('sets verificationConfig when provided in seed row', () => {
    const update = buildJurisdictionSeedUpsertUpdate(
      { ...baseRow, verificationConfig: { vmyBusinessSettingsId: 'seed-id' } },
      new Date('2024-06-01T00:00:00.000Z'),
    );

    expect(update.$set?.verificationConfig).toEqual({ vmyBusinessSettingsId: 'seed-id' });
  });

  test('unsets verificationConfig in clobber mode when seed row omits it', () => {
    const update = buildJurisdictionSeedUpsertUpdate(
      { ...baseRow, verificationConfig: undefined },
      new Date('2024-06-01T00:00:00.000Z'),
      { preserveVerificationConfig: false },
    );

    expect(update.$unset).toEqual({ verificationConfig: '', vmyBusinessSettingsId: '' });
  });

  test('normalizes jurisdiction code in $set', () => {
    const update = buildJurisdictionSeedUpsertUpdate(
      { ...baseRow, jurisdiction: ' us-tn ' },
      new Date('2024-06-01T00:00:00.000Z'),
    );

    expect(update.$set?.jurisdiction).toBe('US-TN');
  });
});
