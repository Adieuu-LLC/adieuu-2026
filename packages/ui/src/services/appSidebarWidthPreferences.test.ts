import { beforeEach, describe, expect, test } from 'bun:test';
import {
  APP_SIDEBAR_CONDENSED_LAYOUT_BELOW_PX,
  APP_SIDEBAR_DEFAULT_CAP_PX,
  APP_SIDEBAR_MIN_WIDTH_PX,
  APP_SIDEBAR_WIDTH_STORAGE_KEY,
  clampAppSidebarWidth,
  getAppSidebarMaxWidthPx,
  getDefaultAppSidebarWidthPx,
  readStoredAppSidebarWidth,
  resolveInitialAppSidebarWidth,
  writeStoredAppSidebarWidth,
} from './appSidebarWidthPreferences';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}

describe('getDefaultAppSidebarWidthPx', () => {
  test('matches historical min(20vw, 300) default', () => {
    expect(getDefaultAppSidebarWidthPx(1280)).toBe(Math.min(Math.round(1280 * 0.2), APP_SIDEBAR_DEFAULT_CAP_PX));
    expect(getDefaultAppSidebarWidthPx(2000)).toBe(APP_SIDEBAR_DEFAULT_CAP_PX);
  });
});

describe('clampAppSidebarWidth', () => {
  test('does not go below condensed width', () => {
    expect(clampAppSidebarWidth(40, 1280)).toBe(APP_SIDEBAR_MIN_WIDTH_PX);
  });

  test('clamps to viewport-aware max', () => {
    const max = getAppSidebarMaxWidthPx(1280);
    expect(clampAppSidebarWidth(2000, 1280)).toBe(max);
  });

  test('preserves in-range values', () => {
    expect(clampAppSidebarWidth(240, 1280)).toBe(240);
  });
});

describe('app sidebar width storage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  test('writes and reads stored width', () => {
    writeStoredAppSidebarWidth(260);
    expect(readStoredAppSidebarWidth()).toBe(260);
    localStorage.removeItem(APP_SIDEBAR_WIDTH_STORAGE_KEY);
  });

  test('does not persist widths below the condensed-layout threshold', () => {
    writeStoredAppSidebarWidth(260);
    writeStoredAppSidebarWidth(APP_SIDEBAR_CONDENSED_LAYOUT_BELOW_PX - 1);
    expect(readStoredAppSidebarWidth()).toBe(260);
  });

  test('resolveInitial prefers stored value when valid', () => {
    localStorage.setItem(APP_SIDEBAR_WIDTH_STORAGE_KEY, '275');
    expect(resolveInitialAppSidebarWidth(1280)).toBe(275);
  });
});
