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

mock.module('../../components/Toast', () => ({
  useToast: () => ({
    success: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
    warning: mock(() => {}),
    toast: mock(() => {}),
    message: mock(() => {}),
  }),
}));

mock.module('../../components/IdentityHoverCard', () => ({
  IdentityHoverCard: ({ children }: { children: import('react').ReactElement }) => children,
}));

mock.module('../../components/Tooltip', () => ({
  Tooltip: ({ children }: { children: import('react').ReactElement }) => children,
}));

mock.module('../../icons/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

let mockCipherStoreCtx: Record<string, unknown> = {};

mock.module('../../hooks/useCipherStore', () => ({
  useCipherStore: () => mockCipherStoreCtx,
}));

const spaceCipherActual = await import('../../services/spaceCipherService');
mock.module('../../services/spaceCipherService', () => ({
  ...spaceCipherActual,
  getSpaceCipherLink: () => null,
}));

const mockSpacesApi = {
  addReaction: mock(async () => ({ success: true, data: null })),
  removeReaction: mock(async () => ({ success: true })),
  getReactions: mock(async () => ({ success: true, data: { reactions: [] } })),
  pinMessage: mock(async () => ({ success: true })),
  unpinMessage: mock(async () => ({ success: true })),
  getPinnedMessages: mock(async () => ({ success: true, data: { messages: [], cursor: null } })),
  getMessagesAround: mock(async () => ({ success: true, data: { messages: [], cursor: null } })),
  editMessage: mock(async () => ({ success: true, data: null })),
  deleteMessage: mock(async () => ({ success: true })),
  modDeleteMessage: mock(async () => ({ success: true })),
};

mock.module('../../hooks/useChannelReactions', () => ({
  useChannelReactions: () => ({
    reactions: {},
    loading: false,
    fetchReactions: async () => {},
    onReact: async () => {},
    onToggleReaction: () => {},
    getGroupedReactions: () => [],
    ingestSocketReaction: () => {},
    ingestSocketReactionRemoval: () => {},
  }),
}));

mock.module('../../hooks/useChannelPins', () => ({
  useChannelPins: () => ({
    pinnedMessageIds: [],
    pinnedMessageIdsKey: '',
    pinnedCount: 0,
    canManagePins: true,
    onPin: async () => {},
    onUnpin: async () => {},
    loadPinnedMessagesPage: async () => null,
    ingestSocketPinsUpdate: () => {},
    ingestSocketPinChange: () => {},
  }),
}));

mock.module('../../hooks/useReplyParentHydration', () => ({
  useReplyParentHydration: () => ({
    getParentInfo: () => null,
    ensureHydrated: async () => {},
    hydrateAll: () => {},
    hydratedParents: {},
  }),
  buildChannelReplyQuote: () => null,
}));

mock.module('../../hooks/adapters/spaceReactionsAdapter', () => ({
  createSpaceReactionsAdapter: () => ({
    addReaction: async () => null,
    removeReaction: async () => true,
    getReactions: async () => [],
  }),
}));

mock.module('../../hooks/adapters/spacePinsAdapter', () => ({
  createSpacePinsAdapter: () => ({
    pinMessage: async () => true,
    unpinMessage: async () => true,
    getPinnedMessages: async () => null,
  }),
}));

mock.module('../../hooks/adapters/spaceReplyAdapter', () => ({
  createSpaceReplyAdapter: () => ({
    fetchMessage: async () => null,
  }),
}));

mock.module('../../components/composer/MessageComposer', () => ({
  MessageComposer: ({ channelId }: { channelId: string }) =>
    createElement('div', { 'data-testid': 'composer', 'data-channel': channelId }, 'Composer'),
}));

mock.module('../../components/messaging/ChannelMessageBubble', () => ({
  ChannelMessageBubble: ({ message }: { message: { id: string; body: string } }) =>
    createElement('div', { 'data-testid': `bubble-${message.id}`, className: 'channel-message-bubble' }, message.body),
}));

mock.module('../../components/messaging/ChannelPinsMenu', () => ({
  ChannelPinsMenu: () => createElement('div', { 'data-testid': 'pins-menu' }),
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
let prevRaf: typeof globalThis.requestAnimationFrame;

function makeDefaultCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    activeSpace: {
      id: 'space-1', slug: 'test', name: 'Test', memberCount: 1,
      e2ee: false, encryptIdentity: false, cipherRequired: false, visibility: 'public',
    },
    channels: [{ id: 'ch-1', spaceId: 'space-1', type: 'text', name: 'general', position: 0 }],
    activeChannelId: 'ch-1',
    activeMessages: [],
    activeMessagesLoading: false,
    activeMessagesOlderCursor: null,
    isActiveSpaceMember: true,
    sending: false,
    participantProfiles: {},
    unreadByChannel: {},
    resolveProfiles: mock(() => {}),
    setActiveChannel: mock(() => {}),
    sendMessage: mock(async () => null),
    loadOlderMessages: mock(async () => {}),
    fetchMessagesAround: mock(async () => null),
    trimActiveChannelBuffer: mock(() => {}),
    clearChannelUnread: mock(() => {}),
    registerSocketCallbacks: mock(() => {}),
    ...overrides,
  };
}

class StubIO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class StubRO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  resetReactI18nextMock();
  setMockTranslate((key) => key);
  resetReactRouterDomMock();
  setMockParams({ channelId: 'ch-1' });
  mockSpacesContext = makeDefaultCtx();
  mockCipherStoreCtx = {
    getCipherKey: () => null,
    ciphers: [],
    createCipher: async () => ({ success: false }),
    bookmarkSpaceCipher: async () => ({ success: true }),
    findLocalIdByCipherId: () => undefined,
    encryptionAvailable: false,
  };

  const g = globalThis as G;
  prevWindow = g.window;
  prevDocument = g.document;
  prevRaf = g.requestAnimationFrame;
  happy = new GlobalWindow({ url: 'https://example.test/' });
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.window = happy as unknown as GlobalWindow & typeof globalThis;
  g.document = happy.document;
  g.requestAnimationFrame = happy.requestAnimationFrame.bind(happy);
  if (!g.IntersectionObserver) (g as any).IntersectionObserver = StubIO;
  if (!g.ResizeObserver) (g as any).ResizeObserver = StubRO;
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  happy?.close();
  const g = globalThis as G;
  delete g.IS_REACT_ACT_ENVIRONMENT;
  g.window = prevWindow;
  g.document = prevDocument;
  g.requestAnimationFrame = prevRaf;
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
        e2ee: true,
        encryptIdentity: false,
        cipherRequired: true,
        visibility: 'listed',
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
        e2ee: true,
        encryptIdentity: false,
        cipherRequired: true,
        visibility: 'listed',
        cipherCheck: { knownValue: 'x', encryptedKnownValue: 'y', nonce: 'z' },
      },
    });

    const { root, container } = await render();
    const badge = happy.document.querySelector('.spaces-badge--encrypted');
    expect(badge).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('renders messages via shared ChannelMessageBubble', async () => {
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
    const bubble = happy.document.querySelector('[data-testid="bubble-msg-1"]');
    expect(bubble).not.toBeNull();
    expect(happy.document.body.textContent).toContain('Hello world');

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows day separator for messages', async () => {
    mockSpacesContext = makeDefaultCtx({
      activeMessages: [
        {
          id: 'msg-1',
          spaceId: 'space-1',
          channelId: 'ch-1',
          fromIdentityId: 'id-sender',
          content: 'Hello',
          clientMessageId: 'cm-1',
          createdAt: '2024-01-01T12:00:00.000Z',
        },
      ],
    });

    const { root, container } = await render();
    const sep = happy.document.querySelector('.dm-day-separator');
    expect(sep).not.toBeNull();

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

  it('renders the shared ChannelMessageList container', async () => {
    mockSpacesContext = makeDefaultCtx({
      activeMessages: [
        {
          id: 'msg-1',
          spaceId: 'space-1',
          channelId: 'ch-1',
          fromIdentityId: 'id-sender',
          content: 'Test',
          clientMessageId: 'cm-1',
          createdAt: '2024-01-01T12:00:00.000Z',
        },
      ],
    });

    const { root, container } = await render();
    const messageContainer = happy.document.querySelector('.conversation-messages');
    expect(messageContainer).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });
});
