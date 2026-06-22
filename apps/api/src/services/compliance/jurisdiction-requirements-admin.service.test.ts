import { describe, expect, test } from 'bun:test';
import { parseJurisdictionVerificationConfigInput } from './jurisdiction-requirements-admin.service';

describe('parseJurisdictionVerificationConfigInput', () => {
  test('normalizes jurisdiction code and trims business settings ID', () => {
    expect(
      parseJurisdictionVerificationConfigInput({
        jurisdiction: ' us-tn ',
        vmyBusinessSettingsId: '  bs-tn-123  ',
      }),
    ).toEqual({
      jurisdiction: 'US-TN',
      vmyBusinessSettingsId: 'bs-tn-123',
    });
  });

  test('rejects invalid jurisdiction code', () => {
    expect(
      parseJurisdictionVerificationConfigInput({
        jurisdiction: '',
        vmyBusinessSettingsId: 'bs-123',
      }),
    ).toBeNull();
  });

  test('treats blank business settings ID as unset', () => {
    expect(
      parseJurisdictionVerificationConfigInput({
        jurisdiction: 'US-TN',
        vmyBusinessSettingsId: '   ',
      }),
    ).toEqual({
      jurisdiction: 'US-TN',
      vmyBusinessSettingsId: undefined,
    });
  });

  test('rejects business settings ID longer than 128 characters', () => {
    expect(
      parseJurisdictionVerificationConfigInput({
        jurisdiction: 'US-TN',
        vmyBusinessSettingsId: 'x'.repeat(129),
      }),
    ).toEqual({
      jurisdiction: 'US-TN',
      vmyBusinessSettingsId: undefined,
    });
  });
});
