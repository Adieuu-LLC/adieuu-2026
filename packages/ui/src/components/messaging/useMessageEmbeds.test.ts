import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { createElement } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { UseMessageEmbedsResult } from './useMessageEmbeds';

let embedPrefState: { mode: string; allowlist: string[]; maxWidth: string } = {
  mode: 'all',
  allowlist: [],
  maxWidth: 'medium',
};
const setEmbedPrefMock = mock((pref: typeof embedPrefState) => {
  embedPrefState = pref;
});

let embedOnboardingSeen = false;
const dismissEmbedOnboardingMock = mock(() => {
  embedOnboardingSeen = true;
});

mock.module('../../hooks/useEmbedPreference', () => ({
  useEmbedPreference: () => [embedPrefState, setEmbedPrefMock],
  isDomainAllowed: (domain: string, pref: typeof embedPrefState) => {
    if (pref.mode === 'none') return false;
    if (pref.mode === 'all') return true;
    return pref.allowlist.includes(domain.replace(/^www\./, '').toLowerCase());
  },
}));

mock.module('../../hooks/useEmbedOnboarding', () => ({
  useEmbedOnboarding: () => ({
    seen: embedOnboardingSeen,
    dismiss: dismissEmbedOnboardingMock,
  }),
}));

mock.module('../../config', () => ({
  useAppConfig: () => ({ apiBaseUrl: 'http://test-api' }),
}));

mock.module('../../services/unfurlService', () => ({
  createUnfurlFetcher: (url: string) => mock(() => Promise.resolve(null)),
}));

mock.module('../../utils/embedDetection', () => ({
  detectEmbeds: (text: string) => {
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls: Array<{ url: string }> = [];
    let match: RegExpExecArray | null;
    while ((match = urlRegex.exec(text)) !== null) {
      urls.push({ url: match[0] });
    }
    return urls;
  },
  extractTld: (url: string) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
  },
}));

const { useMessageEmbeds } = await import('./useMessageEmbeds');

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: GlobalWindow;
let root: Root | null = null;

beforeEach(() => {
  embedPrefState = { mode: 'all', allowlist: [], maxWidth: 'medium' };
  embedOnboardingSeen = false;
  setEmbedPrefMock.mockClear();
  dismissEmbedOnboardingMock.mockClear();

  happy = new GlobalWindow({ url: 'http://localhost' });
  const g = globalThis as G;
  g.window = happy as unknown as typeof g.window;
  g.document = happy.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      _store: new Map<string, string>(),
      getItem(key: string) { return this._store.get(key) ?? null; },
      setItem(key: string, val: string) { this._store.set(key, val); },
      removeItem(key: string) { this._store.delete(key); },
      clear() { this._store.clear(); },
      get length() { return this._store.size; },
      key(i: number) { return [...this._store.keys()][i] ?? null; },
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  const g = globalThis as G;
  delete g.window;
  delete g.document;
  delete g.IS_REACT_ACT_ENVIRONMENT;
});

function renderHook(content: string, selfId: string | undefined): { current: UseMessageEmbedsResult } {
  const ref: { current: UseMessageEmbedsResult } = {} as { current: UseMessageEmbedsResult };
  function Harness() {
    ref.current = useMessageEmbeds(content, selfId);
    return null;
  }
  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  act(() => {
    root = createRoot(container as unknown as HTMLElement);
    root.render(createElement(Harness));
  });
  return ref;
}

describe('useMessageEmbeds', () => {
  it('returns default embed state for empty content', () => {
    const ref = renderHook('', 'self-1');
    expect(ref.current.hiddenEmbedMap).toBeUndefined();
    expect(ref.current.hasHiddenEmbeds).toBe(false);
    expect(ref.current.hasEmbedOverrides).toBe(false);
    expect(ref.current.showEmbedOnboarding).toBe(false);
  });

  it('returns no hidden embeds when mode is "all"', () => {
    embedPrefState = { mode: 'all', allowlist: [], maxWidth: 'medium' };
    const ref = renderHook('check out https://example.com', 'self-1');
    expect(ref.current.hiddenEmbedMap).toBeUndefined();
    expect(ref.current.hasHiddenEmbeds).toBe(false);
  });

  it('marks embeds as hidden when mode is "none"', () => {
    embedPrefState = { mode: 'none', allowlist: [], maxWidth: 'medium' };
    const ref = renderHook('visit https://example.com', 'self-1');
    expect(ref.current.hasHiddenEmbeds).toBe(true);
    expect(ref.current.hiddenEmbedMap).toBeDefined();
    expect(ref.current.hiddenEmbedMap!.size).toBe(1);
    const entry = ref.current.hiddenEmbedMap!.get('https://example.com');
    expect(entry).toBeDefined();
    expect(entry!.reason).toBe('disabled');
  });

  it('marks embeds as hidden when domain not in allowlist', () => {
    embedPrefState = { mode: 'allowlist', allowlist: ['trusted.com'], maxWidth: 'medium' };
    const ref = renderHook('check https://untrusted.com and https://trusted.com', 'self-1');
    expect(ref.current.hiddenEmbedMap!.size).toBe(1);
    expect(ref.current.hiddenEmbedMap!.has('https://untrusted.com')).toBe(true);
    expect(ref.current.hiddenEmbedMap!.has('https://trusted.com')).toBe(false);
  });

  it('handleAddToAllowlist adds domain to embed preference', () => {
    embedPrefState = { mode: 'allowlist', allowlist: [], maxWidth: 'medium' };
    const ref = renderHook('https://new-domain.com', 'self-1');
    act(() => ref.current.handleAddToAllowlist('new-domain.com'));
    expect(setEmbedPrefMock).toHaveBeenCalledWith({
      mode: 'allowlist',
      allowlist: ['new-domain.com'],
      maxWidth: 'medium',
    });
  });

  it('handleEnableAllEmbeds sets mode to all and dismisses onboarding', () => {
    embedPrefState = { mode: 'none', allowlist: [], maxWidth: 'medium' };
    const ref = renderHook('https://example.com', 'self-1');
    act(() => ref.current.handleEnableAllEmbeds());
    expect(setEmbedPrefMock).toHaveBeenCalledWith({
      mode: 'all',
      allowlist: [],
      maxWidth: 'medium',
    });
    expect(dismissEmbedOnboardingMock).toHaveBeenCalled();
  });

  it('showEmbedOnboarding is true when not seen and has hidden embeds', () => {
    embedOnboardingSeen = false;
    embedPrefState = { mode: 'none', allowlist: [], maxWidth: 'medium' };
    const ref = renderHook('https://example.com', 'self-1');
    expect(ref.current.showEmbedOnboarding).toBe(true);
  });

  it('showEmbedOnboarding is false when already seen', () => {
    embedOnboardingSeen = true;
    embedPrefState = { mode: 'none', allowlist: [], maxWidth: 'medium' };
    const ref = renderHook('https://example.com', 'self-1');
    expect(ref.current.showEmbedOnboarding).toBe(false);
  });

  it('does nothing when selfId is undefined', () => {
    embedPrefState = { mode: 'allowlist', allowlist: [], maxWidth: 'medium' };
    const ref = renderHook('https://example.com', undefined);
    act(() => ref.current.handleAddToAllowlist('example.com'));
    expect(setEmbedPrefMock).not.toHaveBeenCalled();
    act(() => ref.current.handleEnableAllEmbeds());
    expect(setEmbedPrefMock).not.toHaveBeenCalled();
  });
});
