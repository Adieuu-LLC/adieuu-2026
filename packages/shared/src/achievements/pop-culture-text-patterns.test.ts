import { describe, expect, test } from 'bun:test';
import {
  countEmojis,
  getPopCultureTextAchievementActions,
  POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS,
  TEXT_BEDAZZLER_EMOJI_THRESHOLD,
} from './pop-culture-text-patterns';

describe('pop culture text achievement patterns', () => {
  test('detects sk8r as a whole word', () => {
    expect(getPopCultureTextAchievementActions('totally a sk8r')).toContain(
      POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.sk8r,
    );
    expect(getPopCultureTextAchievementActions('skater')).not.toContain(
      POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.sk8r,
    );
  });

  test('requires exact names for regina george and zoltan', () => {
    expect(getPopCultureTextAchievementActions('Regina George')).toContain(
      POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.reginaGeorge,
    );
    expect(getPopCultureTextAchievementActions('Zoltan')).toContain(
      POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.zoltan,
    );
    expect(getPopCultureTextAchievementActions('Regina')).not.toContain(
      POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.reginaGeorge,
    );
  });

  test('accepts 007 or James Bond exactly', () => {
    expect(getPopCultureTextAchievementActions('007')).toContain(
      POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.jamesBond,
    );
    expect(getPopCultureTextAchievementActions('James Bond')).toContain(
      POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.jamesBond,
    );
    expect(getPopCultureTextAchievementActions('007 agent')).not.toContain(
      POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.jamesBond,
    );
  });

  test('detects phrase and emoji-heavy text', () => {
    expect(getPopCultureTextAchievementActions('I am your father')).toContain(
      POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.iAmYourFather,
    );
    expect(getPopCultureTextAchievementActions('bears, beets, battlestar')).toContain(
      POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.bearsBeets,
    );

    const emojiText = '😀'.repeat(TEXT_BEDAZZLER_EMOJI_THRESHOLD + 1);
    expect(countEmojis(emojiText)).toBe(TEXT_BEDAZZLER_EMOJI_THRESHOLD + 1);
    expect(getPopCultureTextAchievementActions(emojiText)).toContain(
      POP_CULTURE_TEXT_ACHIEVEMENT_ACTIONS.emojiBedazzler,
    );
  });
});
