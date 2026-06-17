import { describe, expect, test } from 'bun:test';
import {
  ACHIEVEMENT_MESSAGE_SCAN_MAX_LENGTH,
  safePatternTest,
  textForAchievementScan,
} from './safe-achievement-text-scan';

describe('safe achievement text scan', () => {
  test('truncates long message text by default', () => {
    const long = `${'a'.repeat(ACHIEVEMENT_MESSAGE_SCAN_MAX_LENGTH)}winter is coming`;
    const bounded = textForAchievementScan(long, ACHIEVEMENT_MESSAGE_SCAN_MAX_LENGTH);
    expect(bounded).toHaveLength(ACHIEVEMENT_MESSAGE_SCAN_MAX_LENGTH);
    expect(bounded?.includes('winter is coming')).toBe(false);
  });

  test('skip mode rejects over-limit input', () => {
    expect(textForAchievementScan('x'.repeat(200), 160, 'skip')).toBeNull();
  });

  test('safePatternTest respects bounds', () => {
    const pattern = /winter is coming/i;
    expect(safePatternTest(pattern, 'winter is coming', ACHIEVEMENT_MESSAGE_SCAN_MAX_LENGTH)).toBe(true);
    expect(
      safePatternTest(
        pattern,
        `${'a'.repeat(ACHIEVEMENT_MESSAGE_SCAN_MAX_LENGTH)}winter is coming`,
        ACHIEVEMENT_MESSAGE_SCAN_MAX_LENGTH,
      ),
    ).toBe(false);
  });
});
