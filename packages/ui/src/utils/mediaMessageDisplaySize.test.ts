import { describe, expect, it } from 'bun:test';
import { getContainedMediaDisplaySize, MEDIA_MESSAGE_INLINE_MAX_PX } from './mediaMessageDisplaySize';

describe('getContainedMediaDisplaySize', () => {
  it('scales tall portrait to fit max height in the inline cap box', () => {
    const m = MEDIA_MESSAGE_INLINE_MAX_PX;
    const { width, height } = getContainedMediaDisplaySize(1080, 1920, m, m);
    expect(width).toBeCloseTo(168.75, 1);
    expect(height).toBe(300);
  });

  it('scales wide landscape to fit max width in the inline cap box', () => {
    const m = MEDIA_MESSAGE_INLINE_MAX_PX;
    const { width, height } = getContainedMediaDisplaySize(1920, 1080, m, m);
    expect(width).toBe(300);
    expect(height).toBeCloseTo(168.75, 1);
  });

  it('uses grid bounds for multi-attach tile', () => {
    const { width, height } = getContainedMediaDisplaySize(1080, 1920, 280, 200);
    expect(width).toBeCloseTo(112.5, 1);
    expect(height).toBe(200);
  });

  it('returns zero for invalid intrinsics', () => {
    const m = MEDIA_MESSAGE_INLINE_MAX_PX;
    expect(getContainedMediaDisplaySize(0, 100, m, m).width).toBe(0);
  });
});
