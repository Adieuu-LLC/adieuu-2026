import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createElement } from 'react';
import { act } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import { mockNavigate, resetReactRouterDomMock } from '../../test/react-router-dom-mock';
import { resetReactI18nextMock, setMockTranslate } from '../../test/react-i18next-mock';

setMockTranslate((key) => key);

// Mutable identity status — read at render time by the mocked hook.
let mockIdentityStatus = 'logged_in';

mock.module('../../config', () => ({
  useAppConfig: () => ({ apiBaseUrl: 'http://localhost:3000' }),
}));

const mockDiscover = mock(
  (_opts?: unknown) =>
    Promise.resolve({ success: true, data: { spaces: [] as unknown[], cursor: null } }) as Promise<{
      success: boolean;
      data?: { spaces: unknown[]; cursor: string | null };
      error?: { code: string; message: string };
    }>,
);

const mockJoin = mock(
  (_spaceId: string) =>
    Promise.resolve({ success: true, data: {} }) as Promise<{
      success: boolean;
      data?: unknown;
      error?: { code: string; message: string };
    }>,
);

mock.module('@adieuu/shared', () => ({
  createApiClient: () => ({
    spaces: {
      discover: mockDiscover,
      join: mockJoin,
    },
  }),
}));

mock.module('../../hooks/useIdentity', () => ({
  useIdentity: () => ({ status: mockIdentityStatus }),
}));

const toastSuccess = mock((_title: string) => {});
const toastError = mock((_title: string) => {});

mock.module('../../components/Toast', () => ({
  useToast: () => ({
    success: toastSuccess,
    error: toastError,
    info: mock(() => {}),
    warning: mock(() => {}),
    toast: mock(() => {}),
    message: mock(() => {}),
  }),
}));

const { PublicSpaces } = await import('./PublicSpaces');

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: GlobalWindow;
let prevWindow: typeof globalThis.window;
let prevDocument: typeof globalThis.document;

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

beforeEach(() => {
  resetReactI18nextMock();
  setMockTranslate((key) => key);
  resetReactRouterDomMock();
  mockIdentityStatus = 'logged_in';
  mockDiscover.mockClear();
  mockJoin.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  mockDiscover.mockImplementation(() =>
    Promise.resolve({ success: true, data: { spaces: [], cursor: null } }),
  );
  mockJoin.mockImplementation(() => Promise.resolve({ success: true, data: {} }));

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

async function renderDirectory() {
  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(createElement(PublicSpaces));
    await new Promise((r) => setTimeout(r, 0));
  });
  return { root, container };
}

describe('PublicSpaces directory', () => {
  it('renders discovered spaces from the API', async () => {
    mockDiscover.mockImplementation(() =>
      Promise.resolve({
        success: true,
        data: {
          spaces: [makeSpace(), makeSpace({ id: 'space-2', slug: 'second', name: 'Second Space' })],
          cursor: null,
        },
      }),
    );

    const { root, container } = await renderDirectory();

    expect(mockDiscover).toHaveBeenCalledTimes(1);
    const text = happy.document.body.textContent ?? '';
    expect(text).toContain('Test Space');
    expect(text).toContain('Second Space');
    expect(text).toContain('/s/test-space');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('shows the empty state when no spaces are returned', async () => {
    mockDiscover.mockImplementation(() =>
      Promise.resolve({ success: true, data: { spaces: [], cursor: null } }),
    );

    const { root, container } = await renderDirectory();

    expect(happy.document.body.textContent).toContain('spaces.empty.heading');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('shows the error state when discovery fails', async () => {
    mockDiscover.mockImplementation(() =>
      Promise.resolve({ success: false, error: { code: 'SERVER_ERROR', message: 'nope' } }),
    );

    const { root, container } = await renderDirectory();

    expect(happy.document.body.textContent).toContain('spaces.error.heading');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('shows a sign-in prompt and does not fetch when not in an Alias session', async () => {
    mockIdentityStatus = 'logged_out';

    const { root, container } = await renderDirectory();

    expect(mockDiscover).not.toHaveBeenCalled();
    expect(happy.document.body.textContent).toContain('spaces.signInHeading');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('joins a space and navigates to /s/:slug on success', async () => {
    mockDiscover.mockImplementation(() =>
      Promise.resolve({ success: true, data: { spaces: [makeSpace()], cursor: null } }),
    );

    const { root, container } = await renderDirectory();

    const joinButton = [...happy.document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('spaces.join'),
    );
    expect(joinButton).toBeDefined();

    await act(async () => {
      joinButton?.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockJoin).toHaveBeenCalledWith('space-1');
    expect(mockNavigate).toHaveBeenCalledWith('/s/test-space');
    expect(toastSuccess).toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('surfaces a join error without navigating', async () => {
    mockDiscover.mockImplementation(() =>
      Promise.resolve({ success: true, data: { spaces: [makeSpace()], cursor: null } }),
    );
    mockJoin.mockImplementation(() =>
      Promise.resolve({ success: false, error: { code: 'TIER_REQUIRED', message: 'paid only' } }),
    );

    const { root, container } = await renderDirectory();

    const joinButton = [...happy.document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('spaces.join'),
    );

    await act(async () => {
      joinButton?.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockJoin).toHaveBeenCalledWith('space-1');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('paid only');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
