import { describe, expect, mock, test } from 'bun:test';
import { createElement, createRef, forwardRef } from 'react';
import { renderElement } from '../../test/renderHook';
import type { MessageComposerHandle } from '../../components/composer';
import type { DecryptedConversation } from '../../hooks/conversations/types';

mock.module('./ConversationMessageList', () => ({
  ConversationMessageList: () => createElement('div', { 'data-testid': 'msglist' }),
}));
mock.module('../../components/composer', () => ({
  MessageComposer: forwardRef((props: { disabled?: boolean }, _ref) =>
    createElement('div', { 'data-testid': 'composer', 'data-disabled': String(!!props.disabled) }),
  ),
}));
mock.module('../../icons/Icon', () => ({
  Icon: (props: { name: string }) => createElement('span', { 'data-icon': props.name }),
}));

const { ConversationMainPanel } = await import('./ConversationMainPanel');

const t = ((key: string, fallback?: string) => fallback ?? key) as never;

const conversation = {
  id: 'c1',
  type: 'dm',
  participants: ['me', 'other'],
  admins: [],
  unreadCount: 0,
  hasUnread: false,
} as DecryptedConversation;

function makeFileDrop(active: boolean) {
  return {
    conversationDropActive: active,
    handleConversationDragEnter: () => {},
    handleConversationDragLeave: () => {},
    handleConversationDragOver: () => {},
    handleConversationDrop: () => {},
  } as never;
}

const security = {
  openMemberSecurity: () => {},
  handleDeviceTrustMismatch: () => {},
  peerPublicKeysById: {},
  verificationRevision: 0,
  keyChangeAlertIdentityIds: [],
  keyChangeAlertDismissed: false,
  setKeyChangeAlertDismissed: () => {},
} as never;

function baseProps(overrides?: Record<string, unknown>) {
  return {
    conversationId: 'c1',
    activeConversationId: 'c1',
    conversation,
    identity: { id: 'me' },
    participantProfiles: {},
    memberSettings: {},
    displayName: 'Other',
    flatItems: [],
    messagesLoading: false,
    reversedMessagesLength: 0,
    messagesById: new Map(),
    unreadCount: 0,
    fsInfo: { rotationLabel: '', readableWindow: '', tooltip: '' },
    lastMessageText: '',
    messageLayout: 'linear' as const,
    memberColorDisplay: { name: false, avatarAccent: false, messageBorder: false },
    favoriteEmojis: [],
    customEmojis: [],
    isFreeTier: false,
    hasMoreOlder: false,
    hasNewerPages: false,
    showManualLoadOlder: false,
    showManualLoadNewer: false,
    onManualLoadOlder: () => {},
    onManualLoadNewer: () => {},
    canManagePins: false,
    sending: false,
    composerRef: createRef<MessageComposerHandle>(),
    mentionInsertRef: { current: null },
    isDmBlocked: false,
    blockedByOther: false,
    otherParticipants: ['other'],
    onUnblock: async () => ({ success: true }),
    onUnblockSuccess: () => {},
    onUnblockError: () => {},
    getGroupedReactions: () => [],
    onReact: () => {},
    onToggleReaction: () => {},
    onAddFavorite: () => {},
    onRemoveFavorite: () => {},
    onMentionClick: () => {},
    onLinkClick: () => {},
    t,
    scroll: {
      showScrollButton: false,
      scrollViewportRef: createRef(),
      messagesContentRef: createRef(),
      messagesContainerRef: createRef(),
      onScrollViewportScroll: () => {},
      onUserScrollIntent: () => {},
      cachedScrollIndex: null,
    } as never,
    scrollOrchestration: {
      scrollToMessageId: () => {},
      handleJumpToLatest: () => {},
      handleReachOlder: () => {},
      handleReachNewer: () => {},
    } as never,
    fileDrop: makeFileDrop(false),
    messageActions: {
      flashingMessageId: null,
      handleDeleteMessage: () => {},
      handleReportMessage: () => {},
      setReplyingTo: () => {},
      handleStartEdit: () => {},
      handlePinMessage: () => {},
      handleUnpinMessage: () => {},
      editingMessage: null,
      setEditingMessage: () => {},
      editingInitialPlaintext: '',
      editingInitialAttachments: undefined,
    } as never,
    security,
    prefs: { useFs: false, handleToggleFs: () => {}, convGifHidden: false, gifsGloballyDisabled: false } as never,
    composerAdapter: {
      composerSend: async () => {},
      composerReplyContext: null,
      composerMentionSource: undefined,
      composerPageTagSource: undefined,
    } as never,
    ...overrides,
  };
}

describe('ConversationMainPanel', () => {
  test('renders the message list and composer', async () => {
    const { container } = await renderElement(createElement(ConversationMainPanel, baseProps()));
    expect(container.querySelector('[data-testid="msglist"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="composer"]')).not.toBeNull();
  });

  test('shows the drop overlay only while a drag is active', async () => {
    const { container: idle } = await renderElement(createElement(ConversationMainPanel, baseProps()));
    expect(idle.querySelector('.conversation-main-drop-overlay')).toBeNull();

    const { container: dragging } = await renderElement(
      createElement(ConversationMainPanel, baseProps({ fileDrop: makeFileDrop(true) })),
    );
    expect(dragging.querySelector('.conversation-main-drop-overlay')).not.toBeNull();
  });

  test('renders the blocked banner and disables the composer for a blocked DM', async () => {
    const { container } = await renderElement(
      createElement(ConversationMainPanel, baseProps({ isDmBlocked: true })),
    );
    expect(container.querySelector('.blocked-conversation-banner')).not.toBeNull();
    expect(container.querySelector('[data-testid="composer"]')?.getAttribute('data-disabled')).toBe('true');
  });

  test('shows the blocked-by-other banner without an unblock action', async () => {
    const { container } = await renderElement(
      createElement(ConversationMainPanel, baseProps({ blockedByOther: true })),
    );
    const banner = container.querySelector('.blocked-conversation-banner');
    expect(banner).not.toBeNull();
    expect(banner?.querySelector('button')).toBeNull();
  });
});
