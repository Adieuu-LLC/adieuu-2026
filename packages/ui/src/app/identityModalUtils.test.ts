import { describe, expect, test } from 'bun:test';
import { stringArrayFromI18nReturn } from './identityModalUtils';

describe('stringArrayFromI18nReturn', () => {
  test('returns string arrays unchanged', () => {
    expect(stringArrayFromI18nReturn(['a', 'b'])).toEqual(['a', 'b']);
  });

  test('returns empty array for string fallback', () => {
    expect(stringArrayFromI18nReturn('identity.create.passwordExamples')).toEqual([]);
  });

  test('returns empty array for non-string elements', () => {
    expect(stringArrayFromI18nReturn(['ok', 1])).toEqual([]);
  });

  test('returns empty array for non-arrays', () => {
    expect(stringArrayFromI18nReturn(null)).toEqual([]);
    expect(stringArrayFromI18nReturn(undefined)).toEqual([]);
    expect(stringArrayFromI18nReturn({})).toEqual([]);
  });
});
