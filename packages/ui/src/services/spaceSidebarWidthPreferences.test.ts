import { beforeEach, describe, expect, test } from 'bun:test';
import {
  SPACE_SIDEBAR_DEFAULT_WIDTH_PX,
  SPACE_SIDEBAR_MIN_WIDTH_PX,
  SPACE_SIDEBAR_WIDTH_STORAGE_KEY,
  clampSpaceSidebarWidth,
  getSpaceSidebarMaxWidthPx,
  readStoredSpaceSidebarWidth,
  resolveInitialSpaceSidebarWidth,
  writeStoredSpaceSidebarWidth,
} from './spaceSidebarWidthPreferences';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}

describe('clampSpaceSidebarWidth', () => {
  test('clamps below minimum', () => {
    expect(clampSpaceSidebarWidth(100, 1280)).toBe(SPACE_SIDEBAR_MIN_WIDTH_PX);
  });

  test('clamps above maximum', () => {
    const max = getSpaceSidebarMaxWidthPx(1280);
    expect(clampSpaceSidebarWidth(900, 1280)).toBe(max);
  });

  test('preserves default', () => {
    expect(clampSpaceSidebarWidth(SPACE_SIDEBAR_DEFAULT_WIDTH_PX, 1280)).toBe(
      SPACE_SIDEBAR_DEFAULT_WIDTH_PX,
    );
  });
});

describe('space sidebar width storage', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  test('writes and reads stored width', () => {
    writeStoredSpaceSidebarWidth(300);
    expect(readStoredSpaceSidebarWidth()).toBe(300);
    localStorage.removeItem(SPACE_SIDEBAR_WIDTH_STORAGE_KEY);
  });

  test('resolveInitial prefers stored value when valid', () => {
    localStorage.setItem(SPACE_SIDEBAR_WIDTH_STORAGE_KEY, '310');
    expect(resolveInitialSpaceSidebarWidth(1280)).toBe(310);
  });

  test('resolveInitial falls back to default', () => {
    localStorage.removeItem(SPACE_SIDEBAR_WIDTH_STORAGE_KEY);
    expect(resolveInitialSpaceSidebarWidth(1280)).toBe(SPACE_SIDEBAR_DEFAULT_WIDTH_PX);
  });
});
