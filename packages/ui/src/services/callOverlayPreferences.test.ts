import { beforeEach, describe, expect, test } from 'bun:test';
import {
  CALL_OVERLAY_MIN_HEIGHT_PX,
  CALL_OVERLAY_TOP_OFFSET_PX,
  clampCallOverlayHeight,
  getConversationViewHeightPx,
  getDefaultCallOverlayHeightPx,
  readStoredCallOverlayHeight,
  resolveInitialCallOverlayHeight,
  writeStoredCallOverlayHeight,
  CALL_OVERLAY_HEIGHT_STORAGE_KEY,
} from './callOverlayPreferences';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}

describe('clampCallOverlayHeight', () => {
  test('clamps below minimum', () => {
    expect(clampCallOverlayHeight(100, 900)).toBe(CALL_OVERLAY_MIN_HEIGHT_PX);
  });

  test('clamps above maximum reserve', () => {
    expect(clampCallOverlayHeight(2000, 900)).toBeLessThan(900);
  });

  test('preserves value within bounds', () => {
    expect(clampCallOverlayHeight(400, 900)).toBe(400);
  });
});

describe('getDefaultCallOverlayHeightPx', () => {
  test('returns two thirds of conversation view height', () => {
    const viewportHeight = 900;
    const expected = Math.round(getConversationViewHeightPx(viewportHeight) * (2 / 3));
    expect(getDefaultCallOverlayHeightPx(viewportHeight)).toBe(expected);
    expect(getDefaultCallOverlayHeightPx(viewportHeight)).toBeGreaterThan(
      Math.round((viewportHeight - CALL_OVERLAY_TOP_OFFSET_PX) * 0.5),
    );
  });
});

describe('call overlay height storage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  test('writes and reads stored height', () => {
    localStorage.removeItem(CALL_OVERLAY_HEIGHT_STORAGE_KEY);
    writeStoredCallOverlayHeight(420);
    expect(readStoredCallOverlayHeight()).toBe(420);
    localStorage.removeItem(CALL_OVERLAY_HEIGHT_STORAGE_KEY);
  });

  test('ignores invalid stored values', () => {
    localStorage.setItem(CALL_OVERLAY_HEIGHT_STORAGE_KEY, 'not-a-number');
    expect(readStoredCallOverlayHeight()).toBeNull();
    localStorage.removeItem(CALL_OVERLAY_HEIGHT_STORAGE_KEY);
  });

  test('resolveInitialCallOverlayHeight prefers stored value when valid', () => {
    localStorage.setItem(CALL_OVERLAY_HEIGHT_STORAGE_KEY, '450');
    expect(resolveInitialCallOverlayHeight(1000)).toBe(450);
    localStorage.removeItem(CALL_OVERLAY_HEIGHT_STORAGE_KEY);
  });
});
