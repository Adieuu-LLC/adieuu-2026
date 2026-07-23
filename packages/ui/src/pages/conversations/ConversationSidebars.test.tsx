import { describe, expect, mock, test } from 'bun:test';
import { createElement } from 'react';
import { renderElement } from '../../test/renderHook';
import type { DecryptedConversation } from '../../hooks/conversations/types';

mock.module('./ConversationSettingsSidebar', () => ({
  ConversationSettingsSidebar: () => createElement('div', { 'data-pane': 'settings' }),
}));
mock.module('./ConversationMembersSidebar', () => ({
  ConversationMembersSidebar: () => createElement('div', { 'data-pane': 'members' }),
}));
mock.module('./ConversationMessageSearch', () => ({
  ConversationMessageSearchPanel: () => createElement('div', { 'data-pane': 'search' }),
}));

const { ConversationSidebars } = await import('./ConversationSidebars');

const conversation = {
  id: 'c1',
  type: 'group',
  participants: ['me', 'other'],
  admins: ['me'],
  unreadCount: 0,
  hasUnread: false,
} as DecryptedConversation;

const dialogs = {
  renameValue: '',
  setRenameValue: () => {},
  renaming: false,
  handleRename: async () => {},
  editingMemberId: null,
  setEditingMemberId: () => {},
  closeMemberEdit: () => {},
  saveMemberEdit: async () => {},
  handlePromoteToAdmin: async () => {},
  handleRemoveMember: async () => {},
  setInviteMemberOpen: () => {},
} as never;

const adminSettings = {} as never;
const prefs = { convFsOverride: null, gifsGloballyDisabled: false, convGifHidden: false, effectiveGifAnimateOnHover: false, handleConvFsToggle: () => {}, setConvGifHidden: () => {}, handleGifAnimateOnHoverConversationToggle: () => {}, handleGifsDisabledByAdminToggle: () => {} } as never;

function baseProps(activePane: 'settings' | 'members' | 'search' | null, messageSearchSessionActive = false) {
  return {
    conversationId: 'c1',
    conversation,
    activePane,
    onCloseActivePane: () => {},
    identity: { id: 'me' },
    participantProfiles: {},
    memberSettings: {},
    isCurrentUserAdmin: true,
    canEditMemberSettings: true,
    otherParticipants: ['other'],
    fsConfigEnabled: false,
    dialogs,
    adminSettings,
    prefs,
    onOpenMemberSecurity: () => {},
    onAddMember: () => {},
    pendingInvites: [],
    pendingInvitesLoading: false,
    onRevokeInvite: async () => {},
    messageSearchSessionActive,
    messageSearchCacheMode: 'on_demand' as never,
    getActiveMessages: () => [],
    loadOlder: async () => {},
    messagesLoading: false,
    activeMessagesOlderCursor: null,
    onEndSearchSession: () => {},
    scrollToMessageId: () => {},
    selfParticipantJoinedAtMs: null,
  };
}

describe('ConversationSidebars', () => {
  test('renders the settings pane', async () => {
    const { container } = await renderElement(createElement(ConversationSidebars, baseProps('settings')));
    expect(container.querySelector('[data-pane="settings"]')).not.toBeNull();
    expect(container.querySelector('[data-pane="members"]')).toBeNull();
  });

  test('renders the members pane', async () => {
    const { container } = await renderElement(createElement(ConversationSidebars, baseProps('members')));
    expect(container.querySelector('[data-pane="members"]')).not.toBeNull();
  });

  test('renders the search panel only when a search session is active', async () => {
    const { container: without } = await renderElement(
      createElement(ConversationSidebars, baseProps('search', false)),
    );
    expect(without.querySelector('[data-pane="search"]')).toBeNull();

    const { container: withSession } = await renderElement(
      createElement(ConversationSidebars, baseProps('search', true)),
    );
    expect(withSession.querySelector('[data-pane="search"]')).not.toBeNull();
  });

  test('renders no docked pane when activePane is null', async () => {
    const { container } = await renderElement(createElement(ConversationSidebars, baseProps(null)));
    expect(container.querySelector('[data-pane="settings"]')).toBeNull();
    expect(container.querySelector('[data-pane="members"]')).toBeNull();
  });
});
