import { describe, it, expect } from 'bun:test';
import {
  MAX_MESSAGE_LENGTH,
  appendWithMaxLength,
  insertStringWithMaxLength,
} from './messageComposerText';

describe('messageComposerText', () => {
  it('enforces MAX_MESSAGE_LENGTH', () => {
    expect(MAX_MESSAGE_LENGTH).toBe(4000);
  });

  describe('insertStringWithMaxLength', () => {
    it('inserts at selection and respects max length', () => {
      expect(insertStringWithMaxLength('hello', '!', 0, 0, 10)).toBe('!hello');
      expect(insertStringWithMaxLength('hello', '😀', 5, 5, 20)).toBe('hello😀');
      expect(insertStringWithMaxLength('abc', 'xx', 1, 2, 10)).toBe('axxc');
    });

    it('returns null when insert would exceed maxLen', () => {
      const base = 'a'.repeat(MAX_MESSAGE_LENGTH - 1);
      expect(insertStringWithMaxLength(base, 'xx', base.length, base.length, MAX_MESSAGE_LENGTH)).toBeNull();
    });

    it('allows emoji code units within limit', () => {
      const s = insertStringWithMaxLength('', '😀', 0, 0, 2);
      expect(s).toBe('😀');
      expect(s!.length).toBe(2);
    });
  });

  describe('appendWithMaxLength', () => {
    it('appends when within limit', () => {
      expect(appendWithMaxLength('hi', '!', 10)).toBe('hi!');
    });

    it('returns null when append would exceed maxLen', () => {
      const base = 'a'.repeat(MAX_MESSAGE_LENGTH);
      expect(appendWithMaxLength(base, 'b', MAX_MESSAGE_LENGTH)).toBeNull();
    });
  });
});
