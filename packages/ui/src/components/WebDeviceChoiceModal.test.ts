import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { createElement } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const T = {
  title: 'identity.e2e.webDeviceChoice.title',
  sharedTitle: 'identity.e2e.webDeviceChoice.sharedTitle',
  sharedDesc: 'identity.e2e.webDeviceChoice.sharedDescription',
  individualTitle: 'identity.e2e.webDeviceChoice.individualTitle',
  individualDesc: 'identity.e2e.webDeviceChoice.individualDescription',
  confirm: 'identity.e2e.webDeviceChoice.confirm',
} as const;

mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        [T.title]: 'Web device',
        [T.sharedTitle]: 'Shared option',
        [T.sharedDesc]: 'Shared description',
        [T.individualTitle]: 'Individual option',
        [T.individualDesc]: 'Individual description',
        [T.confirm]: 'Confirm choice',
      };
      return labels[key] ?? key;
    },
  }),
}));

const { WebDeviceChoiceModal } = await import('./WebDeviceChoiceModal');

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
  CSS?: typeof CSS;
};

let happy: GlobalWindow;
let prevWindow: typeof globalThis.window;
let prevDocument: typeof globalThis.document;
let prevRaf: typeof globalThis.requestAnimationFrame;
let prevCancelRaf: typeof globalThis.cancelAnimationFrame;
let prevGcs: typeof globalThis.getComputedStyle;
let prevCss: typeof globalThis.CSS;

beforeEach(() => {
  const g = globalThis as G;
  prevWindow = g.window;
  prevDocument = g.document;
  prevRaf = g.requestAnimationFrame;
  prevCancelRaf = g.cancelAnimationFrame;
  prevGcs = g.getComputedStyle;
  prevCss = g.CSS;

  happy = new GlobalWindow({ url: 'https://example.test/' });
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.window = happy as unknown as GlobalWindow & typeof globalThis;
  g.document = happy.document;
  g.requestAnimationFrame = happy.requestAnimationFrame.bind(happy);
  g.cancelAnimationFrame = happy.cancelAnimationFrame.bind(happy);
  g.getComputedStyle = happy.getComputedStyle.bind(happy);
  // @zag-js/dom-query uses CSS.escape for radio owned-by selectors (not on Bun global).
  g.CSS = {
    escape: (value: string) =>
      value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`),
  } as typeof CSS;
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  happy?.close();
  const g = globalThis as G;
  delete g.IS_REACT_ACT_ENVIRONMENT;
  g.window = prevWindow;
  g.document = prevDocument;
  g.requestAnimationFrame = prevRaf;
  g.cancelAnimationFrame = prevCancelRaf;
  g.getComputedStyle = prevGcs;
  g.CSS = prevCss;
});

function renderOpen(onChoice: (choice: 'shared' | 'individual') => void) {
  const container = globalThis.document.createElement('div');
  globalThis.document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(createElement(WebDeviceChoiceModal, { open: true, onChoice }));
  });
  return { root, container };
}

describe('WebDeviceChoiceModal', () => {
  it('renders both Ark radio options (shared and individual) when open', () => {
    const onChoice = mock((_c: 'shared' | 'individual') => {});
    const { root, container } = renderOpen(onChoice);

    const items = happy.document.querySelectorAll('.activity-radio-item');
    expect(items.length).toBe(2);
    expect(happy.document.body.textContent).toContain('Shared option');
    expect(happy.document.body.textContent).toContain('Individual option');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('confirms shared device by default when user clicks confirm', () => {
    const onChoice = mock((_c: 'shared' | 'individual') => {});
    const { root, container } = renderOpen(onChoice);

    const confirmBtn = [...happy.document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Confirm choice'),
    );
    act(() => {
      confirmBtn?.click();
    });

    expect(onChoice).toHaveBeenCalledTimes(1);
    expect(onChoice.mock.calls[0]?.[0]).toBe('shared');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
