import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  DEFAULT_MEMBER_COLOR_DISPLAY,
  getMemberColorDisplay,
  patchMemberColorDisplay,
  setMemberColorDisplay,
} from './useMemberColorPreference';

const STORAGE_KEY = 'adieuu.app.memberColorDisplay';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: () => null,
    get length() {
      return store.size;
    },
  };
});

afterEach(() => {
  store.clear();
});

describe('useMemberColorPreference storage', () => {
  test('defaults when unset', () => {
    expect(getMemberColorDisplay()).toEqual(DEFAULT_MEMBER_COLOR_DISPLAY);
  });

  test('migrates legacy exclusive modes', () => {
    localStorage.setItem(STORAGE_KEY, 'name-only');
    expect(getMemberColorDisplay()).toEqual({
      name: true,
      avatarAccent: false,
      messageBorder: false,
    });

    localStorage.setItem(STORAGE_KEY, 'name-and-accent');
    expect(getMemberColorDisplay()).toEqual({
      name: true,
      avatarAccent: true,
      messageBorder: false,
    });

    localStorage.setItem(STORAGE_KEY, 'name-and-bubble');
    expect(getMemberColorDisplay()).toEqual({
      name: true,
      avatarAccent: false,
      messageBorder: true,
    });
  });

  test('patchMemberColorDisplay merges flags', () => {
    setMemberColorDisplay({ name: true, avatarAccent: false, messageBorder: false });
    patchMemberColorDisplay({ messageBorder: true });
    expect(getMemberColorDisplay()).toEqual({
      name: true,
      avatarAccent: false,
      messageBorder: true,
    });
  });

  test('allows all flags off', () => {
    setMemberColorDisplay({ name: false, avatarAccent: false, messageBorder: false });
    expect(getMemberColorDisplay()).toEqual({
      name: false,
      avatarAccent: false,
      messageBorder: false,
    });
  });
});
