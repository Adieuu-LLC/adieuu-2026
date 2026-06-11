import { describe, expect, test } from 'bun:test';
import { normalizeOtpDigits } from './OtpInput';

describe('normalizeOtpDigits', () => {
  test('returns contiguous digits from a plain code', () => {
    expect(normalizeOtpDigits('123456', 6)).toBe('123456');
  });

  test('strips separators and whitespace', () => {
    expect(normalizeOtpDigits('12-34-56', 6)).toBe('123456');
    expect(normalizeOtpDigits(' 1 2 3 4 5 6 ', 6)).toBe('123456');
  });

  test('caps output to the configured length', () => {
    expect(normalizeOtpDigits('1234567890', 6)).toBe('123456');
  });

  test('returns partial codes when paste is shorter than length', () => {
    expect(normalizeOtpDigits('123', 6)).toBe('123');
  });

  test('returns empty string when no digits are present', () => {
    expect(normalizeOtpDigits('abc', 6)).toBe('');
    expect(normalizeOtpDigits('', 6)).toBe('');
  });

  test('respects custom length', () => {
    expect(normalizeOtpDigits('12345678', 4)).toBe('1234');
  });
});
