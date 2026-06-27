import { beforeEach, describe, expect, test } from 'bun:test';
import {
  LS_CUSTOM_THEMES,
  loadCustomThemes,
  lsGet,
  lsSet,
} from './themeLocalPreferences';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}

describe('themeLocalPreferences', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  test('reads and writes values', () => {
    lsSet('k', 'v');
    expect(lsGet('k')).toBe('v');
  });

  test('loads custom themes array', () => {
    localStorage.setItem(LS_CUSTOM_THEMES, JSON.stringify([{ id: 'custom-1' }]));
    expect(loadCustomThemes()).toEqual([{ id: 'custom-1' }]);
  });
});
