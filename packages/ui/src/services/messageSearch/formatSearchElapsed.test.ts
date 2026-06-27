import { describe, expect, test } from 'bun:test';
import { formatSearchElapsedMs } from './formatSearchElapsed';

describe('formatSearchElapsedMs', () => {
  test('zero and negative', () => {
    expect(formatSearchElapsedMs(0)).toBe('0:00');
    expect(formatSearchElapsedMs(-1)).toBe('0:00');
  });

  test('seconds and minutes', () => {
    expect(formatSearchElapsedMs(45_000)).toBe('0:45');
    expect(formatSearchElapsedMs(60_000)).toBe('1:00');
    expect(formatSearchElapsedMs(65_000)).toBe('1:05');
  });
});
