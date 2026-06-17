import { describe, expect, test } from 'bun:test';
import {
  BIO_MAX_LENGTH,
  containsCaughtInTheRainBio,
  containsDialupBio,
  containsRetroHtmlBioTags,
  isEmptyBio,
  isMaxLengthBio,
} from './bio-achievement.service';

describe('bio achievement patterns', () => {
  test('detects retro HTML tags without matching <br>', () => {
    expect(containsRetroHtmlBioTags('Hello <marquee>welcome</marquee>')).toBe(true);
    expect(containsRetroHtmlBioTags('<blink>look</blink>')).toBe(true);
    expect(containsRetroHtmlBioTags('Bold <b>text</b>')).toBe(true);
    expect(containsRetroHtmlBioTags('Line<br>break')).toBe(false);
  });

  test('detects caught in the rain phrase', () => {
    expect(containsCaughtInTheRainBio('If you like getting caught in the rain')).toBe(true);
    expect(containsCaughtInTheRainBio('rainy day')).toBe(false);
  });

  test('max length bio uses the profile limit', () => {
    expect(isMaxLengthBio('a'.repeat(BIO_MAX_LENGTH))).toBe(true);
    expect(isMaxLengthBio('a'.repeat(BIO_MAX_LENGTH - 1))).toBe(false);
  });

  test('empty bio is zero characters after sanitization', () => {
    expect(isEmptyBio('')).toBe(true);
    expect(isEmptyBio(' ')).toBe(false);
  });

  test('detects dial-up references', () => {
    expect(containsDialupBio('Still on 56k')).toBe(true);
    expect(containsDialupBio('Dial-up noises')).toBe(true);
    expect(containsDialupBio('fiber optic')).toBe(false);
  });
});
