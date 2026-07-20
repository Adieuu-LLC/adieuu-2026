import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createElement } from 'react';
import { act } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import { resetReactRouterDomMock, setMockParams } from '../../test/react-router-dom-mock';
import { resetReactI18nextMock, setMockTranslate } from '../../test/react-i18next-mock';

setMockTranslate((key) => key);

let mockIdentityStatus = 'logged_in';
let mockSpacesContext: Record<string, unknown> = {};

mock.module('../../hooks/useIdentity', () => ({
  useIdentity: () => ({ status: mockIdentityStatus }),
}));

mock.module('../../hooks/useSpaces', () => ({
  useSpaces: () => mockSpacesContext,
}));

mock.module('../../hooks/useCipherStore', () => ({
  useCipherStore: () => ({
    ciphers: [],
    getCipherKey: () => null,
    createCipher: async () => ({ success: false }),
    bookmarkSpaceCipher: async () => ({ success: true }),
    findLocalIdByCipherId: () => undefined,
    encryptionAvailable: false,
  }),
}));

mock.module('../../config', () => ({
  useAppConfig: () => ({ apiBaseUrl: 'http://localhost:3000' }),
}));

mock.module('../../components/Toast', () => ({
  useToast: () => ({
    success: () => {},
    error: () => {},
    info: () => {},
  }),
}));

mock.module('../../icons/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

mock.module('../../components/Sidebar', () => ({
  useSidebar: () => ({
    isExpanded: true,
    isMobileOpen: false,
    orientation: 'left',
    setExpanded: () => {},
    setMobileOpen: () => {},
    closeMobile: () => {},
  }),
  useOptionalSidebar: () => ({
    isExpanded: true,
    isMobileOpen: false,
    orientation: 'left',
    toggleExpanded: () => {},
    setExpanded: () => {},
    setMobileOpen: () => {},
    closeMobile: () => {},
  }),
}));

mock.module('./JoinSpaceInterstitial', () => ({
  JoinSpaceInterstitial: () => null,
}));

const { SpaceLayout } = await import('./SpaceLayout');

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: GlobalWindow;
let prevWindow: typeof globalThis.window;
let prevDocument: typeof globalThis.document;

function makeDefaultCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    activeSpace: null,
    activeSpaceLoading: false,
    activeSpaceError: null,
    channels: [],
    categories: [],
    unreadByChannel: {},
    activeSpaceRoleIds: [],
    addChannelLocally: mock(() => {}),
    addCategoryLocally: mock(() => {}),
    removeCategoryLocally: mock(() => {}),
    applyChannelLayout: mock(async () => true),
    setActiveSpace: mock(() => {}),
    isActiveSpaceMember: true,
    isActiveSpaceAdmin: false,
    activeSpacePermissions: [],
    activeSpacePermissionsLoading: false,
    hasActiveSpacePermission: () => false,
    canAccessSpaceManage: false,
    rolePermissionPreview: null,
    setRolePermissionPreview: () => {},
    ...overrides,
  };
}

beforeEach(() => {
  resetReactI18nextMock();
  setMockTranslate((key) => key);
  resetReactRouterDomMock();
  setMockParams({ slug: 'test-space' });
  mockIdentityStatus = 'logged_in';
  mockSpacesContext = makeDefaultCtx();

  const g = globalThis as G;
  prevWindow = g.window;
  prevDocument = g.document;
  happy = new GlobalWindow({ url: 'https://example.test/' });
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.window = happy as unknown as GlobalWindow & typeof globalThis;
  g.document = happy.document;
  // Desktop viewport for layout shell tests (mobile nav uses matchMedia 720px).
  g.window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  happy?.close();
  const g = globalThis as G;
  delete g.IS_REACT_ACT_ENVIRONMENT;
  g.window = prevWindow;
  g.document = prevDocument;
});

async function render() {
  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(createElement(SpaceLayout));
    await new Promise((r) => setTimeout(r, 0));
  });
  return { root, container };
}

describe('SpaceLayout', () => {
  it('calls setActiveSpace with the route slug', async () => {
    const setActiveSpace = mock(() => {});
    mockSpacesContext = makeDefaultCtx({ setActiveSpace });

    const { root, container } = await render();
    expect(setActiveSpace).toHaveBeenCalledWith('test-space');

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows sign-in prompt when not logged in without calling useSpaces', async () => {
    mockIdentityStatus = 'not_logged_in';
    const setActiveSpace = mock(() => {});
    mockSpacesContext = makeDefaultCtx({ setActiveSpace });

    const { root, container } = await render();
    expect(happy.document.body.textContent).toContain('spaces.signInHeading');
    expect(setActiveSpace).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows loading state while resolving space', async () => {
    mockSpacesContext = makeDefaultCtx({ activeSpaceLoading: true });

    const { root, container } = await render();
    const spinner = happy.document.querySelector('.spinner-lg, .spaces-loading');
    expect(spinner).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows error state on server failure', async () => {
    mockSpacesContext = makeDefaultCtx({ activeSpaceError: 'error' });

    const { root, container } = await render();
    expect(happy.document.body.textContent).toContain('spaces.view.errorHeading');

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows not-found state for missing space', async () => {
    mockSpacesContext = makeDefaultCtx({ activeSpaceError: 'not_found' });

    const { root, container } = await render();
    expect(happy.document.body.textContent).toContain('spaces.view.notFoundHeading');

    await act(async () => root.unmount());
    container.remove();
  });

  it('renders space-page shell when space resolves', async () => {
    mockSpacesContext = makeDefaultCtx({
      activeSpace: {
        id: 'space-1',
        slug: 'test-space',
        name: 'Test Space',
        memberCount: 5,
      },
    });

    const { root, container } = await render();
    const shell = happy.document.querySelector('.space-page');
    expect(shell).not.toBeNull();
    expect(happy.document.body.textContent).toContain('Test Space');
    expect(happy.document.querySelector('.space-join-banner')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows a join banner for non-members browsing the space', async () => {
    mockSpacesContext = makeDefaultCtx({
      isActiveSpaceMember: false,
      activeSpace: {
        id: 'space-1',
        slug: 'test-space',
        name: 'Test Space',
        memberCount: 5,
      },
    });

    const { root, container } = await render();
    expect(happy.document.querySelector('.space-join-banner')).not.toBeNull();
    expect(happy.document.body.textContent).toContain('spaces.channel.joinToPost');
    expect(happy.document.body.textContent).toContain('spaces.channel.joinCta');

    await act(async () => root.unmount());
    container.remove();
  });
});
