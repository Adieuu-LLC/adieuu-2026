import type { SidebarAction } from '../../utils/sidebarActions';

export interface SidebarPanelState {
  isFriendsPanelOpen: boolean;
  isChatInvitesPanelOpen: boolean;
  /** When set, the folder panel for this folder ID is open. */
  openFolderId: string | null;
}

export const initialSidebarPanelState: SidebarPanelState = {
  isFriendsPanelOpen: false,
  isChatInvitesPanelOpen: false,
  openFolderId: null,
};

export function toggleFriendsPanel(state: SidebarPanelState): SidebarPanelState {
  const isOpeningFriends = !state.isFriendsPanelOpen;

  return {
    isFriendsPanelOpen: isOpeningFriends,
    isChatInvitesPanelOpen: isOpeningFriends ? false : state.isChatInvitesPanelOpen,
    openFolderId: isOpeningFriends ? null : state.openFolderId,
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
    openFolderId: isOpeningInvites ? null : state.openFolderId,
  };
}

export function closeChatInvitesPanel(state: SidebarPanelState): SidebarPanelState {
  return {
    ...state,
    isChatInvitesPanelOpen: false,
  };
}

export function openFolderPanel(state: SidebarPanelState, folderId: string): SidebarPanelState {
  return {
    isFriendsPanelOpen: false,
    isChatInvitesPanelOpen: false,
    openFolderId: folderId,
  };
}

export function closeFolderPanel(state: SidebarPanelState): SidebarPanelState {
  return {
    ...state,
    openFolderId: null,
  };
}

export function applySidebarAction(state: SidebarPanelState, action: SidebarAction): SidebarPanelState {
  if (action === 'openFriends') {
    return {
      isFriendsPanelOpen: true,
      isChatInvitesPanelOpen: false,
      openFolderId: null,
    };
  }

  return {
    isFriendsPanelOpen: false,
    isChatInvitesPanelOpen: true,
    openFolderId: null,
  };
}
