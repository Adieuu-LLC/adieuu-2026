import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createElement } from 'react';
import { act } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import * as sharedActual from '@adieuu/shared';
import { mockNavigate, resetReactRouterDomMock } from '../../test/react-router-dom-mock';
import { resetReactI18nextMock, setMockTranslate } from '../../test/react-i18next-mock';
import { emitSpacesChanged } from '../../services/spacesMembershipEvents';

setMockTranslate((key, def) => (typeof def === 'string' ? def : key));

let mockIdentityStatus = 'logged_in';

mock.module('../../config', () => ({
  useAppConfig: () => ({ apiBaseUrl: 'http://localhost:3000' }),
}));

const mockListMine = mock(
  () =>
    Promise.resolve({ success: true, data: { spaces: [] as unknown[] } }) as Promise<{
      success: boolean;
      data?: { spaces: unknown[] };
    }>,
);

mock.module('@adieuu/shared', () => ({
  ...sharedActual,
  createApiClient: () => ({ spaces: { listMine: mockListMine } }),
}));

mock.module('../../hooks/useIdentity', () => ({
  useIdentity: () => ({ status: mockIdentityStatus }),
}));

const closeMobile = mock(() => {});
mock.module('../../components/Sidebar', () => ({
  useSidebar: () => ({ closeMobile }),
  SidebarItem: ({ label, onClick }: { label: string; onClick?: () => void }) =>
    createElement('button', { type: 'button', 'data-testid': 'sidebar-item', onClick }, label),
}));

mock.module('../../icons/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

function makeSpace(overrides: Record<string, unknown> = {}) {
  return {
    id: 'space-1',
    slug: 'test-space',
    name: 'Test Space',
    description: 'A lovely place',
    visibility: 'public',
    createdBy: 'id-owner',
    ownerIdentityId: 'id-owner',
    allowFreeMembers: true,
    memberCount: 3,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const { SpacesSidebarSection } = await import('./spaces');

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: GlobalWindow;
let prevWindow: typeof globalThis.window;
let prevDocument: typeof globalThis.document;

beforeEach(() => {
  resetReactI18nextMock();
  setMockTranslate((key, def) => (typeof def === 'string' ? def : key));
  resetReactRouterDomMock();
  mockIdentityStatus = 'logged_in';
  mockListMine.mockClear();
  mockListMine.mockImplementation(() => Promise.resolve({ success: true, data: { spaces: [] } }));
  closeMobile.mockClear();

  const g = globalThis as G;
  prevWindow = g.window;
  prevDocument = g.document;
  happy = new GlobalWindow({ url: 'https://example.test/' });
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.window = happy as unknown as GlobalWindow & typeof globalThis;
  g.document = happy.document;
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  happy?.close();
  const g = globalThis as G;
  delete g.IS_REACT_ACT_ENVIRONMENT;
  g.window = prevWindow;
  g.document = prevDocument;
});

async function renderSection() {
  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(createElement(SpacesSidebarSection));
    await new Promise((r) => setTimeout(r, 0));
  });
  return { root, container };
}

describe('SpacesSidebarSection', () => {
  it('lists the Spaces the Alias is a member of and opens one on click', async () => {
    mockListMine.mockImplementation(() =>
      Promise.resolve({ success: true, data: { spaces: [makeSpace()] } }),
    );

    const { root, container } = await renderSection();

    expect(mockListMine).toHaveBeenCalledTimes(1);
    expect(happy.document.body.textContent).toContain('Test Space');

    const spaceRow = [...happy.document.querySelectorAll('button.conversation-list-item')][0];
    expect(spaceRow).toBeDefined();
    await act(async () => {
      (spaceRow as HTMLButtonElement).click();
    });
    expect(mockNavigate).toHaveBeenCalledWith('/s/test-space');
    expect(closeMobile).toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it('refetches membership when a Space is created/joined elsewhere', async () => {
    mockListMine.mockImplementation(() => Promise.resolve({ success: true, data: { spaces: [] } }));

    const { root, container } = await renderSection();

    expect(mockListMine).toHaveBeenCalledTimes(1);
    expect(happy.document.body.textContent).toContain("You haven't joined any Spaces yet");

    // A Space is now created elsewhere; the next fetch returns it.
    mockListMine.mockImplementation(() =>
      Promise.resolve({ success: true, data: { spaces: [makeSpace({ name: 'Brand New Space' })] } }),
    );

    await act(async () => {
      emitSpacesChanged();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockListMine).toHaveBeenCalledTimes(2);
    expect(happy.document.body.textContent).toContain('Brand New Space');

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows an empty state when the Alias has no Spaces', async () => {
    mockListMine.mockImplementation(() => Promise.resolve({ success: true, data: { spaces: [] } }));

    const { root, container } = await renderSection();

    expect(happy.document.body.textContent).toContain("You haven't joined any Spaces yet");

    await act(async () => root.unmount());
    container.remove();
  });

  it('navigates to the public directory via Discover', async () => {
    const { root, container } = await renderSection();

    const discover = [...happy.document.querySelectorAll('[data-testid="sidebar-item"]')].find((b) =>
      b.textContent?.includes('Discover'),
    );
    expect(discover).toBeDefined();
    await act(async () => {
      (discover as HTMLButtonElement).click();
    });
    expect(mockNavigate).toHaveBeenCalledWith('/spaces');

    await act(async () => root.unmount());
    container.remove();
  });

  it('prompts to sign into an Alias when not in an identity session (no fetch)', async () => {
    mockIdentityStatus = 'logged_out';

    const { root, container } = await renderSection();

    expect(mockListMine).not.toHaveBeenCalled();
    expect(happy.document.body.textContent).toContain('Sign into an Alias to see Spaces');

    await act(async () => root.unmount());
    container.remove();
  });
});
