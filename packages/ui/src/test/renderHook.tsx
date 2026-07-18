/**
 * Minimal hook render harness for bun:test + happy-dom.
 *
 * Mirrors the createRoot/act pattern used across the UI test suite but factors
 * out the boilerplate so hook tests can render a hook, drive it with `act`, and
 * read the latest return value via `result.current`.
 */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GlobalWindow } from 'happy-dom';

let domInstalled = false;

/** Install a happy-dom window/document once per test process. */
export function installDom(): void {
  if (domInstalled) return;
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const win = new GlobalWindow();
  (globalThis as unknown as { window: unknown }).window = win;
  (globalThis as unknown as { document: unknown }).document = win.document;
  if (!(globalThis as unknown as { navigator?: unknown }).navigator) {
    (globalThis as unknown as { navigator: unknown }).navigator = win.navigator;
  }
  domInstalled = true;
}

export { act };

export interface RenderElementResult {
  container: HTMLElement;
  rerender: (element: import('react').ReactElement) => Promise<void>;
  unmount: () => void;
}

/** Render a React element into a detached container for DOM assertions. */
export async function renderElement(
  element: import('react').ReactElement,
): Promise<RenderElementResult> {
  installDom();
  const container = document.createElement('div');
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    rerender: async (next) => {
      await act(async () => {
        root.render(next);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

export interface RenderHookResult<T, P> {
  result: { current: T };
  rerender: (props?: P) => Promise<void>;
  unmount: () => void;
}

export async function renderHook<T, P = void>(
  callback: (props: P) => T,
  options?: { initialProps?: P },
): Promise<RenderHookResult<T, P>> {
  installDom();
  const result = { current: undefined as unknown as T };
  let currentProps = options?.initialProps as P;
  const container = document.createElement('div');
  const root: Root = createRoot(container);

  function Probe({ p }: { p: P }) {
    result.current = callback(p);
    return null;
  }

  await act(async () => {
    root.render(createElement(Probe, { p: currentProps }));
  });

  return {
    result,
    rerender: async (props?: P) => {
      if (props !== undefined) currentProps = props;
      await act(async () => {
        root.render(createElement(Probe, { p: currentProps }));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}
