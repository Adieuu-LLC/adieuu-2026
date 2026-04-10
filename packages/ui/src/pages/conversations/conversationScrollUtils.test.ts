import { describe, expect, it } from 'bun:test';
import {
  MAX_LOADED_MESSAGES,
  trimMessagesBuffer,
  computeIsAtBottom,
  computeScrollTopAfterPrepend,
} from './conversationScrollUtils';

describe('trimMessagesBuffer', () => {
  it('returns unchanged when under cap', () => {
    const m = Array.from({ length: 10 }, (_, i) => i);
    expect(trimMessagesBuffer(m, true)).toBe(m);
    expect(trimMessagesBuffer(m, false)).toBe(m);
  });

  it('keeps newest messages when at bottom', () => {
    const m = Array.from({ length: MAX_LOADED_MESSAGES + 10 }, (_, i) => i);
    const t = trimMessagesBuffer(m, true);
    expect(t).toHaveLength(MAX_LOADED_MESSAGES);
    expect(t[0]).toBe(0);
    expect(t[MAX_LOADED_MESSAGES - 1]).toBe(MAX_LOADED_MESSAGES - 1);
  });

  it('keeps oldest messages when not at bottom', () => {
    const m = Array.from({ length: MAX_LOADED_MESSAGES + 10 }, (_, i) => i);
    const t = trimMessagesBuffer(m, false);
    expect(t).toHaveLength(MAX_LOADED_MESSAGES);
    expect(t[0]).toBe(10);
    expect(t[MAX_LOADED_MESSAGES - 1]).toBe(MAX_LOADED_MESSAGES + 9);
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
