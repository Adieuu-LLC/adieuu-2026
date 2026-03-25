import { describe, it, expect, beforeEach } from 'bun:test';
import {
  getNotificationSoundEnabled,
  setNotificationSoundEnabled,
  getNotificationSoundId,
  setNotificationSoundId,
  getNotificationSoundCustomPath,
  setNotificationSoundCustomPath,
  getNotificationSoundSuppressWhenFocused,
  setNotificationSoundSuppressWhenFocused,
} from './useNotificationSoundPreference';

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

describe('notification sound preference (localStorage)', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  it('defaults enabled to true', () => {
    expect(getNotificationSoundEnabled()).toBe(true);
  });

  it('persists enabled', () => {
    setNotificationSoundEnabled(false);
    expect(getNotificationSoundEnabled()).toBe(false);
    setNotificationSoundEnabled(true);
    expect(getNotificationSoundEnabled()).toBe(true);
  });

  it('defaults sound id to the default built-in preset', () => {
    expect(getNotificationSoundId()).toBe('win-low');
  });

  it('persists sound id', () => {
    setNotificationSoundId('ding');
    expect(getNotificationSoundId()).toBe('ding');
  });

  it('maps legacy stored ids to current built-in ids', () => {
    localStorage.setItem('adieuu.app.notificationSoundId', 'gentle');
    expect(getNotificationSoundId()).toBe('chime');
    localStorage.setItem('adieuu.app.notificationSoundId', 'bell');
    expect(getNotificationSoundId()).toBe('ding');
  });

  it('defaults custom path to null', () => {
    expect(getNotificationSoundCustomPath()).toBe(null);
  });

  it('persists custom path', () => {
    setNotificationSoundCustomPath('/home/user/ping.wav');
    expect(getNotificationSoundCustomPath()).toBe('/home/user/ping.wav');
    setNotificationSoundCustomPath(null);
    expect(getNotificationSoundCustomPath()).toBe(null);
  });

  it('defaults suppress when focused to true', () => {
    expect(getNotificationSoundSuppressWhenFocused()).toBe(true);
  });

  it('persists suppress when focused', () => {
    setNotificationSoundSuppressWhenFocused(false);
    expect(getNotificationSoundSuppressWhenFocused()).toBe(false);
  });
});
