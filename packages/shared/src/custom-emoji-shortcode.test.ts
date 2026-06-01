import { describe, expect, test } from 'bun:test';
import {
  CUSTOM_EMOJI_SHORTCODE_BODY_RE,
  createCustomEmojiColonTokenRegex,
  filenameToShortcode,
  filenameToDisplayName,
} from './custom-emoji-shortcode';

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

// ---------------------------------------------------------------------------
// filenameToShortcode
// ---------------------------------------------------------------------------

describe('filenameToShortcode', () => {
  test('strips extension and lowercases', () => {
    expect(filenameToShortcode('PartyParrot.gif')).toBe('partyparrot');
  });

  test('replaces spaces with hyphens', () => {
    expect(filenameToShortcode('hello world.png')).toBe('hello-world');
  });

  test('collapses consecutive hyphens', () => {
    expect(filenameToShortcode('a--b---c.webp')).toBe('a-b-c');
  });

  test('strips leading and trailing hyphens/underscores', () => {
    expect(filenameToShortcode('-_leading.png')).toBe('leading');
    expect(filenameToShortcode('trailing-_.png')).toBe('trailing');
    expect(filenameToShortcode('_-both-_.gif')).toBe('both');
  });

  test('removes characters not in [a-z0-9_-]', () => {
    expect(filenameToShortcode("cool~emoji!@#$%^&().png")).toBe('coolemoji');
  });

  test('handles mixed case, spaces, and special characters', () => {
    expect(filenameToShortcode('My Cool Emoji (v2).png')).toBe('my-cool-emoji-v2');
  });

  test('truncates to 32 characters', () => {
    const longName = 'a'.repeat(50) + '.png';
    expect(filenameToShortcode(longName)).toHaveLength(32);
  });

  test('returns empty string when result would be less than 2 chars', () => {
    expect(filenameToShortcode('a.png')).toBe('');
    expect(filenameToShortcode('-.png')).toBe('');
    expect(filenameToShortcode('!.gif')).toBe('');
  });

  test('returns valid shortcode for exactly 2-char result', () => {
    expect(filenameToShortcode('ab.png')).toBe('ab');
    expect(filenameToShortcode('hi.webp')).toBe('hi');
  });

  test('handles filename with no extension', () => {
    expect(filenameToShortcode('my-emoji')).toBe('my-emoji');
  });

  test('handles filename with multiple dots (dots stripped from shortcode)', () => {
    expect(filenameToShortcode('my.cool.emoji.png')).toBe('mycoolemoji');
  });

  test('preserves underscores', () => {
    expect(filenameToShortcode('party_parrot.gif')).toBe('party_parrot');
  });

  test('preserves digits', () => {
    expect(filenameToShortcode('emoji42.png')).toBe('emoji42');
  });

  test('handles unicode characters by stripping them', () => {
    expect(filenameToShortcode('caf\u00e9-latte.png')).toBe('caf-latte');
  });

  test('handles tabs and multiple spaces', () => {
    expect(filenameToShortcode('a  b\tc.png')).toBe('a-b-c');
  });

  test('output always passes CUSTOM_EMOJI_SHORTCODE_BODY_RE when non-empty', () => {
    const cases = ['normal.png', 'UPPER CASE.gif', 'with-hyphen.webp', 'under_score.png', 'mix 123.gif'];
    for (const c of cases) {
      const sc = filenameToShortcode(c);
      if (sc.length > 0) {
        expect(CUSTOM_EMOJI_SHORTCODE_BODY_RE.test(sc)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// filenameToDisplayName
// ---------------------------------------------------------------------------

describe('filenameToDisplayName', () => {
  test('strips extension', () => {
    expect(filenameToDisplayName('PartyParrot.gif')).toBe('PartyParrot');
  });

  test('preserves spaces and casing', () => {
    expect(filenameToDisplayName('My Cool Emoji.png')).toBe('My Cool Emoji');
  });

  test('handles filename with no extension', () => {
    expect(filenameToDisplayName('no-extension')).toBe('no-extension');
  });

  test('handles filename with multiple dots', () => {
    expect(filenameToDisplayName('my.cool.emoji.png')).toBe('my.cool.emoji');
  });

  test('truncates to 64 characters', () => {
    const longName = 'x'.repeat(80) + '.png';
    expect(filenameToDisplayName(longName)).toHaveLength(64);
  });

  test('handles single-char basename', () => {
    expect(filenameToDisplayName('a.png')).toBe('a');
  });
});
