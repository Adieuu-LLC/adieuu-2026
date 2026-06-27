import { describe, expect, test } from 'bun:test';
import { resolveCustomEmojiLimit } from './custom-emoji.service';
import { CUSTOM_EMOJI_LIMITS } from '../constants/custom-emoji-limits';

describe('resolveCustomEmojiLimit', () => {
  test('lifetime true with no tier -> lifetime quota', () => {
    expect(resolveCustomEmojiLimit([], true)).toBe(CUSTOM_EMOJI_LIMITS.lifetime);
  });

  test('lifetime true with insider -> lifetime takes precedence', () => {
    expect(resolveCustomEmojiLimit(['insider'], true)).toBe(CUSTOM_EMOJI_LIMITS.lifetime);
  });

  test('lifetime true with access -> lifetime takes precedence', () => {
    expect(resolveCustomEmojiLimit(['access'], true)).toBe(CUSTOM_EMOJI_LIMITS.lifetime);
  });

  test('lifetime true with both tiers -> lifetime takes precedence', () => {
    expect(resolveCustomEmojiLimit(['access', 'insider'], true)).toBe(CUSTOM_EMOJI_LIMITS.lifetime);
  });

  test('insider tier, not lifetime -> insider quota', () => {
    expect(resolveCustomEmojiLimit(['insider'], false)).toBe(CUSTOM_EMOJI_LIMITS.insider);
  });

  test('access tier only, not lifetime -> access quota', () => {
    expect(resolveCustomEmojiLimit(['access'], false)).toBe(CUSTOM_EMOJI_LIMITS.access);
  });

  test('both tiers, not lifetime -> insider quota (higher tier wins)', () => {
    expect(resolveCustomEmojiLimit(['access', 'insider'], false)).toBe(CUSTOM_EMOJI_LIMITS.insider);
  });

  test('no tiers, not lifetime -> 0', () => {
    expect(resolveCustomEmojiLimit([], false)).toBe(0);
  });
});
