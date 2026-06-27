/**
 * LiveKit controller unit tests.
 *
 * Validates that exceedsCap is orientation-agnostic: portrait and landscape
 * streams with equivalent dimensions are treated the same.
 */

import { describe, expect, test } from 'bun:test';
import { exceedsCap } from './livekit.controller';

describe('exceedsCap', () => {
  const cap = { width: 1280, height: 720 };

  test('landscape within cap', () => {
    expect(exceedsCap(1280, 720, cap)).toBe(false);
  });

  test('portrait within cap (rotated dimensions)', () => {
    expect(exceedsCap(720, 1280, cap)).toBe(false);
  });

  test('landscape below cap', () => {
    expect(exceedsCap(960, 540, cap)).toBe(false);
  });

  test('portrait below cap', () => {
    expect(exceedsCap(540, 960, cap)).toBe(false);
  });

  test('landscape exceeds cap width', () => {
    expect(exceedsCap(1920, 720, cap)).toBe(true);
  });

  test('portrait exceeds (long edge too large)', () => {
    expect(exceedsCap(720, 1920, cap)).toBe(true);
  });

  test('landscape exceeds cap height only', () => {
    expect(exceedsCap(1280, 1080, cap)).toBe(true);
  });

  test('portrait exceeds (short edge too large)', () => {
    expect(exceedsCap(1080, 1280, cap)).toBe(true);
  });

  test('both dimensions exceed', () => {
    expect(exceedsCap(1920, 1080, cap)).toBe(true);
  });

  test('exactly at cap boundary returns false', () => {
    expect(exceedsCap(1280, 720, cap)).toBe(false);
    expect(exceedsCap(720, 1280, cap)).toBe(false);
  });

  test('zero dimensions do not exceed', () => {
    expect(exceedsCap(0, 0, cap)).toBe(false);
  });

  test('square cap treats portrait and landscape equally', () => {
    const squareCap = { width: 1080, height: 1080 };
    expect(exceedsCap(1080, 720, squareCap)).toBe(false);
    expect(exceedsCap(720, 1080, squareCap)).toBe(false);
    expect(exceedsCap(1081, 720, squareCap)).toBe(true);
    expect(exceedsCap(720, 1081, squareCap)).toBe(true);
  });
});
