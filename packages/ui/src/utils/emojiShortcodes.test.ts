import { describe, expect, test } from 'bun:test';
import { convertShortcodes } from './emojiShortcodes';

describe('convertShortcodes', () => {
  // ---- Text shortcuts ----

  test('converts :) to slightly smiling face', () => {
    expect(convertShortcodes('hello :)')).toBe('hello \u{1F642}');
  });

  test('converts :( to slightly frowning face', () => {
    expect(convertShortcodes('oh no :(')).toBe('oh no \u{1F641}');
  });

  test('converts :D to smiley', () => {
    expect(convertShortcodes(':D')).toBe('\u{1F603}');
  });

  test('converts ;) to winking face', () => {
    expect(convertShortcodes('nice ;)')).toBe('nice \u{1F609}');
  });

  test('converts <3 to red heart', () => {
    expect(convertShortcodes('love <3')).toBe('love \u{2764}\u{FE0F}');
  });

  test('converts </3 to broken heart', () => {
    expect(convertShortcodes('sad </3')).toBe('sad \u{1F494}');
  });

  test('converts >:( to angry face', () => {
    expect(convertShortcodes('>:(')).toBe('\u{1F620}');
  });

  test('converts multiple text shortcuts in one message', () => {
    const result = convertShortcodes(':) and :D');
    expect(result).toBe('\u{1F642} and \u{1F603}');
  });

  // ---- Colon shortcodes ----

  test('converts :thumbsup: to thumbs up', () => {
    expect(convertShortcodes(':thumbsup:')).toBe('\u{1F44D}');
  });

  test('converts :fire: to fire', () => {
    expect(convertShortcodes(':fire:')).toBe('\u{1F525}');
  });

  test('converts :rocket: to rocket', () => {
    expect(convertShortcodes('launching :rocket:')).toBe('launching \u{1F680}');
  });

  test('converts :100: to hundred points', () => {
    expect(convertShortcodes(':100:')).toBe('\u{1F4AF}');
  });

  test('handles case-insensitive colon shortcodes', () => {
    expect(convertShortcodes(':FIRE:')).toBe('\u{1F525}');
    expect(convertShortcodes(':Fire:')).toBe('\u{1F525}');
  });

  test('converts multiple colon shortcodes in one message', () => {
    const result = convertShortcodes(':heart: and :star:');
    expect(result).toBe('\u{2764}\u{FE0F} and \u{2B50}');
  });

  // ---- Passthrough and edge cases ----

  test('leaves unrecognised colon shortcodes unchanged', () => {
    expect(convertShortcodes(':nonexistent_thing:')).toBe(':nonexistent_thing:');
  });

  test('returns plain text unchanged when no shortcuts present', () => {
    const plain = 'This is a normal message with no shortcuts.';
    expect(convertShortcodes(plain)).toBe(plain);
  });

  test('fast-path leaves alphanumeric text untouched', () => {
    expect(convertShortcodes('hello world 123')).toBe('hello world 123');
  });

  test('handles empty string', () => {
    expect(convertShortcodes('')).toBe('');
  });

  test('mixes text shortcuts and colon shortcodes', () => {
    const result = convertShortcodes('Great job :) :thumbsup:');
    expect(result).toBe('Great job \u{1F642} \u{1F44D}');
  });

  test('does not convert colon-delimited shortcodes in time-like text', () => {
    expect(convertShortcodes('time: 12:30')).toBe('time: 12:30');
  });

  test('text shortcuts match inside URLs (known limitation)', () => {
    const result = convertShortcodes('http://example.com');
    expect(result).toContain('http');
    expect(result).toContain('example.com');
  });
});
