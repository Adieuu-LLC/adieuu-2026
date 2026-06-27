import { describe, expect, test } from 'bun:test';

import { isValidObjectId } from './isValidObjectId';

describe('isValidObjectId', () => {
  describe('returns false for falsy or missing input', () => {
    test('empty string', () => {
      expect(isValidObjectId('')).toBe(false);
    });

    test('null coerced to string', () => {
      expect(isValidObjectId(null as unknown as string)).toBe(false);
    });

    test('undefined coerced to string', () => {
      expect(isValidObjectId(undefined as unknown as string)).toBe(false);
    });
  });

  describe('returns false for wrong length', () => {
    test('string shorter than 24 characters', () => {
      expect(isValidObjectId('507f1f77bcf86cd79943901')).toBe(false);
    });

    test('string longer than 24 characters', () => {
      expect(isValidObjectId('507f1f77bcf86cd7994390111')).toBe(false);
    });

    test('single character', () => {
      expect(isValidObjectId('a')).toBe(false);
    });
  });

  describe('returns true for valid ObjectId strings', () => {
    test('valid 24-character hex string', () => {
      expect(isValidObjectId('507f1f77bcf86cd799439011')).toBe(true);
    });

    test('valid ObjectId with all lowercase hex', () => {
      expect(isValidObjectId('aabbccddeeff001122334455')).toBe(true);
    });

    test('valid ObjectId with all uppercase hex', () => {
      expect(isValidObjectId('AABBCCDDEEFF001122334455')).toBe(true);
    });

    test('valid ObjectId with mixed case hex', () => {
      expect(isValidObjectId('AaBbCcDdEeFf001122334455')).toBe(true);
    });

    test('valid ObjectId with all zeros', () => {
      expect(isValidObjectId('000000000000000000000000')).toBe(true);
    });

    test('valid ObjectId with all f characters', () => {
      expect(isValidObjectId('ffffffffffffffffffffffff')).toBe(true);
    });
  });

  describe('returns false for invalid hex characters (triggers catch block)', () => {
    test('24 characters with non-hex letters', () => {
      expect(isValidObjectId('gggggggggggggggggggggggg')).toBe(false);
    });

    test('24 characters with special characters', () => {
      expect(isValidObjectId('507f1f77bcf86cd79943901!')).toBe(false);
    });

    test('24 characters with spaces', () => {
      expect(isValidObjectId('507f1f77bcf86cd7994390  ')).toBe(false);
    });

    test('24 characters with mixed invalid chars', () => {
      expect(isValidObjectId('xyz123xyz123xyz123xyz123')).toBe(false);
    });
  });
});
