import { describe, it, expect, beforeEach } from 'bun:test';
import {
  getNativeNotificationsEnabled,
  setNativeNotificationsEnabled,
} from './useNativeNotificationsPreference';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
}

describe('native notifications preference (localStorage)', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  it('defaults to false', () => {
    expect(getNativeNotificationsEnabled()).toBe(false);
  });

  it('persists true and false', () => {
    setNativeNotificationsEnabled(true);
    expect(getNativeNotificationsEnabled()).toBe(true);
    setNativeNotificationsEnabled(false);
    expect(getNativeNotificationsEnabled()).toBe(false);
  });
});
