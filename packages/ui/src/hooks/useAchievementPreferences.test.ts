import { describe, it, expect, beforeEach } from 'bun:test';
import {
  loadAchievementPreferences,
  saveAchievementSoundId,
  saveAchievementSoundVolume,
} from './useAchievementPreferences';

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

describe('useAchievementPreferences (localStorage)', () => {
  const identityId = 'test-identity-1';

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  it('defaults achievement sound volume to 100%', () => {
    const p = loadAchievementPreferences(identityId);
    expect(p.achievementSoundVolume).toBe(1);
  });

  it('persists and reloads achievement sound id and volume', () => {
    saveAchievementSoundId(identityId, 'chime');
    saveAchievementSoundVolume(identityId, 1.5);
    const p = loadAchievementPreferences(identityId);
    expect(p.achievementSoundId).toBe('chime');
    expect(p.achievementSoundVolume).toBe(1.5);
  });
});
