import { beforeEach, describe, expect, test } from 'bun:test';
import {
  getActivityPreferences,
  saveActivityPreferences,
} from './deviceActivityPreferences';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string): void { this.map.delete(key); }
  setItem(key: string, value: string): void { this.map.set(key, value); }
}

describe('deviceActivityPreferences', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  test('returns defaults when unset', () => {
    expect(getActivityPreferences()).toEqual({ mode: 'disabled', intervalMinutes: 15 });
  });

  test('persists and reads preferences', () => {
    saveActivityPreferences({ mode: 'periodic', intervalMinutes: 30 });
    expect(getActivityPreferences()).toEqual({ mode: 'periodic', intervalMinutes: 30 });
  });
});
