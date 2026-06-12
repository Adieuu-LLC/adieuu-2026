import { describe, expect, test } from 'bun:test';
import {
  getReportSourceI18nKey,
  normalizeReportSource,
  REPORT_SOURCE_VALUES,
} from './moderation-types';

describe('normalizeReportSource', () => {
  test('preserves known source values', () => {
    for (const source of REPORT_SOURCE_VALUES) {
      expect(normalizeReportSource(source)).toBe(source);
    }
  });

  test('returns unknown for unexpected values', () => {
    expect(normalizeReportSource('')).toBe('unknown');
    expect(normalizeReportSource('automated_ml')).toBe('unknown');
    expect(normalizeReportSource('manual_user_extra')).toBe('unknown');
  });
});

describe('getReportSourceI18nKey', () => {
  test('maps known automated sources', () => {
    expect(getReportSourceI18nKey('manual_user')).toBe('sourceManual');
    expect(getReportSourceI18nKey('automated_hash_check')).toBe('sourceAutoHashCheck');
    expect(getReportSourceI18nKey('automated_csam_hash')).toBe('sourceAutoCsamHash');
  });

  test('maps legacy rekognition source to its own label', () => {
    expect(getReportSourceI18nKey('automated_rekognition')).toBe('sourceAutoRekognition');
  });

  test('maps unexpected sources to unknown label instead of hash check', () => {
    expect(getReportSourceI18nKey('future_detector')).toBe('sourceUnknown');
    expect(getReportSourceI18nKey('')).toBe('sourceUnknown');
  });
});
