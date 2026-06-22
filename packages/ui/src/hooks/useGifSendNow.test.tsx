import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { loadGifSendNow, saveGifSendNow, useGifSendNow } from './useGifPreference';

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

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: GlobalWindow;
let prevWindow: typeof globalThis.window;
let prevDocument: typeof globalThis.document;
let root: Root | null = null;

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
  saveGifSendNow(true);
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

  test('returns in-memory fallback when localStorage.getItem throws', () => {
    saveGifSendNow(false);
    Object.defineProperty(globalThis, 'localStorage', {
      value: new ThrowingStorage('get'),
      configurable: true,
      writable: true,
    });
    expect(loadGifSendNow()).toBe(false);
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

  test('persists true in memory when localStorage.removeItem throws', () => {
    saveGifSendNow(false);
    Object.defineProperty(globalThis, 'localStorage', {
      value: new ThrowingStorage('remove'),
      configurable: true,
      writable: true,
    });

    saveGifSendNow(true);
    expect(loadGifSendNow()).toBe(true);
  });
});

describe('useGifSendNow', () => {
  beforeEach(() => {
    const g = globalThis as G;
    prevWindow = g.window;
    prevDocument = g.document;

    happy = new GlobalWindow({ url: 'https://example.test/' });
    g.IS_REACT_ACT_ENVIRONMENT = true;
    g.window = happy as unknown as GlobalWindow & typeof globalThis;
    g.document = happy.document;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    happy?.close();
    const g = globalThis as G;
    delete g.IS_REACT_ACT_ENVIRONMENT;
    g.window = prevWindow;
    g.document = prevDocument;
  });

  test('reflects stored preference and updates subscribers', () => {
    saveGifSendNow(false);

    const container = globalThis.document.createElement('div');
    let current = true;
    let setSendNow: ((value: boolean) => void) | null = null;

    function Host() {
      const [value, setValue] = useGifSendNow();
      current = value;
      setSendNow = setValue;
      return null;
    }

    root = createRoot(container);
    act(() => {
      root!.render(createElement(Host));
    });

    expect(current).toBe(false);

    act(() => {
      setSendNow?.(true);
    });
    expect(current).toBe(true);
    expect(loadGifSendNow()).toBe(true);
  });
});
