import { describe, expect, test } from 'bun:test';

import {
  randomBytes,
  toBase64,
  fromBase64,
  toBase64Url,
  fromBase64Url,
  toHex,
  fromHex,
  toBytes,
  fromBytes,
  concatBytes,
  constantTimeEqual,
  clearBytes,
  copyBytes,
} from './utils';

describe('utils', () => {
  describe('randomBytes', () => {
    test('generates bytes of requested length', () => {
      expect(randomBytes(0).length).toBe(0);
      expect(randomBytes(1).length).toBe(1);
      expect(randomBytes(16).length).toBe(16);
      expect(randomBytes(32).length).toBe(32);
      expect(randomBytes(64).length).toBe(64);
    });

    test('returns Uint8Array', () => {
      const bytes = randomBytes(32);
      expect(bytes).toBeInstanceOf(Uint8Array);
    });

    test('generates different values on each call', () => {
      const values = new Set<string>();
      for (let i = 0; i < 100; i++) {
        values.add(toHex(randomBytes(32)));
      }
      expect(values.size).toBe(100);
    });

    test('generates non-zero bytes', () => {
      // Statistically, 32 random bytes should not all be zero
      const bytes = randomBytes(32);
      const hasNonZero = bytes.some((b) => b !== 0);
      expect(hasNonZero).toBe(true);
    });

    test('has reasonable distribution', () => {
      // Generate many bytes and check distribution
      const bytes = randomBytes(10000);
      const counts = new Array(256).fill(0);
      for (const b of bytes) {
        counts[b]++;
      }
      // Each byte value should appear roughly 39 times (10000/256)
      // Allow variance of +/- 50%
      for (let i = 0; i < 256; i++) {
        expect(counts[i]).toBeGreaterThan(10);
        expect(counts[i]).toBeLessThan(80);
      }
    });
  });

  describe('toBase64 / fromBase64', () => {
    test('encodes empty array', () => {
      expect(toBase64(new Uint8Array([]))).toBe('');
    });

    test('encodes single byte', () => {
      expect(toBase64(new Uint8Array([0]))).toBe('AA==');
      expect(toBase64(new Uint8Array([255]))).toBe('/w==');
    });

    test('encodes "Hello"', () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      expect(toBase64(bytes)).toBe('SGVsbG8=');
    });

    test('encodes binary data', () => {
      const bytes = new Uint8Array([0, 255, 128, 64, 32, 16, 8, 4, 2, 1]);
      const encoded = toBase64(bytes);
      expect(encoded).toBe('AP+AQCAQCAQCAQ==');
    });

    test('decodes empty string', () => {
      const decoded = fromBase64('');
      expect(decoded.length).toBe(0);
    });

    test('decodes "Hello"', () => {
      const decoded = fromBase64('SGVsbG8=');
      expect(Array.from(decoded)).toEqual([72, 101, 108, 108, 111]);
    });

    test('roundtrip preserves data', () => {
      const original = randomBytes(100);
      const roundtrip = fromBase64(toBase64(original));
      expect(constantTimeEqual(original, roundtrip)).toBe(true);
    });

    test('handles all byte values', () => {
      const allBytes = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        allBytes[i] = i;
      }
      const roundtrip = fromBase64(toBase64(allBytes));
      expect(constantTimeEqual(allBytes, roundtrip)).toBe(true);
    });
  });

  describe('toBase64Url / fromBase64Url', () => {
    test('encodes without padding', () => {
      const encoded = toBase64Url(new Uint8Array([72, 101, 108, 108, 111]));
      expect(encoded).not.toContain('=');
      expect(encoded).toBe('SGVsbG8');
    });

    test('replaces + with -', () => {
      // Find a value that produces + in standard base64
      const bytes = new Uint8Array([251, 239]);
      const standardBase64 = toBase64(bytes);
      expect(standardBase64).toContain('+');
      const urlSafe = toBase64Url(bytes);
      expect(urlSafe).not.toContain('+');
      expect(urlSafe).toContain('-');
    });

    test('replaces / with _', () => {
      // Find a value that produces / in standard base64
      const bytes = new Uint8Array([255, 255]);
      const standardBase64 = toBase64(bytes);
      expect(standardBase64).toContain('/');
      const urlSafe = toBase64Url(bytes);
      expect(urlSafe).not.toContain('/');
      expect(urlSafe).toContain('_');
    });

    test('roundtrip preserves data', () => {
      const original = randomBytes(100);
      const roundtrip = fromBase64Url(toBase64Url(original));
      expect(constantTimeEqual(original, roundtrip)).toBe(true);
    });

    test('handles empty input', () => {
      expect(toBase64Url(new Uint8Array([]))).toBe('');
      expect(fromBase64Url('').length).toBe(0);
    });

    test('handles single byte', () => {
      const byte = new Uint8Array([42]);
      expect(fromBase64Url(toBase64Url(byte))).toEqual(byte);
    });

    test('handles two bytes', () => {
      const bytes = new Uint8Array([42, 43]);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    });

    test('handles three bytes (no padding needed)', () => {
      const bytes = new Uint8Array([42, 43, 44]);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    });
  });

  describe('toHex / fromHex', () => {
    test('encodes empty array', () => {
      expect(toHex(new Uint8Array([]))).toBe('');
    });

    test('encodes single byte', () => {
      expect(toHex(new Uint8Array([0]))).toBe('00');
      expect(toHex(new Uint8Array([15]))).toBe('0f');
      expect(toHex(new Uint8Array([255]))).toBe('ff');
    });

    test('encodes multiple bytes', () => {
      expect(toHex(new Uint8Array([255, 0, 171]))).toBe('ff00ab');
    });

    test('uses lowercase', () => {
      const hex = toHex(new Uint8Array([171, 205, 239]));
      expect(hex).toBe('abcdef');
      expect(hex).not.toMatch(/[A-F]/);
    });

    test('decodes empty string', () => {
      expect(fromHex('').length).toBe(0);
    });

    test('decodes lowercase', () => {
      expect(Array.from(fromHex('ff00ab'))).toEqual([255, 0, 171]);
    });

    test('decodes uppercase', () => {
      expect(Array.from(fromHex('FF00AB'))).toEqual([255, 0, 171]);
    });

    test('decodes mixed case', () => {
      expect(Array.from(fromHex('fF00Ab'))).toEqual([255, 0, 171]);
    });

    test('throws on odd length', () => {
      expect(() => fromHex('abc')).toThrow('Hex string must have even length');
    });

    test('throws on invalid characters', () => {
      expect(() => fromHex('gg')).toThrow('Invalid hex character at position 0');
      expect(() => fromHex('abgh')).toThrow('Invalid hex character at position 2');
    });

    test('roundtrip preserves data', () => {
      const original = randomBytes(100);
      const roundtrip = fromHex(toHex(original));
      expect(constantTimeEqual(original, roundtrip)).toBe(true);
    });
  });

  describe('toBytes / fromBytes', () => {
    test('encodes empty string', () => {
      expect(toBytes('').length).toBe(0);
    });

    test('encodes ASCII', () => {
      const bytes = toBytes('Hello');
      expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
    });

    test('encodes UTF-8 multibyte characters', () => {
      // Euro sign: U+20AC = 0xE2 0x82 0xAC in UTF-8
      const bytes = toBytes('\u20AC');
      expect(Array.from(bytes)).toEqual([0xe2, 0x82, 0xac]);
    });

    test('encodes emoji', () => {
      // Smiley: U+1F600 = 0xF0 0x9F 0x98 0x80 in UTF-8
      const bytes = toBytes('\u{1F600}');
      expect(Array.from(bytes)).toEqual([0xf0, 0x9f, 0x98, 0x80]);
    });

    test('decodes empty array', () => {
      expect(fromBytes(new Uint8Array([]))).toBe('');
    });

    test('decodes ASCII', () => {
      expect(fromBytes(new Uint8Array([72, 101, 108, 108, 111]))).toBe('Hello');
    });

    test('roundtrip preserves data', () => {
      const original = 'Hello, World!';
      expect(fromBytes(toBytes(original))).toBe(original);
    });

    test('roundtrip preserves unicode', () => {
      const original = 'Hello \u{1F600} World!';
      expect(fromBytes(toBytes(original))).toBe(original);
    });
  });

  describe('concatBytes', () => {
    test('concatenates zero arrays', () => {
      expect(concatBytes().length).toBe(0);
    });

    test('concatenates one array', () => {
      const arr = new Uint8Array([1, 2, 3]);
      const result = concatBytes(arr);
      expect(Array.from(result)).toEqual([1, 2, 3]);
    });

    test('concatenates two arrays', () => {
      const result = concatBytes(
        new Uint8Array([1, 2]),
        new Uint8Array([3, 4])
      );
      expect(Array.from(result)).toEqual([1, 2, 3, 4]);
    });

    test('concatenates multiple arrays', () => {
      const result = concatBytes(
        new Uint8Array([1]),
        new Uint8Array([2, 3]),
        new Uint8Array([4, 5, 6]),
        new Uint8Array([7])
      );
      expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    test('handles empty arrays', () => {
      const result = concatBytes(
        new Uint8Array([]),
        new Uint8Array([1, 2]),
        new Uint8Array([]),
        new Uint8Array([3])
      );
      expect(Array.from(result)).toEqual([1, 2, 3]);
    });

    test('returns new array (not reference)', () => {
      const original = new Uint8Array([1, 2, 3]);
      const result = concatBytes(original);
      expect(result).not.toBe(original);
      original[0] = 99;
      expect(result[0]).toBe(1);
    });
  });

  describe('constantTimeEqual', () => {
    test('returns true for equal arrays', () => {
      expect(
        constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))
      ).toBe(true);
    });

    test('returns true for empty arrays', () => {
      expect(
        constantTimeEqual(new Uint8Array([]), new Uint8Array([]))
      ).toBe(true);
    });

    test('returns false for different content', () => {
      expect(
        constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))
      ).toBe(false);
    });

    test('returns false for different lengths', () => {
      expect(
        constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))
      ).toBe(false);
      expect(
        constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))
      ).toBe(false);
    });

    test('returns false comparing empty to non-empty', () => {
      expect(
        constantTimeEqual(new Uint8Array([]), new Uint8Array([1]))
      ).toBe(false);
      expect(
        constantTimeEqual(new Uint8Array([1]), new Uint8Array([]))
      ).toBe(false);
    });

    test('handles long arrays', () => {
      const a = randomBytes(10000);
      const b = copyBytes(a);
      expect(constantTimeEqual(a, b)).toBe(true);

      // Change one byte
      b[5000] = (b[5000]! + 1) % 256;
      expect(constantTimeEqual(a, b)).toBe(false);
    });

    test('handles single byte difference at end', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([1, 2, 3, 4, 6]);
      expect(constantTimeEqual(a, b)).toBe(false);
    });

    test('handles single byte difference at start', () => {
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new Uint8Array([0, 2, 3, 4, 5]);
      expect(constantTimeEqual(a, b)).toBe(false);
    });
  });

  describe('clearBytes', () => {
    test('zeros all bytes', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5]);
      clearBytes(bytes);
      expect(bytes.every((b) => b === 0)).toBe(true);
    });

    test('handles empty array', () => {
      const bytes = new Uint8Array([]);
      clearBytes(bytes);
      expect(bytes.length).toBe(0);
    });

    test('handles large array', () => {
      const bytes = randomBytes(10000);
      clearBytes(bytes);
      expect(bytes.every((b) => b === 0)).toBe(true);
    });

    test('mutates original array', () => {
      const bytes = new Uint8Array([1, 2, 3]);
      clearBytes(bytes);
      expect(bytes[0]).toBe(0);
    });
  });

  describe('copyBytes', () => {
    test('creates copy with same content', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5]);
      const copy = copyBytes(original);
      expect(constantTimeEqual(original, copy)).toBe(true);
    });

    test('creates independent copy', () => {
      const original = new Uint8Array([1, 2, 3]);
      const copy = copyBytes(original);
      original[0] = 99;
      expect(copy[0]).toBe(1);
    });

    test('handles empty array', () => {
      const copy = copyBytes(new Uint8Array([]));
      expect(copy.length).toBe(0);
    });

    test('handles large array', () => {
      const original = randomBytes(10000);
      const copy = copyBytes(original);
      expect(constantTimeEqual(original, copy)).toBe(true);
      expect(copy).not.toBe(original);
    });
  });
});
