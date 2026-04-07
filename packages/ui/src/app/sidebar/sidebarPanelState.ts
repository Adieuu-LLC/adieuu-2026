import type { SidebarAction } from '../../utils/sidebarActions';

export interface SidebarPanelState {
  isFriendsPanelOpen: boolean;
  isChatInvitesPanelOpen: boolean;
}

export const initialSidebarPanelState: SidebarPanelState = {
  isFriendsPanelOpen: false,
  isChatInvitesPanelOpen: false,
};

export function toggleFriendsPanel(state: SidebarPanelState): SidebarPanelState {
  const isOpeningFriends = !state.isFriendsPanelOpen;

  return {
    isFriendsPanelOpen: isOpeningFriends,
    isChatInvitesPanelOpen: isOpeningFriends ? false : state.isChatInvitesPanelOpen,
  };
}

export function closeFriendsPanel(state: SidebarPanelState): SidebarPanelState {
  return {
    ...state,
    isFriendsPanelOpen: false,
  };
}

export function toggleChatInvitesPanel(state: SidebarPanelState): SidebarPanelState {
  const isOpeningInvites = !state.isChatInvitesPanelOpen;

  return {
    isFriendsPanelOpen: isOpeningInvites ? false : state.isFriendsPanelOpen,
    isChatInvitesPanelOpen: isOpeningInvites,
  };
}

export function closeChatInvitesPanel(state: SidebarPanelState): SidebarPanelState {
  return {
    ...state,
    isChatInvitesPanelOpen: false,
  };
}

export function applySidebarAction(state: SidebarPanelState, action: SidebarAction): SidebarPanelState {
  if (action === 'openFriends') {
    return {
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: false,
    };
  }

  return {
    isFriendsPanelOpen: false,
    isChatInvitesPanelOpen: true,
  };
}
