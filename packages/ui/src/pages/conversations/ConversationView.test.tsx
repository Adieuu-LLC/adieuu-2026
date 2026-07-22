/**
 * ConversationView integration test.
 *
 * Verifies the composition root's own wiring: the not-found fallback, that the
 * extracted feature components are rendered when a conversation is present, that
 * activePane state is coordinated across header and sidebars, and that the
 * blocked-DM flag flows to the main panel. Feature hooks and heavy children are
 * stubbed (they have their own unit tests) so this focuses on ConversationView.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createElement } from 'react';
import { renderElement, act } from '../../test/renderHook';
import { setMockParams, resetReactRouterDomMock } from '../../test/react-router-dom-mock';
import '../../test/react-i18next-mock';

// ---- Mutable test state ------------------------------------------------------

interface Conv {
  id: string;
  type: 'dm' | 'group';
  participants: string[];
  admins: string[];
  pinnedMessageIds: string[];
  encryptedName?: string;
  nameNonce?: string;
  unreadCount: number;
  hasUnread: boolean;
}

let conversations: Conv[] = [];
let isBlockedReturn = false;

const captured: Record<string, Record<string, unknown>> = {
  header: {},
  mainPanel: {},
  sidebars: {},
  overlays: {},
  callSection: {},
};

// ---- Sub-component stubs (capture props) -------------------------------------

mock.module('./ConversationHeader', () => ({
  ConversationHeader: (props: Record<string, unknown>) => {
    captured.header = props;
    return createElement('div', { 'data-testid': 'header' });
  },
}));
mock.module('./ConversationMainPanel', () => ({
  ConversationMainPanel: (props: Record<string, unknown>) => {
    captured.mainPanel = props;
    return createElement('div', { 'data-testid': 'main-panel' });
  },
}));
mock.module('./ConversationSidebars', () => ({
  ConversationSidebars: (props: Record<string, unknown>) => {
    captured.sidebars = props;
    return createElement('div', { 'data-testid': 'sidebars' });
  },
}));
mock.module('./ConversationOverlays', () => ({
  ConversationOverlays: (props: Record<string, unknown>) => {
    captured.overlays = props;
    return createElement('div', { 'data-testid': 'overlays' });
  },
}));
mock.module('./ConversationCallSection', () => ({
  ConversationCallSection: (props: Record<string, unknown>) => {
    captured.callSection = props;
    return createElement('div', { 'data-testid': 'call-section' });
  },
}));
mock.module('../../components/ChatConnectionBanner', () => ({ ChatConnectionBanner: () => null }));
mock.module('../../icons/Icon', () => ({ Icon: () => null }));

// ---- Data/context hook stubs -------------------------------------------------

const noop = () => {};
const asyncNoop = async () => {};

mock.module('../../hooks/useConversations', () => ({
  useConversations: () => ({
    conversations,
    activeConversationId: 'c1',
    activeMessages: [],
    activeMessagesOlderCursor: null,
    activeMessagesHasNewerPages: false,
    messagesLoading: false,
    sending: false,
    participantProfiles: {},
    setActiveConversation: noop,
    setIsAtBottom: noop,
    fetchConversationById: asyncNoop,
    markConversationRead: noop,
    sendTextMessage: asyncNoop,
    editTextMessage: asyncNoop,
    loadOlder: asyncNoop,
    loadNewer: asyncNoop,
    activeShowManualLoadOlder: false,
    activeShowManualLoadNewer: false,
    jumpToLatestMessages: asyncNoop,
    fetchMessagesAround: asyncNoop,
    loadPinnedMessagesPage: asyncNoop,
    replyParentHydrationMap: {},
    ensureReplyParentHydration: asyncNoop,
    leaveGroup: asyncNoop,
    removeMember: asyncNoop,
    promoteToAdmin: asyncNoop,
    terminateGroup: asyncNoop,
    deleteMessage: noop,
    pinMessage: asyncNoop,
    unpinMessage: asyncNoop,
    renameGroup: asyncNoop,
    updateMemberSettings: asyncNoop,
    updateGifsDisabled: asyncNoop,
    updateGifContentFilter: asyncNoop,
    updateCustomEmojisDisabled: asyncNoop,
    updateMessageSearchCachePolicy: asyncNoop,
    updateAllowSkipModeration: asyncNoop,
    updateCallSettings: asyncNoop,
    memberSettings: {},
    fetchRecipientKeys: asyncNoop,
    listPendingGroupInvites: asyncNoop,
    revokeGroupInvite: asyncNoop,
    pendingInvitesRefreshSignal: null,
    prefetchParticipantProfiles: asyncNoop,
  }),
}));

mock.module('../../hooks/useConversationScroll', () => ({
  useConversationScroll: () => ({
    scrollViewportRef: { current: null },
    messagesContentRef: { current: null },
    messagesContainerRef: { current: null },
    isAtBottomRef: { current: true },
    showScrollButton: false,
    scrollToBottom: noop,
    scrollToBottomIfPinned: noop,
    markJustSent: noop,
    cachedScrollIndex: null,
    onScrollViewportScroll: noop,
    onUserScrollIntent: noop,
  }),
}));

mock.module('../../hooks/useViewportReactionFetch', () => ({ useViewportReactionFetch: noop }));
mock.module('../../hooks/useIdentity', () => ({ useIdentity: () => ({ identity: { id: 'me' } }) }));
mock.module('../../hooks/useAuth', () => ({ useAuth: () => ({ session: null }) }));
mock.module('../../hooks/useCustomEmojis', () => ({ useCustomEmojis: () => ({ emojis: [] }) }));
mock.module('../../hooks/usePreKeys', () => ({
  usePreKeys: () => ({
    config: { enabled: false, securityLevel: 'standard', spkDeletionPolicy: 'keep', clearCacheOnRotation: false },
  }),
}));
mock.module('../../hooks/useReactions', () => ({
  useReactions: () => ({ fetchReactions: noop, addReaction: noop, removeReaction: noop, getGroupedReactions: () => [] }),
}));
mock.module('../../hooks/useFavoriteEmojis', () => ({
  useFavoriteEmojis: () => ({ favorites: [], addFavorite: noop, removeFavorite: noop }),
}));
mock.module('../../services/preKeyService', () => ({ loadShowMessageArtifacts: () => false }));
mock.module('../../config/PlatformContext', () => ({ useAppConfig: () => ({ apiBaseUrl: 'http://localhost' }) }));
mock.module('../../hooks/useMessageLayoutPreference', () => ({ useMessageLayoutPreference: () => 'linear' }));
mock.module('../../hooks/useMemberColorPreference', () => ({
  useMemberColorPreference: () => ({ name: false, avatarAccent: false, messageBorder: false }),
}));
mock.module('../../hooks/useE2EMediaDownload', () => ({ clearMediaCache: noop }));
mock.module('../../hooks/useMessageAchievements', () => ({ useMessageAchievements: () => noop }));
mock.module('../../hooks/useBlockContext', () => ({
  useBlockContext: () => ({ isBlocked: () => isBlockedReturn, unblock: async () => ({ success: true }) }),
}));
mock.module('../../components/Toast', () => ({ useToast: () => ({ success: noop, error: noop }) }));
mock.module('../../services/mediaOutbox', () => ({
  useMediaOutbox: () => ({ registerConversationOutboxHooks: noop }),
  useMediaOutboxJobList: () => [],
}));
mock.module('./forwardSecrecyLabels', () => ({
  buildForwardSecrecyUiLabels: () => ({ rotationLabel: '', readableWindow: '', tooltip: '' }),
}));
mock.module('../../hooks/useMessageSearchPreferences', () => ({ useMessageSearchCacheMode: () => ['on_demand', noop] }));

// ---- Feature + orchestration hook stubs -------------------------------------

mock.module('../../hooks/conversations/useConversationPendingInvites', () => ({
  useConversationPendingInvites: () => ({
    pendingInvites: [],
    pendingInvitesLoading: false,
    refreshPendingInvites: noop,
    handleRevokeInvite: asyncNoop,
  }),
}));
mock.module('../../hooks/conversations/useDmBlockedByOther', () => ({
  useDmBlockedByOther: () => ({ blockedByOther: false, setBlockedByOther: noop }),
}));
mock.module('../../hooks/conversations/useConversationReactionHandlers', () => ({
  useConversationReactionHandlers: () => ({ handleReact: noop, handleToggleReaction: noop }),
}));
mock.module('../../hooks/conversations/useConversationComposerAdapter', () => ({
  useConversationComposerAdapter: () => ({
    composerSend: asyncNoop,
    composerReplyContext: null,
    composerMentionSource: undefined,
    composerPageTagSource: undefined,
  }),
}));
mock.module('../../hooks/conversations/useConversationScrollOrchestration', () => ({
  useConversationScrollOrchestration: () => ({
    scrollToMessageId: noop,
    handleJumpToLatest: noop,
    handleReachOlder: noop,
    handleReachNewer: noop,
    resetScrollRefsOnConversationIdChange: noop,
  }),
}));
mock.module('../../hooks/conversations/useConversationCallState', () => ({
  useConversationCallState: () => ({
    audioAllowed: true,
    isInCallElsewhere: false,
    isInCallHere: false,
    callSession: { requestStartCall: noop, requestJoinCall: noop, activeSession: null },
    conversationCall: { activeCall: null, participants: [], isInCall: false, refetch: noop },
    showCallBanner: false,
    isGhostParticipant: false,
    troubleshootOpen: false,
    setTroubleshootOpen: noop,
    handleForceEndCall: async () => false,
  }),
}));
mock.module('../../hooks/conversations/useConversationSecurityState', () => ({
  useConversationSecurityState: () => ({
    openMemberSecurity: noop,
    setMemberSecurityModal: noop,
    memberSecurityModal: null,
    bumpVerificationRevision: noop,
    peerPublicKeysById: {},
    verificationRevision: 0,
    keyChangeAlertIdentityIds: [],
    keyChangeAlertDismissed: false,
    setKeyChangeAlertDismissed: noop,
    handleDeviceTrustMismatch: noop,
  }),
}));
mock.module('../../hooks/conversations/useConversationAdminSettings', () => ({
  useConversationAdminSettings: () => ({}),
}));
mock.module('../../hooks/conversations/useConversationPreferences', () => ({
  useConversationPreferences: () => ({ convGifHidden: false, gifsGloballyDisabled: false, effectiveGifAnimateOnHover: false }),
}));
mock.module('../../hooks/conversations/useConversationDialogState', () => ({
  useConversationDialogState: () => ({
    setDeleteGroupOpen: noop,
    handleLeaveClick: noop,
    handleLinkClick: noop,
    setPendingLinkHref: noop,
  }),
}));
mock.module('../../hooks/conversations/useConversationMessageActions', () => ({
  useConversationMessageActions: () => ({
    handleUnpinMessage: asyncNoop,
    setReportModalOpen: noop,
    setReplyingTo: noop,
    setFlashingMessageId: noop,
    setEditingMessage: noop,
    replyingTo: null,
    editingMessage: null,
    onEditMaxReached: noop,
  }),
}));
mock.module('../../hooks/conversations/useConversationFileDrop', () => ({
  useConversationFileDrop: () => ({}),
}));

let searchToggleImpl = noop;
mock.module('../../hooks/conversations/useConversationMessageSearchSession', () => ({
  useConversationMessageSearchSession: () => ({
    messageSearchSessionActive: false,
    handleToggleMessageSearch: () => searchToggleImpl(),
    handleMessageSearchEndSession: noop,
  }),
}));

mock.module('./conversationViewModel', () => ({
  getConversationHeaderCopy: () => ({ otherParticipantIds: ['other'], displayName: 'Other', subtitle: 'sub' }),
  buildMessagesByIdMap: () => new Map(),
  getReversedVisibleMessages: () => [],
  getLastMessagePreviewText: () => '',
  getToolbarAvatarMemberIds: () => [],
  resolveToolbarParticipantName: () => 'Other',
  buildFlatChatItems: () => [],
  mergePendingOutboxIntoFlatItems: () => [],
  canManageConversationPinsView: () => false,
  formatPinPreviewForToolbar: () => '',
}));

const { ConversationView } = await import('./ConversationView');

function makeConv(overrides?: Partial<Conv>): Conv {
  return {
    id: 'c1',
    type: 'dm',
    participants: ['me', 'other'],
    admins: [],
    pinnedMessageIds: [],
    unreadCount: 0,
    hasUnread: false,
    ...overrides,
  };
}

describe('ConversationView', () => {
  beforeEach(() => {
    resetReactRouterDomMock();
    setMockParams({ id: 'c1' });
    conversations = [];
    isBlockedReturn = false;
    searchToggleImpl = noop;
    captured.header = {};
    captured.mainPanel = {};
    captured.sidebars = {};
    captured.overlays = {};
    captured.callSection = {};
  });

  test('renders the not-found fallback when the conversation is missing', async () => {
    conversations = [];
    const { container } = await renderElement(createElement(ConversationView));
    expect(container.textContent).toContain('Conversation not found');
    expect(container.querySelector('[data-testid="header"]')).toBeNull();
  });

  test('composes the feature components when the conversation exists', async () => {
    conversations = [makeConv()];
    const { container } = await renderElement(createElement(ConversationView));
    expect(container.querySelector('[data-testid="header"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="main-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sidebars"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="overlays"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="call-section"]')).not.toBeNull();
  });

  test('coordinates activePane state between header and sidebars', async () => {
    conversations = [makeConv()];
    await renderElement(createElement(ConversationView));
    expect(captured.sidebars.activePane).toBe(null);

    await act(async () => {
      (captured.header.setActivePane as (v: string) => void)('settings');
    });
    expect(captured.sidebars.activePane).toBe('settings');
    expect(captured.header.activePane).toBe('settings');
  });

  test('propagates the blocked-DM flag to header and main panel', async () => {
    conversations = [makeConv({ type: 'dm' })];
    isBlockedReturn = true;
    await renderElement(createElement(ConversationView));
    expect(captured.mainPanel.isDmBlocked).toBe(true);
    expect(captured.header.isDmBlocked).toBe(true);
  });

  test('does not flag a group conversation as a blocked DM', async () => {
    conversations = [makeConv({ type: 'group' })];
    isBlockedReturn = true;
    await renderElement(createElement(ConversationView));
    expect(captured.mainPanel.isDmBlocked).toBe(false);
  });
});
