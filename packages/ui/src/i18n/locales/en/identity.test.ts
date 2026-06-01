import { describe, expect, test } from 'bun:test';
import { identity } from './identity';

describe('identity locale pluralization keys', () => {
  describe('customEmojis.save uses _one / _other pattern', () => {
    const emojis = identity.customEmojis as Record<string, unknown>;

    test('has save base key', () => {
      expect(emojis.save).toBeTypeOf('string');
    });

    test('has save_one key', () => {
      expect(emojis.save_one).toBeTypeOf('string');
    });

    test('has save_other key', () => {
      expect(emojis.save_other).toBeTypeOf('string');
    });

    test('save_one is singular form', () => {
      expect(emojis.save_one).toContain('Emoji');
      expect(emojis.save_one).not.toContain('Emojis');
    });

    test('save_other is plural form', () => {
      expect(emojis.save_other).toContain('Emojis');
    });

    test('both contain the {{count}} interpolation token', () => {
      expect(emojis.save_one).toContain('{{count}}');
      expect(emojis.save_other).toContain('{{count}}');
    });
  });
});
