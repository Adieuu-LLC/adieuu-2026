import { describe, expect, test } from 'bun:test';
import { CUSTOM_EMOJI_SHORTCODE_BODY_RE, createCustomEmojiColonTokenRegex } from './custom-emoji-shortcode';

describe('custom emoji shortcode rules', () => {
  test('body allows lowercase letters, digits, underscore, hyphen', () => {
    expect(CUSTOM_EMOJI_SHORTCODE_BODY_RE.test('ab')).toBe(true);
    expect(CUSTOM_EMOJI_SHORTCODE_BODY_RE.test('my-emoji')).toBe(true);
    expect(CUSTOM_EMOJI_SHORTCODE_BODY_RE.test('a_b-c9')).toBe(true);
  });

  test('body rejects uppercase and spaces', () => {
    expect(CUSTOM_EMOJI_SHORTCODE_BODY_RE.test('MyEmoji')).toBe(false);
    expect(CUSTOM_EMOJI_SHORTCODE_BODY_RE.test('a b')).toBe(false);
  });

  test('colon token regex matches hyphenated shortcodes', () => {
    const re = createCustomEmojiColonTokenRegex();
    const m = re.exec('hi :cool-meme: there');
    expect(m?.[1]).toBe('cool-meme');
  });
});
