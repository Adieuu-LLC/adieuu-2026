import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { createElement } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useExpiryCountdown } from './useExpiryCountdown';

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: GlobalWindow;
let root: Root | null = null;

beforeEach(() => {
  happy = new GlobalWindow({ url: 'http://localhost' });
  const g = globalThis as G;
  g.window = happy as unknown as typeof g.window;
  g.document = happy.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
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

function renderHook(expiresAt?: string): { current: string | null } {
  const ref: { current: string | null } = { current: null };
  function Harness() {
    ref.current = useExpiryCountdown(expiresAt);
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

describe('useExpiryCountdown', () => {
  it('returns null when no expiresAt', () => {
    const ref = renderHook(undefined);
    expect(ref.current).toBeNull();
  });

  it('returns "Expired" for a past timestamp', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const ref = renderHook(past);
    expect(ref.current).toBe('Expired');
  });

  it('returns seconds format for < 60s remaining', () => {
    const future = new Date(Date.now() + 30_000).toISOString();
    const ref = renderHook(future);
    expect(ref.current).toMatch(/^\d+s$/);
    const num = parseInt(ref.current!, 10);
    expect(num).toBeGreaterThan(0);
    expect(num).toBeLessThanOrEqual(30);
  });

  it('returns minutes format for < 1h remaining', () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    const ref = renderHook(future);
    expect(ref.current).toMatch(/^\d+m$/);
    const num = parseInt(ref.current!, 10);
    expect(num).toBeGreaterThanOrEqual(4);
    expect(num).toBeLessThanOrEqual(5);
  });

  it('returns hours format for < 1d remaining', () => {
    const future = new Date(Date.now() + 3 * 3600_000).toISOString();
    const ref = renderHook(future);
    expect(ref.current).toMatch(/^\d+h$/);
    const num = parseInt(ref.current!, 10);
    expect(num).toBeGreaterThanOrEqual(2);
    expect(num).toBeLessThanOrEqual(3);
  });

  it('returns days format for >= 1d remaining', () => {
    const future = new Date(Date.now() + 2 * 86400_000).toISOString();
    const ref = renderHook(future);
    expect(ref.current).toMatch(/^\d+d$/);
    const num = parseInt(ref.current!, 10);
    expect(num).toBeGreaterThanOrEqual(1);
    expect(num).toBeLessThanOrEqual(2);
  });

  it('returns null when expiresAt is empty string', () => {
    const ref = renderHook('');
    expect(ref.current).toBeNull();
  });
});
