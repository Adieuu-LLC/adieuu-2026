import { describe, expect, test, beforeEach } from 'bun:test';
import {
  loadGifVisibility,
  saveGifVisibility,
  loadConversationGifHidden,
  saveConversationGifHidden,
  loadGifAnimateOnHoverOnlyIdentity,
  saveGifAnimateOnHoverOnlyIdentity,
  loadConversationGifAnimateOnHoverOverride,
  saveConversationGifAnimateOnHoverOverride,
  loadGifSendNow,
  saveGifSendNow,
} from './useGifPreference';

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

class ThrowingStorage implements Storage {
  constructor(private readonly fail: 'get' | 'set' | 'remove') {}

  get length(): number {
    return 0;
  }

  clear(): void {}

  getItem(_key: string): string | null {
    if (this.fail === 'get') throw new Error('Storage blocked');
    return null;
  }

  setItem(_key: string, _value: string): void {
    if (this.fail === 'set') throw new Error('Storage blocked');
  }

  removeItem(_key: string): void {
    if (this.fail === 'remove') throw new Error('Storage blocked');
  }

  key(_index: number): string | null {
    return null;
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
  saveGifSendNow(true);
});

describe('loadGifVisibility', () => {
  test('defaults to all', () => {
    expect(loadGifVisibility('id1')).toBe('all');
  });

  test('reads stored value', () => {
    localStorage.setItem('adieuu.gif-visibility.id1', 'disabled');
    expect(loadGifVisibility('id1')).toBe('disabled');
  });

  test('ignores invalid values', () => {
    localStorage.setItem('adieuu.gif-visibility.id1', 'bogus');
    expect(loadGifVisibility('id1')).toBe('all');
  });
});

describe('saveGifVisibility', () => {
  test('persists value', () => {
    saveGifVisibility('id2', 'friends_only');
    expect(localStorage.getItem('adieuu.gif-visibility.id2')).toBe('friends_only');
  });
});

describe('loadConversationGifHidden', () => {
  test('defaults to false', () => {
    expect(loadConversationGifHidden('conv1')).toBe(false);
  });

  test('reads stored true', () => {
    localStorage.setItem('adieuu.conv-gif-disabled.conv1', 'true');
    expect(loadConversationGifHidden('conv1')).toBe(true);
  });
});

describe('saveConversationGifHidden', () => {
  test('persists true', () => {
    saveConversationGifHidden('conv2', true);
    expect(localStorage.getItem('adieuu.conv-gif-disabled.conv2')).toBe('true');
  });

  test('removes key on false', () => {
    localStorage.setItem('adieuu.conv-gif-disabled.conv3', 'true');
    saveConversationGifHidden('conv3', false);
    expect(localStorage.getItem('adieuu.conv-gif-disabled.conv3')).toBeNull();
  });
});

describe('loadGifAnimateOnHoverOnlyIdentity', () => {
  test('defaults to false', () => {
    expect(loadGifAnimateOnHoverOnlyIdentity('id-a')).toBe(false);
  });

  test('reads true', () => {
    localStorage.setItem('adieuu.gif-animate-on-hover-only.id-a', 'true');
    expect(loadGifAnimateOnHoverOnlyIdentity('id-a')).toBe(true);
  });
});

describe('saveConversationGifAnimateOnHoverOverride', () => {
  test('stores override when different from identity default', () => {
    saveGifAnimateOnHoverOnlyIdentity('id-x', false);
    saveConversationGifAnimateOnHoverOverride('conv-x', true, false);
    expect(localStorage.getItem('adieuu.conv-gif-animate-on-hover.conv-x')).toBe('true');
  });

  test('removes key when matching identity default', () => {
    saveGifAnimateOnHoverOnlyIdentity('id-y', true);
    localStorage.setItem('adieuu.conv-gif-animate-on-hover.conv-y', 'false');
    saveConversationGifAnimateOnHoverOverride('conv-y', true, true);
    expect(localStorage.getItem('adieuu.conv-gif-animate-on-hover.conv-y')).toBeNull();
  });
});

describe('loadConversationGifAnimateOnHoverOverride', () => {
  test('returns undefined when absent', () => {
    expect(loadConversationGifAnimateOnHoverOverride('conv-z')).toBeUndefined();
  });

  test('reads boolean', () => {
    localStorage.setItem('adieuu.conv-gif-animate-on-hover.conv-z', 'false');
    expect(loadConversationGifAnimateOnHoverOverride('conv-z')).toBe(false);
  });
});

describe('loadGifSendNow / saveGifSendNow', () => {
  test('defaults to true when unset', () => {
    expect(loadGifSendNow()).toBe(true);
  });

  test('persists false to localStorage', () => {
    saveGifSendNow(false);
    expect(localStorage.getItem('adieuu.gif-send-now')).toBe('false');
    expect(loadGifSendNow()).toBe(false);
  });

  test('removes storage key when re-enabled', () => {
    saveGifSendNow(false);
    saveGifSendNow(true);
    expect(localStorage.getItem('adieuu.gif-send-now')).toBeNull();
    expect(loadGifSendNow()).toBe(true);
  });

  test('persists false in memory when localStorage.setItem throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new ThrowingStorage('set'),
      configurable: true,
      writable: true,
    });

    saveGifSendNow(false);
    expect(loadGifSendNow()).toBe(false);
  });
});
