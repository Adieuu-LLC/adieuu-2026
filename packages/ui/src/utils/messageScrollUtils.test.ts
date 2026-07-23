import { describe, expect, it } from 'bun:test';
import {
  computeIsAtBottom,
  computeScrollTopAfterPrepend,
  readDistanceFromBottom,
  applyDistanceFromBottom,
  scrollViewportCanScroll,
  applyHistoryScrollAnchor,
  SCROLL_OVERFLOW_EPS_PX,
  type HistoryScrollAnchor,
} from './messageScrollUtils';

describe('computeIsAtBottom', () => {
  it('returns true when content fits viewport', () => {
    expect(computeIsAtBottom(0, 400, 500, 900)).toBe(true);
  });

  it('returns true within threshold of bottom', () => {
    expect(computeIsAtBottom(100, 1000, 500, 900)).toBe(true);
  });

  it('returns false when far from bottom', () => {
    expect(computeIsAtBottom(0, 5000, 500, 50)).toBe(false);
  });

  it('returns true at exact bottom', () => {
    expect(computeIsAtBottom(500, 1000, 500, 0)).toBe(true);
  });

  it('returns true at threshold boundary', () => {
    const scrollTop = 0;
    const scrollHeight = 1000;
    const clientHeight = 500;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight; // 500
    expect(computeIsAtBottom(scrollTop, scrollHeight, clientHeight, 500)).toBe(true);
    expect(computeIsAtBottom(scrollTop, scrollHeight, clientHeight, 499)).toBe(false);
  });
});

describe('scrollViewportCanScroll', () => {
  it('is false when content does not exceed viewport (including epsilon)', () => {
    const el = { scrollHeight: 400, clientHeight: 400 } as unknown as HTMLElement;
    expect(scrollViewportCanScroll(el)).toBe(false);
    const narrow = { scrollHeight: 400 + SCROLL_OVERFLOW_EPS_PX, clientHeight: 400 } as unknown as HTMLElement;
    expect(scrollViewportCanScroll(narrow)).toBe(false);
  });

  it('is true when content clearly exceeds viewport', () => {
    const el = { scrollHeight: 2000, clientHeight: 400 } as unknown as HTMLElement;
    expect(scrollViewportCanScroll(el)).toBe(true);
  });
});

describe('computeScrollTopAfterPrepend', () => {
  it('adjusts scrollTop by height delta', () => {
    expect(computeScrollTopAfterPrepend(120, 800, 1100)).toBe(420);
  });

  it('handles no height change', () => {
    expect(computeScrollTopAfterPrepend(100, 800, 800)).toBe(100);
  });
});

describe('readDistanceFromBottom / applyDistanceFromBottom', () => {
  it('round-trips distance from bottom when content grows', () => {
    const el = {
      scrollHeight: 1000,
      scrollTop: 100,
      clientHeight: 200,
    } as unknown as HTMLElement;
    const dist = readDistanceFromBottom(el);
    expect(dist).toBe(700);
    el.scrollHeight = 1500;
    applyDistanceFromBottom(el, dist);
    expect(el.scrollTop).toBe(600);
  });

  it('clamps scrollTop to 0 when distanceFromBottom exceeds content', () => {
    const el = {
      scrollHeight: 300,
      scrollTop: 0,
      clientHeight: 200,
    } as unknown as HTMLElement;
    applyDistanceFromBottom(el, 5000);
    expect(el.scrollTop).toBe(0);
  });
});

describe('applyHistoryScrollAnchor', () => {
  function makeViewport(scrollTop: number) {
    return {
      scrollTop,
      getBoundingClientRect: () => ({ top: 0 }),
    } as unknown as HTMLElement;
  }

  it('returns "missing" when anchor element not found', () => {
    const vp = makeViewport(0);
    const content = {
      querySelector: () => null,
    } as unknown as HTMLElement;
    const anchor: HistoryScrollAnchor = { anchorKey: 'abc', targetViewportOffsetPx: 50 };
    expect(applyHistoryScrollAnchor(vp, content, anchor)).toBe('missing');
  });

  it('returns "aligned" when offset difference is negligible', () => {
    const vp = makeViewport(100);
    const content = {
      querySelector: () => ({
        getBoundingClientRect: () => ({ top: 50 }),
      }),
    } as unknown as HTMLElement;
    const anchor: HistoryScrollAnchor = { anchorKey: 'abc', targetViewportOffsetPx: 50 };
    expect(applyHistoryScrollAnchor(vp, content, anchor)).toBe('aligned');
    expect(vp.scrollTop).toBe(100);
  });

  it('returns "adjusted" and corrects scrollTop', () => {
    const vp = makeViewport(100);
    const content = {
      querySelector: () => ({
        getBoundingClientRect: () => ({ top: 80 }),
      }),
    } as unknown as HTMLElement;
    const anchor: HistoryScrollAnchor = { anchorKey: 'abc', targetViewportOffsetPx: 50 };
    expect(applyHistoryScrollAnchor(vp, content, anchor)).toBe('adjusted');
    expect(vp.scrollTop).toBe(130); // 100 + (80 - 50)
  });
});
