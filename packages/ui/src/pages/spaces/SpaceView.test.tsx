import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createElement } from 'react';
import { act } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import * as sharedActual from '@adieuu/shared';
import { resetReactRouterDomMock, setMockParams } from '../../test/react-router-dom-mock';
import { resetReactI18nextMock, setMockTranslate } from '../../test/react-i18next-mock';

setMockTranslate((key) => key);

let mockIdentityStatus = 'logged_in';

mock.module('../../config', () => ({
  useAppConfig: () => ({ apiBaseUrl: 'http://localhost:3000' }),
}));

const mockGetBySlug = mock(
  (_slug: string) =>
    Promise.resolve({ success: true, data: makeSpace() }) as Promise<{
      success: boolean;
      data?: unknown;
      error?: { code: string; message: string };
    }>,
);

mock.module('@adieuu/shared', () => ({
  ...sharedActual,
  createApiClient: () => ({ spaces: { getBySlug: mockGetBySlug } }),
}));

mock.module('../../hooks/useIdentity', () => ({
  useIdentity: () => ({ status: mockIdentityStatus }),
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

const { SpaceView } = await import('./SpaceView');

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
  setMockTranslate((key) => key);
  resetReactRouterDomMock();
  setMockParams({ slug: 'test-space' });
  mockIdentityStatus = 'logged_in';
  mockGetBySlug.mockClear();
  mockGetBySlug.mockImplementation(() => Promise.resolve({ success: true, data: makeSpace() }));

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

async function renderView() {
  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(createElement(SpaceView));
    await new Promise((r) => setTimeout(r, 0));
  });
  return { root, container };
}

describe('SpaceView', () => {
  it('renders the resolved space on success', async () => {
    const { root, container } = await renderView();

    expect(mockGetBySlug).toHaveBeenCalledWith('test-space');
    expect(happy.document.body.textContent).toContain('Test Space');

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows the not-found state for a genuine NOT_FOUND response', async () => {
    mockGetBySlug.mockImplementation(() =>
      Promise.resolve({ success: false, error: { code: 'NOT_FOUND', message: 'nope' } }),
    );

    const { root, container } = await renderView();

    const text = happy.document.body.textContent ?? '';
    expect(text).toContain('spaces.view.notFoundHeading');
    expect(text).not.toContain('spaces.view.errorHeading');

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows a retryable error state for a network/server failure', async () => {
    mockGetBySlug.mockImplementation(() =>
      Promise.resolve({ success: false, error: { code: 'NETWORK_ERROR', message: 'boom' } }),
    );

    const { root, container } = await renderView();

    const text = happy.document.body.textContent ?? '';
    expect(text).toContain('spaces.view.errorHeading');
    expect(text).not.toContain('spaces.view.notFoundHeading');

    // Retry should refetch; make the second attempt succeed.
    mockGetBySlug.mockImplementation(() => Promise.resolve({ success: true, data: makeSpace() }));
    const retryButton = [...happy.document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('spaces.view.retry'),
    );
    expect(retryButton).toBeDefined();

    await act(async () => {
      retryButton?.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockGetBySlug).toHaveBeenCalledTimes(2);
    expect(happy.document.body.textContent).toContain('Test Space');

    await act(async () => root.unmount());
    container.remove();
  });
});
