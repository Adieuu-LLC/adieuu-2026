import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createElement } from 'react';
import { act } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import { resetReactRouterDomMock, setMockParams } from '../../test/react-router-dom-mock';
import { resetReactI18nextMock, setMockTranslate } from '../../test/react-i18next-mock';

setMockTranslate((key) => key);

let mockSpacesContext: Record<string, unknown> = {};

mock.module('../../hooks/useSpaces', () => ({
  useSpaces: () => mockSpacesContext,
}));

mock.module('../../hooks/useIdentity', () => ({
  useIdentity: () => ({ status: 'logged_in', identity: { id: 'test-id' } }),
}));

mock.module('../../hooks/useAuth', () => ({
  useAuth: () => ({ status: 'authenticated' }),
}));

mock.module('../../config', () => ({
  useAppConfig: () => ({ apiBaseUrl: 'http://localhost:3000' }),
}));

let mockCipherStoreCtx: Record<string, unknown> = {};

mock.module('../../hooks/useCipherStore', () => ({
  useCipherStore: () => mockCipherStoreCtx,
}));

mock.module('../../services/spaceCipherService', () => ({
  getSpaceCipherLink: () => null,
}));

mock.module('../../components/composer/MessageComposer', () => ({
  MessageComposer: ({ channelId }: { channelId: string }) =>
    createElement('div', { 'data-testid': 'composer', 'data-channel': channelId }, 'Composer'),
}));

const { SpaceChannelView } = await import('./SpaceChannelView');

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
    activeSpace: { id: 'space-1', slug: 'test', name: 'Test', memberCount: 1 },
    channels: [{ id: 'ch-1', spaceId: 'space-1', type: 'text', name: 'general', position: 0 }],
    activeChannelId: 'ch-1',
    activeMessages: [],
    activeMessagesLoading: false,
    activeMessagesOlderCursor: null,
    sending: false,
    setActiveChannel: mock(() => {}),
    sendMessage: mock(async () => null),
    loadOlderMessages: mock(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  resetReactI18nextMock();
  setMockTranslate((key) => key);
  resetReactRouterDomMock();
  setMockParams({ channelId: 'ch-1' });
  mockSpacesContext = makeDefaultCtx();
  mockCipherStoreCtx = { getCipherKey: () => null };

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

async function render() {
  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(createElement(SpaceChannelView));
    await new Promise((r) => setTimeout(r, 0));
  });
  return { root, container };
}

describe('SpaceChannelView', () => {
  it('renders the channel toolbar with name', async () => {
    const { root, container } = await render();
    expect(happy.document.body.textContent).toContain('general');
    const toolbar = happy.document.querySelector('.space-channel-toolbar');
    expect(toolbar).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('renders the composer for non-E2EE channels', async () => {
    const { root, container } = await render();
    const composer = happy.document.querySelector('[data-testid="composer"]');
    expect(composer).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows no-cipher message when E2EE space has no matching cipher', async () => {
    mockSpacesContext = makeDefaultCtx({
      activeSpace: {
        id: 'space-1',
        slug: 'test',
        name: 'Encrypted Space',
        memberCount: 1,
        cipherCheck: { knownValue: 'x', encryptedKnownValue: 'y', nonce: 'z' },
      },
    });

    const { root, container } = await render();
    expect(happy.document.body.textContent).toContain('spaces.channel.noCipher');
    const composer = happy.document.querySelector('[data-testid="composer"]');
    expect(composer).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows no-cipher message when E2EE channel has no matching cipher', async () => {
    mockSpacesContext = makeDefaultCtx({
      channels: [
        {
          id: 'ch-1',
          spaceId: 'space-1',
          type: 'text',
          name: 'general',
          position: 0,
          cipherCheck: { knownValue: 'a', encryptedKnownValue: 'b', nonce: 'c' },
        },
      ],
    });

    const { root, container } = await render();
    expect(happy.document.body.textContent).toContain('spaces.channel.noCipher');
    const composer = happy.document.querySelector('[data-testid="composer"]');
    expect(composer).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows encrypted badge in toolbar for E2EE channels', async () => {
    mockSpacesContext = makeDefaultCtx({
      activeSpace: {
        id: 'space-1',
        slug: 'test',
        name: 'Encrypted Space',
        memberCount: 1,
        cipherCheck: { knownValue: 'x', encryptedKnownValue: 'y', nonce: 'z' },
      },
    });

    const { root, container } = await render();
    const badge = happy.document.querySelector('.spaces-badge--encrypted');
    expect(badge).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('renders messages in the list', async () => {
    mockSpacesContext = makeDefaultCtx({
      activeMessages: [
        {
          id: 'msg-1',
          spaceId: 'space-1',
          channelId: 'ch-1',
          fromIdentityId: 'id-sender',
          content: 'Hello world',
          clientMessageId: 'cm-1',
          createdAt: '2024-01-01T12:00:00.000Z',
        },
      ],
    });

    const { root, container } = await render();
    expect(happy.document.body.textContent).toContain('Hello world');

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows empty state when no messages', async () => {
    const { root, container } = await render();
    expect(happy.document.body.textContent).toContain('spaces.channel.noMessages');

    await act(async () => root.unmount());
    container.remove();
  });

  it('calls setActiveChannel with channelId from route params', async () => {
    const setActiveChannel = mock(() => {});
    mockSpacesContext = makeDefaultCtx({ setActiveChannel });

    const { root, container } = await render();
    expect(setActiveChannel).toHaveBeenCalledWith('ch-1');

    await act(async () => root.unmount());
    container.remove();
  });
});
