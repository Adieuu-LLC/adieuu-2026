import { describe, expect, it } from 'bun:test';
import {
  MAX_LOADED_MESSAGES,
  trimMessagesBuffer,
  computeIsAtBottom,
  computeScrollTopAfterPrepend,
  readDistanceFromBottom,
  applyDistanceFromBottom,
  scrollViewportCanScroll,
} from './conversationScrollUtils';

describe('trimMessagesBuffer', () => {
  it('returns unchanged when under cap', () => {
    const m = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));
    expect(trimMessagesBuffer(m, true)).toBe(m);
    expect(trimMessagesBuffer(m, false)).toBe(m);
  });

  it('keeps newest messages when at bottom', () => {
    const m = Array.from({ length: MAX_LOADED_MESSAGES + 10 }, (_, i) => ({ id: String(i) }));
    const t = trimMessagesBuffer(m, true);
    expect(t).toHaveLength(MAX_LOADED_MESSAGES);
    expect(t[0]!.id).toBe('0');
    expect(t[MAX_LOADED_MESSAGES - 1]!.id).toBe(String(MAX_LOADED_MESSAGES - 1));
  });

  it('keeps oldest messages when not at bottom', () => {
    const m = Array.from({ length: MAX_LOADED_MESSAGES + 10 }, (_, i) => ({ id: String(i) }));
    const t = trimMessagesBuffer(m, false);
    expect(t).toHaveLength(MAX_LOADED_MESSAGES);
    expect(t[0]!.id).toBe('10');
    expect(t[MAX_LOADED_MESSAGES - 1]!.id).toBe(String(MAX_LOADED_MESSAGES + 9));
  });

  it('when not at bottom, also keeps newest unreadCount for unread marker alignment', () => {
    const total = MAX_LOADED_MESSAGES + 20;
    const m = Array.from({ length: total }, (_, i) => ({ id: `m${i}` }));
    const t = trimMessagesBuffer(m, false, 5);
    expect(t.some((x) => x.id === 'm0')).toBe(true);
    expect(t.some((x) => x.id === 'm4')).toBe(true);
    expect(t.some((x) => x.id === 'm139')).toBe(true);
    expect(t.some((x) => x.id === 'm19')).toBe(false);
  });
});

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
});

describe('computeScrollTopAfterPrepend', () => {
  it('adjusts scrollTop by height delta', () => {
    expect(computeScrollTopAfterPrepend(120, 800, 1100)).toBe(420);
  });
});

describe('scrollViewportCanScroll', () => {
  it('is false when content does not exceed viewport (including epsilon)', () => {
    const el = { scrollHeight: 400, clientHeight: 400 } as unknown as HTMLElement;
    expect(scrollViewportCanScroll(el)).toBe(false);
    const narrow = { scrollHeight: 402, clientHeight: 400 } as unknown as HTMLElement;
    expect(scrollViewportCanScroll(narrow)).toBe(false);
  });

  it('is true when content clearly exceeds viewport', () => {
    const el = { scrollHeight: 2000, clientHeight: 400 } as unknown as HTMLElement;
    expect(scrollViewportCanScroll(el)).toBe(true);
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
});
