import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createElement } from 'react';
import { act } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import {
  resetReactRouterDomMock,
  setMockParams,
  setMockPathname,
} from '../../test/react-router-dom-mock';
import { resetReactI18nextMock, setMockTranslate } from '../../test/react-i18next-mock';

setMockTranslate((key) => key);

let mockHasPermission = (_permission: string) => true;

mock.module('../../hooks/useSpaces', () => ({
  useSpaces: () => ({
    hasActiveSpacePermission: mockHasPermission,
  }),
}));

mock.module('../../icons/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

mock.module('@ark-ui/react', () => ({
  Select: {
    Root: ({ children }: { children: React.ReactNode }) =>
      createElement('div', { 'data-testid': 'select-root' }, children),
    Control: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
    Trigger: ({ children, ...props }: { children: React.ReactNode }) =>
      createElement('button', props, children),
    ValueText: ({ children }: { children: React.ReactNode }) => createElement('span', null, children),
    Indicator: ({ children }: { children: React.ReactNode }) => createElement('span', null, children),
    Positioner: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
    Content: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
    Item: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
    ItemText: ({ children }: { children: React.ReactNode }) => createElement('span', null, children),
    ItemIndicator: ({ children }: { children: React.ReactNode }) =>
      createElement('span', null, children),
  },
  Portal: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  createListCollection: ({ items }: { items: unknown[] }) => ({ items }),
}));

const { SpaceManageLayout } = await import('./SpaceManageLayout');

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const g = globalThis as G;
let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  resetReactRouterDomMock();
  resetReactI18nextMock();
  setMockTranslate((key) => key);
  mockHasPermission = () => true;
  setMockParams({ slug: 'alpha' });
  setMockPathname('/s/alpha/manage');

  const win = new GlobalWindow();
  g.window = win as unknown as GlobalWindow & typeof globalThis;
  g.document = win.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  container = g.document!.createElement('div');
  g.document!.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe('SpaceManageLayout', () => {
  it('links back to the Space from the manage nav', () => {
    act(() => {
      root!.render(createElement(SpaceManageLayout));
    });

    const links = Array.from(container!.querySelectorAll('a.space-manage-back-link'));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('/s/alpha');
      expect(link.textContent).toContain('spaces.manage.nav.backToSpace');
    }
  });
});
