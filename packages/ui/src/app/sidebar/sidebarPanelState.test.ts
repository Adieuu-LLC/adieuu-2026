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
    };

    expect(toggleFriendsPanel(state)).toEqual({
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: false,
    });
  });

  test('toggleFriendsPanel closes friends and preserves invites state', () => {
    const state: SidebarPanelState = {
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: false,
    };

    expect(toggleFriendsPanel(state)).toEqual({
      isFriendsPanelOpen: false,
      isChatInvitesPanelOpen: false,
    });
  });

  test('toggleChatInvitesPanel opens invites and closes friends', () => {
    const state: SidebarPanelState = {
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: false,
    };

    expect(toggleChatInvitesPanel(state)).toEqual({
      isFriendsPanelOpen: false,
      isChatInvitesPanelOpen: true,
    });
  });

  test('toggleChatInvitesPanel closes invites and preserves friends state', () => {
    const state: SidebarPanelState = {
      isFriendsPanelOpen: false,
      isChatInvitesPanelOpen: true,
    };

    expect(toggleChatInvitesPanel(state)).toEqual({
      isFriendsPanelOpen: false,
      isChatInvitesPanelOpen: false,
    });
  });

  test('close helpers only close their respective panel', () => {
    const state: SidebarPanelState = {
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: true,
    };

    expect(closeFriendsPanel(state)).toEqual({
      isFriendsPanelOpen: false,
      isChatInvitesPanelOpen: true,
    });

    expect(closeChatInvitesPanel(state)).toEqual({
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: false,
    });
  });

  test('applySidebarAction(openFriends) enforces mutual exclusivity', () => {
    expect(applySidebarAction(initialSidebarPanelState, 'openFriends')).toEqual({
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: false,
    });
  });

  test('applySidebarAction(openInvites) enforces mutual exclusivity', () => {
    expect(applySidebarAction(initialSidebarPanelState, 'openInvites')).toEqual({
      isFriendsPanelOpen: false,
      isChatInvitesPanelOpen: true,
    });
  });
});
