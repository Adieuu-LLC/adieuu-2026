import { describe, expect, test } from 'bun:test';
import {
  applySidebarAction,
  closeChatInvitesPanel,
  closeFriendsPanel,
  initialSidebarPanelState,
  toggleChatInvitesPanel,
  toggleFriendsPanel,
  type SidebarPanelState,
} from './sidebarPanelState';

describe('sidebarPanelState', () => {
  test('toggleFriendsPanel opens friends and closes invites', () => {
    const state: SidebarPanelState = {
      isFriendsPanelOpen: false,
      isChatInvitesPanelOpen: true,
      openFolderId: null,
    };

    expect(toggleFriendsPanel(state)).toEqual({
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: false,
      openFolderId: null,
    });
  });

  test('toggleFriendsPanel closes friends and preserves invites state', () => {
    const state: SidebarPanelState = {
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: false,
      openFolderId: 'folder-1',
    };

    expect(toggleFriendsPanel(state)).toEqual({
      isFriendsPanelOpen: false,
      isChatInvitesPanelOpen: false,
      openFolderId: 'folder-1',
    });
  });

  test('toggleChatInvitesPanel opens invites and closes friends', () => {
    const state: SidebarPanelState = {
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: false,
      openFolderId: null,
    };

    expect(toggleChatInvitesPanel(state)).toEqual({
      isFriendsPanelOpen: false,
      isChatInvitesPanelOpen: true,
      openFolderId: null,
    });
  });

  test('toggleChatInvitesPanel closes invites and preserves friends state', () => {
    const state: SidebarPanelState = {
      isFriendsPanelOpen: false,
      isChatInvitesPanelOpen: true,
      openFolderId: 'folder-1',
    };

    expect(toggleChatInvitesPanel(state)).toEqual({
      isFriendsPanelOpen: false,
      isChatInvitesPanelOpen: false,
      openFolderId: 'folder-1',
    });
  });

  test('close helpers only close their respective panel', () => {
    const state: SidebarPanelState = {
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: true,
      openFolderId: 'folder-1',
    };

    expect(closeFriendsPanel(state)).toEqual({
      isFriendsPanelOpen: false,
      isChatInvitesPanelOpen: true,
      openFolderId: 'folder-1',
    });

    expect(closeChatInvitesPanel(state)).toEqual({
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: false,
      openFolderId: 'folder-1',
    });
  });

  test('applySidebarAction(openFriends) enforces mutual exclusivity', () => {
    expect(applySidebarAction(initialSidebarPanelState, 'openFriends')).toEqual({
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: false,
      openFolderId: null,
    });
  });

  test('applySidebarAction(openInvites) enforces mutual exclusivity', () => {
    expect(applySidebarAction(initialSidebarPanelState, 'openInvites')).toEqual({
      isFriendsPanelOpen: false,
      isChatInvitesPanelOpen: true,
      openFolderId: null,
    });
  });
});
