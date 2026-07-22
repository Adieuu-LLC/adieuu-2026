import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createElement } from 'react';
import { act } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import { resetReactRouterDomMock, mockNavigate } from '../../test/react-router-dom-mock';
import { resetReactI18nextMock, setMockTranslate } from '../../test/react-i18next-mock';
import { SidebarListViewProvider } from './sidebarListView';

setMockTranslate((key, def) => (typeof def === 'string' ? def : key));

const closeMobile = mock(() => {});
const setBadgeCount = mock((_count: number, _accent?: string, _secondary?: string) => {});
const setActiveConversation = mock((_id: string) => {});

mock.module('../../components/Sidebar', () => ({
  useSidebar: () => ({ closeMobile, isExpanded: true }),
  SidebarItem: ({ label, onClick }: { label: string; onClick?: () => void }) =>
    createElement('button', { type: 'button', 'data-testid': 'sidebar-item', onClick }, label),
}));

mock.module('../../icons/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

mock.module('../../components/ChatConnectionBanner', () => ({
  ChatConnectionBanner: () => createElement('div', { 'data-testid': 'chat-banner' }),
}));

mock.module('../../components/Popover', () => ({
  Popover: ({
    trigger,
  }: {
    trigger: import('react').ReactNode;
  }) => createElement('div', { 'data-testid': 'filter-popover' }, trigger),
}));

mock.module('../../components/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

mock.module('../../components/FolderEditModal', () => ({
  FolderEditModal: () => null,
}));

mock.module('./invitations', () => ({
  ChatInvitationsSidebarButton: () =>
    createElement('div', { 'data-testid': 'chat-invites-button' }),
}));

mock.module('./SidebarConversationDmHoverCard', () => ({
  SidebarConversationDmHoverCard: ({ children }: { children: import('react').ReactElement }) => children,
}));

mock.module('./GroupConversationSidebarHoverCard', () => ({
  GroupConversationSidebarHoverCard: ({ children }: { children: import('react').ReactElement }) =>
    children,
}));

mock.module('../../components/IdentityHoverCard', () => ({
  IdentityHoverCard: ({ children }: { children: import('react').ReactElement }) => children,
}));

let mockIdentity = { id: 'self-id' } as { id: string } | null;
let mockIdentityStatus = 'logged_in';

mock.module('../../hooks/useIdentity', () => ({
  useIdentity: () => ({ identity: mockIdentity, status: mockIdentityStatus }),
}));

let mockConversations: unknown[] = [];
let mockParticipantProfiles: Record<string, { displayName?: string; username?: string }> = {};
let mockActiveConversationId: string | null = null;
let mockLoading = false;

mock.module('../../hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: mockConversations,
    loading: mockLoading,
    leaveGroup: mock(async () => {}),
    participantProfiles: mockParticipantProfiles,
    activeConversationId: mockActiveConversationId,
    setActiveConversation,
  }),
}));

mock.module('../../hooks/useConversationPreferences', () => ({
  useConversationPreferences: () => ({
    preferences: {},
    toggleArchive: mock(async () => {}),
    toggleFavorite: mock(async () => {}),
  }),
}));

mock.module('../../hooks/useConversationFolders', () => ({
  useConversationFolders: () => ({
    folders: [],
    folderedConversationIds: new Set<string>(),
    folderedSpaceIds: new Set<string>(),
    createFolder: mock(async () => {}),
    deleteFolder: mock(async () => {}),
    updateFolder: mock(async () => {}),
    addConversationToFolder: mock(async () => {}),
    addSpaceToFolder: mock(async () => {}),
    toggleFolderFavorite: mock(async () => {}),
  }),
}));

mock.module('../../hooks/useGlobalCallEvents', () => ({
  useGlobalCallEvents: () => ({ activeCallConversationIds: new Set<string>() }),
}));

mock.module('../../hooks/useCallSession', () => ({
  useCallSession: () => ({ activeSession: null }),
}));

mock.module('../../hooks/useTheme', () => ({
  useTheme: () => ({
    activeTheme: {
      colors: { accentPrimary: '#111111', accentSecondary: '#222222' },
    },
  }),
}));

mock.module('../../hooks/useCipherStore', () => ({
  useCipherStore: () => ({
    getCipherKey: () => null,
  }),
}));

const configActual = await import('../../config');
mock.module('../../config', () => ({
  ...configActual,
  usePlatformCapabilities: () => ({
    appWindow: { setBadgeCount },
  }),
}));

function makeSpace(overrides: Record<string, unknown> = {}) {
  return {
    id: 'space-1',
    slug: 'test-space',
    name: 'Test Space',
    description: 'A lovely place',
    visibility: 'public',
    e2ee: false,
    encryptIdentity: false,
    cipherRequired: false,
    createdBy: 'id-owner',
    ownerIdentityId: 'id-owner',
    allowFreeMembers: true,
    memberCount: 3,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

let mockUnreadBySpace: Record<string, number> = {};
let mockSpaces: unknown[] = [];
let mockSpacesLoading = false;

mock.module('../../hooks/useSpaces', () => ({
  useSpaces: () => ({
    spaces: mockSpaces,
    spacesLoading: mockSpacesLoading,
    unreadBySpace: mockUnreadBySpace,
  }),
}));

const { ConversationsSidebarSection } = await import('./conversations');

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: GlobalWindow;
let prevWindow: typeof globalThis.window;
let prevDocument: typeof globalThis.document;
let prevRaf: typeof globalThis.requestAnimationFrame;
let prevCaf: typeof globalThis.cancelAnimationFrame;

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    type: 'dm',
    participants: ['self-id', 'other-1'],
    admins: [],
    unreadCount: 0,
    hasUnread: false,
    decryptedName: 'Alice',
    ...overrides,
  };
}

beforeEach(() => {
  resetReactI18nextMock();
  setMockTranslate((key, def) => (typeof def === 'string' ? def : key));
  resetReactRouterDomMock();
  closeMobile.mockClear();
  setBadgeCount.mockClear();
  setActiveConversation.mockClear();
  mockNavigate.mockClear();
  mockIdentity = { id: 'self-id' };
  mockIdentityStatus = 'logged_in';
  mockConversations = [makeConversation()];
  mockParticipantProfiles = {
    'other-1': { displayName: 'Alice' },
  };
  mockActiveConversationId = null;
  mockLoading = false;
  mockUnreadBySpace = {};
  mockSpaces = [];
  mockSpacesLoading = false;

  const g = globalThis as G;
  prevWindow = g.window;
  prevDocument = g.document;
  prevRaf = g.requestAnimationFrame;
  prevCaf = g.cancelAnimationFrame;
  happy = new GlobalWindow({ url: 'https://example.test/' });
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.window = happy as unknown as GlobalWindow & typeof globalThis;
  g.document = happy.document;
  g.requestAnimationFrame = happy.requestAnimationFrame.bind(happy);
  g.cancelAnimationFrame = happy.cancelAnimationFrame.bind(happy);
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  happy?.close();
  const g = globalThis as G;
  delete g.IS_REACT_ACT_ENVIRONMENT;
  g.window = prevWindow;
  g.document = prevDocument;
  g.requestAnimationFrame = prevRaf;
  g.cancelAnimationFrame = prevCaf;
});

async function renderSection() {
  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(
      createElement(
        SidebarListViewProvider,
        null,
        createElement(ConversationsSidebarSection, {
          isChatInvitesPanelOpen: false,
          onToggleChatInvitesPanel: () => {},
        }),
      ),
    );
    await new Promise((r) => setTimeout(r, 0));
  });
  return { root, container };
}

describe('ConversationsSidebarSection', () => {
  it('renders conversation rows and navigates on select', async () => {
    const { root, container } = await renderSection();

    expect(happy.document.body.textContent).toContain('Alice');

    const row = [...happy.document.querySelectorAll('button.conversation-list-item')][0];
    expect(row).toBeDefined();
    await act(async () => {
      (row as HTMLButtonElement).click();
    });
    expect(setActiveConversation).toHaveBeenCalledWith('conv-1');
    expect(mockNavigate).toHaveBeenCalledWith('/conversations/conv-1');
    expect(closeMobile).toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it('navigates to new conversation from the New action', async () => {
    const { root, container } = await renderSection();

    const newBtn = [...happy.document.querySelectorAll('[data-testid="sidebar-item"]')].find((b) =>
      b.textContent?.includes('New'),
    );
    expect(newBtn).toBeDefined();
    await act(async () => {
      (newBtn as HTMLButtonElement).click();
    });
    expect(mockNavigate).toHaveBeenCalledWith('/conversations/new');
    expect(closeMobile).toHaveBeenCalled();

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows New only on Conversations and Discover on Spaces/All', async () => {
    const { root, container } = await renderSection();

    const labels = () =>
      [...happy.document.querySelectorAll('[data-testid="sidebar-item"]')].map((b) => b.textContent);

    expect(labels().some((t) => t?.includes('New'))).toBe(true);
    expect(labels().some((t) => t?.includes('Create Space'))).toBe(false);
    expect(labels().some((t) => t?.includes('Discover'))).toBe(false);
    expect(happy.document.querySelector('.sidebar-filter-trigger')?.textContent).toContain('Filter');

    const spacesTab = [...happy.document.querySelectorAll('button[data-tab-id="spaces"]')][0];
    await act(async () => {
      (spacesTab as HTMLButtonElement).click();
    });
    expect(labels().some((t) => t?.includes('New'))).toBe(false);
    expect(labels().some((t) => t?.includes('Create Space'))).toBe(false);
    expect(labels().some((t) => t?.includes('Discover'))).toBe(true);

    const allTab = [...happy.document.querySelectorAll('button[data-tab-id="all"]')][0];
    await act(async () => {
      (allTab as HTMLButtonElement).click();
    });
    expect(labels().some((t) => t?.includes('New'))).toBe(false);
    expect(labels().some((t) => t?.includes('Create Space'))).toBe(false);
    expect(labels().some((t) => t?.includes('Discover'))).toBe(true);

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows conversation and spaces tab badges from unread totals', async () => {
    mockConversations = [
      makeConversation({ id: 'c1', unreadCount: 2, hasUnread: true }),
      makeConversation({ id: 'c2', unreadCount: 0, hasUnread: true, decryptedName: 'Bob' }),
    ];
    mockUnreadBySpace = { 'space-1': 3, 'space-2': 1 };

    const { root, container } = await renderSection();

    const badges = [...happy.document.querySelectorAll('.sidebar-tab-badge')];
    // conversations: (1+2) + (1+0) = 4; spaces: 3+1 = 4
    expect(badges.map((b) => b.textContent)).toEqual(['4', '4']);

    await act(async () => root.unmount());
    container.remove();
  });

  it('sets the app badge count to conversations plus spaces unread', async () => {
    mockConversations = [makeConversation({ unreadCount: 2, hasUnread: false })];
    mockUnreadBySpace = { 'space-1': 5 };

    const { root, container } = await renderSection();

    expect(setBadgeCount).toHaveBeenCalled();
    const last = setBadgeCount.mock.calls[setBadgeCount.mock.calls.length - 1]!;
    expect(last[0]).toBe(7);
    expect(last[1]).toBe('#111111');
    expect(last[2]).toBe('#222222');

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows spaces when the Spaces tab is selected', async () => {
    mockSpaces = [makeSpace()];
    const { root, container } = await renderSection();

    const spacesTab = [...happy.document.querySelectorAll('button[data-tab-id="spaces"]')][0];
    expect(spacesTab).toBeDefined();
    await act(async () => {
      (spacesTab as HTMLButtonElement).click();
    });
    expect(happy.document.body.textContent).toContain('Test Space');
    expect(happy.document.body.textContent).not.toContain('Alice');

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows conversations and spaces on the All tab', async () => {
    mockSpaces = [makeSpace()];
    const { root, container } = await renderSection();

    const allTab = [...happy.document.querySelectorAll('button[data-tab-id="all"]')][0];
    expect(allTab).toBeDefined();
    await act(async () => {
      (allTab as HTMLButtonElement).click();
    });
    expect(happy.document.body.textContent).toContain('Alice');
    expect(happy.document.body.textContent).toContain('Test Space');

    await act(async () => root.unmount());
    container.remove();
  });

  it('renders the filter popover trigger on all views', async () => {
    const { root, container } = await renderSection();

    expect(happy.document.querySelector('.sidebar-filter-trigger')).not.toBeNull();

    const spacesTab = [...happy.document.querySelectorAll('button[data-tab-id="spaces"]')][0];
    await act(async () => {
      (spacesTab as HTMLButtonElement).click();
    });
    expect(happy.document.querySelector('.sidebar-filter-trigger')).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('orders tabs Conversations, Spaces, All with Spaces icon after its label', async () => {
    const { root, container } = await renderSection();

    const tabIds = [...happy.document.querySelectorAll('button[data-tab-id]')].map((b) =>
      b.getAttribute('data-tab-id'),
    );
    expect(tabIds).toEqual(['conversations', 'spaces', 'all']);

    const spacesTab = happy.document.querySelector('button[data-tab-id="spaces"]');
    expect(spacesTab?.classList.contains('sidebar-tab-icon-end')).toBe(true);
    expect(happy.document.querySelector('button[data-tab-id="all"]')?.textContent).toContain('All');

    await act(async () => root.unmount());
    container.remove();
  });
});
