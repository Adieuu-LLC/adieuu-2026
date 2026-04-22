import { describe, expect, test } from 'bun:test';
import {
  convScanSealObjectKey,
  isNestedConvScanS3Key,
} from './conv-scan-keys';

describe('conv-scan-keys', () => {
  test('isNestedConvScanS3Key matches scanHash segment', () => {
    const h = 'a'.repeat(64);
    expect(isNestedConvScanS3Key(`uploads/conv_scan/${h}/mid.jpg`)).toBe(true);
    expect(isNestedConvScanS3Key('uploads/conv_scan/legacy-id.jpg')).toBe(false);
  });

  test('convScanSealObjectKey', () => {
    const h = 'b'.repeat(64);
    expect(convScanSealObjectKey(h)).toBe(`uploads/conv_scan/${h}/.sealed`);
  });
});
