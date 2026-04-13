import { describe, it, expect } from 'bun:test';
import { parseHexRgb } from './badge-color';

describe('parseHexRgb', () => {
  it('parses valid 6-digit hex', () => {
    expect(parseHexRgb('#22d3ee')).toEqual({ r: 0x22, g: 0xd3, b: 0xee });
    expect(parseHexRgb('#AbCdEf')).toEqual({ r: 0xab, g: 0xcd, b: 0xef });
  });

  it('returns null for invalid strings', () => {
    expect(parseHexRgb('22d3ee')).toBeNull();
    expect(parseHexRgb('#22d3e')).toBeNull();
    expect(parseHexRgb('#gggggg')).toBeNull();
  });
});
