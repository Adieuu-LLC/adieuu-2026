import { describe, expect, test } from 'bun:test';
import { isValidReactionEmoji, REACTION_EMOJI_MAX_LENGTH } from './reaction-emoji';

describe('isValidReactionEmoji', () => {
  test('accepts simple Unicode emoji', () => {
    expect(isValidReactionEmoji('👍')).toBe(true);
    expect(isValidReactionEmoji('❤️')).toBe(true);
    expect(isValidReactionEmoji('🎉')).toBe(true);
    expect(isValidReactionEmoji('☺')).toBe(true);
  });

  test('accepts skin tones, ZWJ sequences, flags, and keycaps', () => {
    expect(isValidReactionEmoji('👍🏽')).toBe(true);
    expect(isValidReactionEmoji('👨‍👩‍👧‍👦')).toBe(true);
    expect(isValidReactionEmoji('🇨🇦')).toBe(true);
    expect(isValidReactionEmoji('1️⃣')).toBe(true);
    expect(isValidReactionEmoji('#⃣')).toBe(true);
    // Subdivision flag (tag sequence).
    expect(isValidReactionEmoji('🏴󠁧󠁢󠁳󠁣󠁴󠁿')).toBe(true);
  });

  test('accepts custom emoji tokens', () => {
    expect(isValidReactionEmoji(`custom:${'a1'.repeat(12)}`)).toBe(true);
    expect(isValidReactionEmoji(':party-parrot:')).toBe(true);
    expect(isValidReactionEmoji(':wave_2:')).toBe(true);
  });

  test('rejects plain text and mixed content', () => {
    expect(isValidReactionEmoji('hello')).toBe(false);
    expect(isValidReactionEmoji('lol 😀')).toBe(false);
    expect(isValidReactionEmoji('😀 nice')).toBe(false);
    expect(isValidReactionEmoji('<script>')).toBe(false);
    expect(isValidReactionEmoji('123')).toBe(false);
    expect(isValidReactionEmoji('a')).toBe(false);
  });

  test('rejects malformed custom tokens', () => {
    expect(isValidReactionEmoji('custom:not-an-id')).toBe(false);
    expect(isValidReactionEmoji('custom:')).toBe(false);
    expect(isValidReactionEmoji(':x:')).toBe(false); // shortcode too short
    expect(isValidReactionEmoji(':has space:')).toBe(false);
  });

  test('rejects empty and oversized values', () => {
    expect(isValidReactionEmoji('')).toBe(false);
    expect(isValidReactionEmoji('😀'.repeat(REACTION_EMOJI_MAX_LENGTH))).toBe(false);
  });

  test('rejects control and zero-width-only strings', () => {
    expect(isValidReactionEmoji('\u200D')).toBe(false);
    expect(isValidReactionEmoji('\u0000')).toBe(false);
    expect(isValidReactionEmoji('\uFE0F')).toBe(false);
  });
});
