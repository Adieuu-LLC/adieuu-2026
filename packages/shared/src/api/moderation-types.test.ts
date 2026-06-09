import { describe, expect, test } from 'bun:test';
import { getReportSourceI18nKey } from './moderation-types';

describe('getReportSourceI18nKey', () => {
  test('maps known automated sources', () => {
    expect(getReportSourceI18nKey('manual_user')).toBe('sourceManual');
    expect(getReportSourceI18nKey('automated_hash_check')).toBe('sourceAutoHashCheck');
    expect(getReportSourceI18nKey('automated_csam_hash')).toBe('sourceAutoCsamHash');
  });

  test('maps legacy rekognition source to hash check label', () => {
    expect(getReportSourceI18nKey('automated_rekognition')).toBe('sourceAutoHashCheck');
  });
});
