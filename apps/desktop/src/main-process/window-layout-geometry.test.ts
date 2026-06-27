import { describe, expect, test } from 'bun:test';
import { rectanglesIntersect } from './window-layout-geometry';

describe('rectanglesIntersect', () => {
  test('overlapping rects', () => {
    expect(rectanglesIntersect({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: 50, width: 100, height: 100 })).toBe(
      true,
    );
  });

  test('separate rects', () => {
    expect(rectanglesIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 10, height: 10 })).toBe(
      false,
    );
  });

  test('touching edges does not count as intersect', () => {
    expect(rectanglesIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(
      false,
    );
    expect(rectanglesIntersect({ x: 0, y: 0, width: 11, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(
      true,
    );
  });
});
