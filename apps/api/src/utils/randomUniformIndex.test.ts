import { describe, expect, test } from 'bun:test';
import { randomUniformIndex, tryUniformIndexFromByte } from './randomUniformIndex';

describe('tryUniformIndexFromByte', () => {
  test('rejects bytes in the partial range when alphabetLength does not divide 256', () => {
    expect(tryUniformIndexFromByte(249, 10)).toBe(9);
    expect(tryUniformIndexFromByte(250, 10)).toBeNull();
    expect(tryUniformIndexFromByte(255, 10)).toBeNull();
  });

  test('accepts all bytes when alphabetLength divides 256 (e.g. 32)', () => {
    for (let b = 0; b < 256; b++) {
      expect(tryUniformIndexFromByte(b, 32)).not.toBeNull();
    }
  });

  test('each index appears equally often for n=32 over all byte values', () => {
    const counts = new Array<number>(32).fill(0);
    for (let b = 0; b < 256; b++) {
      const idx = tryUniformIndexFromByte(b, 32);
      expect(idx).not.toBeNull();
      if (idx !== null) counts[idx]++;
    }
    for (const c of counts) {
      expect(c).toBe(8);
    }
  });

  test('throws when alphabetLength is out of range', () => {
    expect(() => tryUniformIndexFromByte(0, 0)).toThrow(RangeError);
    expect(() => tryUniformIndexFromByte(0, 257)).toThrow(RangeError);
  });
});

describe('randomUniformIndex', () => {
  test('throws when alphabetLength is out of range', () => {
    expect(() => randomUniformIndex(0)).toThrow(RangeError);
    expect(() => randomUniformIndex(257)).toThrow(RangeError);
  });

  test('returns only valid indices with live RNG', () => {
    const n = 10;
    for (let i = 0; i < 500; i++) {
      const idx = randomUniformIndex(n);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(n);
    }
  });

  test('retries when a byte is rejected (n=10)', () => {
    let call = 0;
    const rng = (size: number) => {
      expect(size).toBe(1);
      call += 1;
      if (call === 1) return Buffer.from([255]);
      return Buffer.from([5]);
    };
    expect(randomUniformIndex(10, rng)).toBe(5);
    expect(call).toBe(2);
  });
});

describe('backup code alphabet invariant', () => {
  test('documented charset length divides 256 (no single-byte rejection for current alphabet)', () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    expect(chars.length).toBe(32);
    expect(256 % chars.length).toBe(0);
  });
});
