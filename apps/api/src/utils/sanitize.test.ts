import { describe, expect, test, spyOn } from 'bun:test';
import {
  SANITIZED_PATH_MAX_LENGTH,
  generateEmojiString,
  parseOptionalObjectIdCursor,
  sanitizeObjectId,
  sanitizePathForLog,
  sanitizeString,
  type SanitizationResult,
} from './sanitize';
import elog from './adieuuLogger';

describe('generateEmojiString', () => {
  test('returns a string containing emojis', () => {
    const result = generateEmojiString();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('includes emoticons range (0x1F600-0x1F64F)', () => {
    const result = generateEmojiString();
    expect(result).toContain(String.fromCodePoint(0x1F600));
    expect(result).toContain(String.fromCodePoint(0x1F64F));
  });

  test('includes dingbat symbols range (0x2702-0x27B0)', () => {
    const result = generateEmojiString();
    expect(result).toContain(String.fromCodePoint(0x2702));
    expect(result).toContain(String.fromCodePoint(0x27B0));
  });

  test('includes transport & map symbols range (0x1F680-0x1F6C0)', () => {
    const result = generateEmojiString();
    expect(result).toContain(String.fromCodePoint(0x1F680));
    expect(result).toContain(String.fromCodePoint(0x1F6C0));
  });
});

describe('sanitizeString', () => {
  describe('return type structure', () => {
    test('returns an object with value and deltas properties', () => {
      const result = sanitizeString('test', 'general');
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('deltas');
      expect(typeof result.value).toBe('string');
      expect(typeof result.deltas).toBe('number');
    });

    test('deltas is 0 when input is unchanged', () => {
      const result = sanitizeString('Hello World', 'general');
      expect(result.value).toBe('Hello World');
      expect(result.deltas).toBe(0);
    });

    test('deltas counts character differences when input is sanitized', () => {
      const result = sanitizeString('Hello\x00World', 'general');
      expect(result.value).toBe('HelloWorld');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('deltas counts differences when input is trimmed', () => {
      const result = sanitizeString('  Hello World  ', 'general');
      expect(result.value).toBe('Hello World');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('deltas accurately counts removed characters', () => {
      // Remove 3 characters from end
      const result = sanitizeString('abc!!!', 'alphanumdash');
      expect(result.value).toBe('abc');
      expect(result.deltas).toBe(3); // 3 characters differ
    });
  });

  describe('non-string input handling', () => {
    test('returns empty string and deltas > 0 for null input', () => {
      const result = sanitizeString(null as unknown as string);
      expect(result.value).toBe('');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('returns empty string and deltas > 0 for undefined input', () => {
      const result = sanitizeString(undefined as unknown as string);
      expect(result.value).toBe('');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('returns empty string and deltas > 0 for number input', () => {
      const result = sanitizeString(123 as unknown as string);
      expect(result.value).toBe('');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('returns empty string and deltas > 0 for object input', () => {
      const result = sanitizeString({} as unknown as string);
      expect(result.value).toBe('');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('control character removal', () => {
    test('removes null character', () => {
      const result = sanitizeString('hello\x00world', 'general');
      expect(result.value).not.toContain('\x00');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes tab character', () => {
      const result = sanitizeString('hello\tworld', 'general');
      expect(result.value).not.toContain('\t');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes zero-width space', () => {
      const result = sanitizeString('hello\u200Bworld', 'general');
      expect(result.value).not.toContain('\u200B');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes zero-width joiner', () => {
      const result = sanitizeString('hello\u200Dworld', 'general');
      expect(result.value).not.toContain('\u200D');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes zero-width non-joiner', () => {
      const result = sanitizeString('hello\u200Cworld', 'general');
      expect(result.value).not.toContain('\u200C');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes right-to-left override', () => {
      const result = sanitizeString('hello\u202Eworld', 'general');
      expect(result.value).not.toContain('\u202E');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes soft hyphen', () => {
      const result = sanitizeString('hello\u00ADworld', 'general');
      expect(result.value).not.toContain('\u00AD');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes line separator', () => {
      const result = sanitizeString('hello\u2028world', 'general');
      expect(result.value).not.toContain('\u2028');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes paragraph separator', () => {
      const result = sanitizeString('hello\u2029world', 'general');
      expect(result.value).not.toContain('\u2029');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes BOM / zero-width no-break space', () => {
      const result = sanitizeString('hello\uFEFFworld', 'general');
      expect(result.value).not.toContain('\uFEFF');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes non-character U+FFFE', () => {
      const result = sanitizeString('hello\uFFFEworld', 'general');
      expect(result.value).not.toContain('\uFFFE');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes non-character U+FFFF', () => {
      const result = sanitizeString('hello\uFFFFworld', 'general');
      expect(result.value).not.toContain('\uFFFF');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes left-to-right mark', () => {
      const result = sanitizeString('hello\u200Eworld', 'general');
      expect(result.value).not.toContain('\u200E');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes right-to-left mark', () => {
      const result = sanitizeString('hello\u200Fworld', 'general');
      expect(result.value).not.toContain('\u200F');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('HTML entity removal', () => {
    test('removes &nbsp without semicolon', () => {
      const result = sanitizeString('hello&nbspworld', 'general');
      expect(result.value).not.toContain('&nbsp');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes &nbsp; with semicolon', () => {
      const result = sanitizeString('hello&nbsp;world', 'general');
      expect(result.value).not.toContain('&nbsp');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes &NBSP (case insensitive)', () => {
      const result = sanitizeString('hello&NBSPworld', 'general');
      expect(result.value).not.toContain('&NBSP');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes &#160 (decimal nbsp)', () => {
      const result = sanitizeString('hello&#160world', 'general');
      expect(result.value).not.toContain('&#160');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes &#xa0 (hex nbsp)', () => {
      const result = sanitizeString('hello&#xa0world', 'general');
      expect(result.value).not.toContain('&#xa0');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes &#8205 (decimal zero-width joiner)', () => {
      const result = sanitizeString('hello&#8205world', 'general');
      expect(result.value).not.toContain('&#8205');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes &#x200d (hex zero-width joiner)', () => {
      const result = sanitizeString('hello&#x200dworld', 'general');
      expect(result.value).not.toContain('&#x200d');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes #8205 (malformed)', () => {
      const result = sanitizeString('hello#8205world', 'general');
      expect(result.value).not.toContain('#8205');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes &zwnj without semicolon', () => {
      const result = sanitizeString('hello&zwnjworld', 'general');
      expect(result.value).not.toContain('&zwnj');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes &zwnj; with semicolon', () => {
      const result = sanitizeString('hello&zwnj;world', 'general');
      expect(result.value).not.toContain('&zwnj');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes &#8204 (decimal zwnj)', () => {
      const result = sanitizeString('hello&#8204world', 'general');
      expect(result.value).not.toContain('&#8204');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes &#x200c (hex zwnj)', () => {
      const result = sanitizeString('hello&#x200cworld', 'general');
      expect(result.value).not.toContain('&#x200c');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes &zwj (named zero-width joiner)', () => {
      const result = sanitizeString('hello&zwjworld', 'general');
      expect(result.value).not.toContain('&zwj');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes &#8203 (decimal zero-width space)', () => {
      const result = sanitizeString('hello&#8203world', 'general');
      expect(result.value).not.toContain('&#8203');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes &#x200b (hex zero-width space)', () => {
      const result = sanitizeString('hello&#x200bworld', 'general');
      expect(result.value).not.toContain('&#x200b');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('template literal injection prevention', () => {
    test('replaces ${ with space', () => {
      const result = sanitizeString('hello${injection}world', 'general');
      expect(result.value).not.toContain('${');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('type: default', () => {
    test('defaults to general sanitization', () => {
      const result = sanitizeString('Hello World!', 'default');
      expect(result.value).toBe('Hello World!');
      expect(result.deltas).toBe(0);
    });

    test('works with undefined type', () => {
      const result = sanitizeString('Hello World!');
      expect(result.value).toBe('Hello World!');
      expect(result.deltas).toBe(0);
    });
  });

  describe('type: alphanumdash', () => {
    test('allows alphanumeric and hyphen', () => {
      const result = sanitizeString('hello-world-123', 'alphanumdash');
      expect(result.value).toBe('hello-world-123');
      expect(result.deltas).toBe(0);
    });

    test('removes spaces and special characters', () => {
      const result = sanitizeString('hello world! @#$', 'alphanumdash');
      expect(result.value).toBe('helloworld');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes underscores', () => {
      const result = sanitizeString('hello_world', 'alphanumdash');
      expect(result.value).toBe('helloworld');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('type: alphanumdashstop', () => {
    test('allows alphanumeric, hyphen, and period', () => {
      const result = sanitizeString('hello-world-2.0.yml', 'alphanumdashstop');
      expect(result.value).toBe('hello-world-2.0.yml');
      expect(result.deltas).toBe(0);
    });

    test('removes characters outside alphanumdashstop set', () => {
      const result = sanitizeString('hello world! @#$.', 'alphanumdashstop');
      expect(result.value).toBe('helloworld.');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes underscores', () => {
      const result = sanitizeString('hello_world.tar', 'alphanumdashstop');
      expect(result.value).toBe('helloworld.tar');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('still strips periods that are not valid as part of cleaned segment when mixed with removed chars', () => {
      const result = sanitizeString('a.b.c!!!', 'alphanumdashstop');
      expect(result.value).toBe('a.b.c');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('type: authcode', () => {
    test('allows alphanumeric, hyphen and space', () => {
      const result = sanitizeString('ABC-123 XYZ', 'authcode');
      expect(result.value).toBe('ABC-123 XYZ');
      expect(result.deltas).toBe(0);
    });

    test('removes special characters', () => {
      const result = sanitizeString('ABC!@#123', 'authcode');
      expect(result.value).toBe('ABC123');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('type: base64', () => {
    test('allows standard base64 characters', () => {
      const result = sanitizeString('SGVsbG8gV29ybGQ=', 'base64');
      expect(result.value).toBe('SGVsbG8gV29ybGQ=');
      expect(result.deltas).toBe(0);
    });

    test('allows forward slash and plus', () => {
      const result = sanitizeString('abc+def/ghi=', 'base64');
      expect(result.value).toBe('abc+def/ghi=');
      expect(result.deltas).toBe(0);
    });

    test('removes colons, semicolons, commas, periods (not valid base64)', () => {
      const result = sanitizeString('abc:def;ghi,jkl.mno', 'base64');
      expect(result.value).toBe('abcdefghijklmno');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes spaces and other special characters', () => {
      const result = sanitizeString('abc def!@#', 'base64');
      expect(result.value).toBe('abcdef');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('preserves uppercase and lowercase', () => {
      const result = sanitizeString('ABCDabcd0123+/==', 'base64');
      expect(result.value).toBe('ABCDabcd0123+/==');
      expect(result.deltas).toBe(0);
    });
  });

  describe('type: base64url', () => {
    test('allows URL-safe base64 characters', () => {
      const result = sanitizeString('SGVsbG8tV29ybGRf', 'base64url');
      expect(result.value).toBe('SGVsbG8tV29ybGRf');
      expect(result.deltas).toBe(0);
    });

    test('allows underscore and hyphen', () => {
      const result = sanitizeString('abc-def_ghi', 'base64url');
      expect(result.value).toBe('abc-def_ghi');
      expect(result.deltas).toBe(0);
    });

    test('removes standard base64 padding and special chars', () => {
      const result = sanitizeString('abc+def/ghi=', 'base64url');
      expect(result.value).toBe('abcdefghi');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes spaces and other special characters', () => {
      const result = sanitizeString('abc def!@#', 'base64url');
      expect(result.value).toBe('abcdef');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('preserves uppercase and lowercase', () => {
      const result = sanitizeString('ABCDabcd0123_-', 'base64url');
      expect(result.value).toBe('ABCDabcd0123_-');
      expect(result.deltas).toBe(0);
    });
  });

  describe('type: email', () => {
    test('sanitizes valid email', () => {
      const result = sanitizeString('User.Name+tag@Example.COM', 'email');
      expect(result.value).toBe('user.name+tag@example.com');
      // Case changes are not counted as deltas for email (intentional normalization)
      expect(result.deltas).toBe(0);
    });

    test('removes protocol prefixes', () => {
      const result = sanitizeString('https://user@domain.com', 'email');
      expect(result.value).toBe('user@domain.com');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes http:// prefix', () => {
      const result = sanitizeString('http://user@domain.com', 'email');
      expect(result.value).toBe('user@domain.com');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes http:/ prefix (malformed)', () => {
      const result = sanitizeString('http:/user@domain.com', 'email');
      expect(result.value).toBe('user@domain.com');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes https:/ prefix (malformed)', () => {
      const result = sanitizeString('https:/user@domain.com', 'email');
      expect(result.value).toBe('user@domain.com');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes ftp:// prefix', () => {
      const result = sanitizeString('ftp://user@domain.com', 'email');
      expect(result.value).toBe('user@domain.com');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes ftp:/ prefix (malformed)', () => {
      const result = sanitizeString('ftp:/user@domain.com', 'email');
      expect(result.value).toBe('user@domain.com');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes angle brackets', () => {
      const result = sanitizeString('<user@domain.com>', 'email');
      expect(result.value).toBe('user@domain.com');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('returns empty string for email without @ symbol', () => {
      const result = sanitizeString('invalidemail', 'email');
      expect(result.value).toBe('');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('returns empty string for email with empty local part', () => {
      const result = sanitizeString('@domain.com', 'email');
      expect(result.value).toBe('');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('returns empty string for email with empty domain', () => {
      const result = sanitizeString('user@', 'email');
      expect(result.value).toBe('');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('returns empty string for just @ symbol', () => {
      const result = sanitizeString('@', 'email');
      expect(result.value).toBe('');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes invalid characters from local part', () => {
      const result = sanitizeString('user!#$%^&*@domain.com', 'email');
      expect(result.value).toBe('user@domain.com');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes invalid characters from domain part', () => {
      const result = sanitizeString('user@dom!ain.com', 'email');
      expect(result.value).toBe('user@domain.com');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('trims whitespace', () => {
      const result = sanitizeString('  user@domain.com  ', 'email');
      expect(result.value).toBe('user@domain.com');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('converts to lowercase', () => {
      const result = sanitizeString('USER@DOMAIN.COM', 'email');
      expect(result.value).toBe('user@domain.com');
      // Case changes are not counted as deltas for email (intentional normalization)
      expect(result.deltas).toBe(0);
    });

    test('removes multiple protocol prefixes (global replacement)', () => {
      const result = sanitizeString('http://http://user@domain.com', 'email');
      expect(result.value).toBe('user@domain.com');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('handles multiple @ symbols - uses last @ as separator', () => {
      const result = sanitizeString('user@evil.com@legit.com', 'email');
      expect(result.value).toBe('userevil.com@legit.com');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('handles multiple angle brackets', () => {
      const result = sanitizeString('<<user@domain.com>>', 'email');
      expect(result.value).toBe('user@domain.com');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes multiple different protocol prefixes', () => {
      const result = sanitizeString('https://http://user@domain.com', 'email');
      expect(result.value).toBe('user@domain.com');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('type: general', () => {
    test('allows basic alphanumeric and punctuation', () => {
      const result = sanitizeString('Hello, World! 123', 'general');
      expect(result.value).toBe('Hello, World! 123');
      expect(result.deltas).toBe(0);
    });

    test('allows special characters', () => {
      const result = sanitizeString("Test @#$%^&*()_+='-:;!?", 'general');
      expect(result.value.length).toBeGreaterThan(0);
    });

    test('allows backticks (common in markdown/code discussions)', () => {
      const result = sanitizeString('Hello `world`', 'general');
      expect(result.value).toContain('`');
      expect(result.value).toBe('Hello `world`');
      expect(result.deltas).toBe(0);
    });

    test('allows quotes and angle brackets', () => {
      const result = sanitizeString('Say "Hello" <World>', 'general');
      expect(result.value).toContain('"');
      expect(result.value).toContain('<');
      expect(result.value).toContain('>');
    });

    test('allows emojis', () => {
      const result = sanitizeString('Hello \u{1F600}', 'general');
      expect(result.value).toContain('\u{1F600}');
    });

    test('allows international characters - extended Latin', () => {
      const result = sanitizeString('Cafe \u00E9 \u00F1', 'general');
      expect(result.value).toContain('\u00E9');
      expect(result.value).toContain('\u00F1');
    });

    test('allows international characters - CJK (Chinese)', () => {
      const result = sanitizeString('\u4E2D\u6587\u6D4B\u8BD5', 'general');
      expect(result.value).toBe('\u4E2D\u6587\u6D4B\u8BD5');
      expect(result.deltas).toBe(0);
    });

    test('allows international characters - Korean', () => {
      const result = sanitizeString('\uD55C\uAD6D\uC5B4', 'general');
      expect(result.value).toBe('\uD55C\uAD6D\uC5B4');
      expect(result.deltas).toBe(0);
    });

    test('allows international characters - Japanese', () => {
      const result = sanitizeString('\u65E5\u672C\u8A9E \u3072\u3089\u304C\u306A', 'general');
      expect(result.value).toContain('\u65E5\u672C\u8A9E');
      expect(result.value).toContain('\u3072\u3089\u304C\u306A');
    });

    test('allows international characters - Arabic', () => {
      const result = sanitizeString('\u0627\u0644\u0639\u0631\u0628\u064A\u0629', 'general');
      expect(result.value).toBe('\u0627\u0644\u0639\u0631\u0628\u064A\u0629');
      expect(result.deltas).toBe(0);
    });

    test('allows international characters - Cyrillic', () => {
      const result = sanitizeString('\u0420\u0443\u0441\u0441\u043A\u0438\u0439', 'general');
      expect(result.value).toBe('\u0420\u0443\u0441\u0441\u043A\u0438\u0439');
      expect(result.deltas).toBe(0);
    });

    test('allows international characters - Hebrew', () => {
      const result = sanitizeString('\u05E2\u05D1\u05E8\u05D9\u05EA', 'general');
      expect(result.value).toBe('\u05E2\u05D1\u05E8\u05D9\u05EA');
      expect(result.deltas).toBe(0);
    });

    test('allows mixed international content', () => {
      const input = 'Hello \u4E16\u754C \uC548\uB155 \u041F\u0440\u0438\u0432\u0435\u0442';
      const result = sanitizeString(input, 'general');
      expect(result.value).toBe(input);
      expect(result.deltas).toBe(0);
    });
  });

  describe('type: hash', () => {
    test('allows alphanumeric and hash-specific characters', () => {
      const result = sanitizeString('abc123()_.=+-', 'hash');
      expect(result.value).toBe('abc123()_.=+-');
      expect(result.deltas).toBe(0);
    });

    test('removes spaces and other characters', () => {
      const result = sanitizeString('abc 123!@#', 'hash');
      expect(result.value).toBe('abc123');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('type: id', () => {
    test('allows alphanumeric and parentheses', () => {
      const result = sanitizeString('abc123()', 'id');
      expect(result.value).toBe('abc123()');
      expect(result.deltas).toBe(0);
    });

    test('removes special characters and spaces', () => {
      const result = sanitizeString('abc-123_test', 'id');
      expect(result.value).toBe('abc123test');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('type: idenhanced', () => {
    test('allows alphanumeric, parentheses, equals, underscore, period, hyphen', () => {
      const result = sanitizeString('abc123()=_.-', 'idenhanced');
      expect(result.value).toBe('abc123()=_.-');
      expect(result.deltas).toBe(0);
    });

    test('removes spaces and other special characters', () => {
      const result = sanitizeString('abc 123!@#', 'idenhanced');
      expect(result.value).toBe('abc123');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('type: ip', () => {
    test('allows IPv4 address', () => {
      const result = sanitizeString('192.168.1.1', 'ip');
      expect(result.value).toBe('192.168.1.1');
      expect(result.deltas).toBe(0);
    });

    test('allows IPv6 address', () => {
      const result = sanitizeString('2001:0db8:85a3:0000:0000:8a2e:0370:7334', 'ip');
      expect(result.value).toBe('2001:0DB8:85A3:0000:0000:8A2E:0370:7334');
      // Case changes are not counted as deltas for IP (intentional normalization)
      expect(result.deltas).toBe(0);
    });

    test('allows CIDR notation', () => {
      const result = sanitizeString('192.168.1.0/24', 'ip');
      expect(result.value).toBe('192.168.1.0/24');
      expect(result.deltas).toBe(0);
    });

    test('converts to uppercase', () => {
      const result = sanitizeString('fe80::1', 'ip');
      expect(result.value).toBe('FE80::1');
      // Case changes are not counted as deltas for IP (intentional normalization)
      expect(result.deltas).toBe(0);
    });

    test('removes invalid characters', () => {
      const result = sanitizeString('192.168.1.1 !@#', 'ip');
      expect(result.value).toBe('192.168.1.1');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('allows hyphen for IPv6', () => {
      const result = sanitizeString('fe80-1', 'ip');
      expect(result.value).toBe('FE80-1');
      // Case changes are not counted as deltas for IP (intentional normalization)
      expect(result.deltas).toBe(0);
    });

    test('removes non-hex letters (g-z)', () => {
      const result = sanitizeString('192.168.1.1xyz', 'ip');
      expect(result.value).toBe('192.168.1.1');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('allows only hex letters a-f', () => {
      const result = sanitizeString('abcdefghij', 'ip');
      expect(result.value).toBe('ABCDEF');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('rejects word that looks like IP but has invalid chars', () => {
      const result = sanitizeString('NOTANIP', 'ip');
      expect(result.value).toBe('A');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('type: phone', () => {
    test('allows standard phone format', () => {
      const result = sanitizeString('+1 (555) 123-4567', 'phone');
      expect(result.value).toBe('+1 (555) 123-4567');
      expect(result.deltas).toBe(0);
    });

    test('allows extension format', () => {
      const result = sanitizeString('555-123-4567 x123', 'phone');
      expect(result.value).toBe('555-123-4567 x123');
      expect(result.deltas).toBe(0);
    });

    test('allows international format with periods', () => {
      const result = sanitizeString('+1.555.123.4567', 'phone');
      expect(result.value).toBe('+1.555.123.4567');
      expect(result.deltas).toBe(0);
    });

    test('removes letters except x', () => {
      const result = sanitizeString('555-CALL-NOW', 'phone');
      expect(result.value).toBe('555--');
      expect(result.deltas).toBeGreaterThan(0);
    });

    test('removes invalid characters', () => {
      const result = sanitizeString('555@123#4567', 'phone');
      expect(result.value).toBe('5551234567');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('trims result', () => {
    test('trims leading and trailing whitespace', () => {
      const result = sanitizeString('  hello world  ', 'general');
      expect(result.value).toBe('hello world');
      expect(result.deltas).toBeGreaterThan(0);
    });
  });

  describe('empty string handling', () => {
    test('handles empty string input', () => {
      const result = sanitizeString('', 'general');
      expect(result.value).toBe('');
      expect(result.deltas).toBe(0);
    });
  });

  describe('error handling', () => {
    test('returns empty string and deltas > 0 when an error occurs', () => {
      const originalReplace = String.prototype.replace;
      let callCount = 0;

      // Spy on logger.error to prevent Winston from using String.prototype.replace
      // which we've monkey-patched for this test
      const errorSpy = spyOn(elog, 'error').mockImplementation(() => elog);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (String.prototype as any).replace = function (
        this: string,
        ...args: unknown[]
      ): string {
        callCount++;
        // Let the first 13 cleanup replace calls succeed
        // Then throw on the 14th call (inside switch case)
        if (callCount > 13) {
          throw new Error('Test error');
        }
        return (originalReplace as Function).apply(this, args);
      };

      try {
        const result = sanitizeString('test', 'alphanumdash');
        expect(result.value).toBe('');
        expect(result.deltas).toBeGreaterThan(0);
        expect(errorSpy).toHaveBeenCalled();
      } finally {
        String.prototype.replace = originalReplace;
        errorSpy.mockRestore();
      }
    });
  });
});

describe('sanitizePathForLog', () => {
  test('preserves segments safe for alphanumdashstop', () => {
    expect(sanitizePathForLog('/api/themes')).toBe('/api/themes');
    expect(sanitizePathForLog('/api/account/settings')).toBe('/api/account/settings');
    expect(sanitizePathForLog('/api/v1/releases/latest/latest-mac.yml')).toBe(
      '/api/v1/releases/latest/latest-mac.yml',
    );
  });

  test('applies alphanumdashstop sanitization to unknown segments', () => {
    expect(sanitizePathForLog('/api/foo_bar/baz')).toBe('/api/foobar/baz');
    expect(sanitizePathForLog('/api/v2.0/info')).toBe('/api/v2.0/info');
  });

  test('strips template-injection patterns and control characters from segments', () => {
    expect(sanitizePathForLog('/api/foo${bar}/ok')).toBe('/api/foobar/ok');
    expect(sanitizePathForLog('/api/evil\u0000segment/end')).toBe('/api/evilsegment/end');
  });

  test('redacts 24-char hex segments as ObjectId-shaped ids', () => {
    expect(sanitizePathForLog('/api/conversations/507f1f77bcf86cd799439011/messages')).toBe(
      '/api/conversations/:id/messages',
    );
  });

  test('redacts UUID segments', () => {
    expect(
      sanitizePathForLog('/api/foo/550e8400-e29b-41d4-a716-446655440000/bar'),
    ).toBe('/api/foo/:uuid/bar');
  });

  test('truncates very long paths', () => {
    const long = '/api/' + 'x'.repeat(SANITIZED_PATH_MAX_LENGTH + 40);
    const got = sanitizePathForLog(long);
    expect(got.length).toBe(SANITIZED_PATH_MAX_LENGTH + 1);
    expect(got.endsWith('…')).toBe(true);
  });

  test('root path', () => {
    expect(sanitizePathForLog('/')).toBe('/');
  });
});

const VALID_OBJ_ID = '507f1f77bcf86cd799439011';

describe('sanitizeObjectId', () => {
  test('accepts valid 24-char hex', () => {
    expect(sanitizeObjectId(VALID_OBJ_ID)).toEqual({ ok: true, id: VALID_OBJ_ID });
  });

  test('strips zero-width joiner inside hex', () => {
    const withZw = VALID_OBJ_ID.slice(0, 12) + '\u200d' + VALID_OBJ_ID.slice(12);
    expect(sanitizeObjectId(withZw)).toEqual({ ok: true, id: VALID_OBJ_ID });
  });

  test('rejects invalid hex', () => {
    expect(sanitizeObjectId('not-an-object-id!!!')).toEqual({ ok: false });
    expect(sanitizeObjectId(undefined)).toEqual({ ok: false });
  });
});

describe('parseOptionalObjectIdCursor', () => {
  test('returns id for valid cursor', () => {
    expect(parseOptionalObjectIdCursor(VALID_OBJ_ID)).toBe(VALID_OBJ_ID);
  });

  test('returns undefined for null or invalid', () => {
    expect(parseOptionalObjectIdCursor(null)).toBeUndefined();
    expect(parseOptionalObjectIdCursor('bad')).toBeUndefined();
  });
});
