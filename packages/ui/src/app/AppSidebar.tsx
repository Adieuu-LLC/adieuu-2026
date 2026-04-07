import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { sidebarActions } from '../utils/sidebarActions';
import { SidebarLogo } from './sidebar/conversations';
import { SidebarFooterContent } from './sidebar/footer';
import { FriendsPanel } from './sidebar/friends';
import { ChatInvitationsPanel } from './sidebar/invitations';
import { SidebarNavContent } from './sidebar/nav';
import {
  applySidebarAction,
  closeChatInvitesPanel,
  closeFriendsPanel,
  initialSidebarPanelState,
  toggleChatInvitesPanel,
  toggleFriendsPanel,
} from './sidebar/sidebarPanelState';

/**
 * Main application sidebar with navigation links.
 * Shared across all platforms (web, desktop, mobile).
 */
interface AppSidebarProps {
  onExpandedChange?: (expanded: boolean) => void;
}

export function AppSidebar({ onExpandedChange }: AppSidebarProps) {
  const [panelState, setPanelState] = useState(initialSidebarPanelState);

  const handleToggleFriendsPanel = useCallback(() => {
    setPanelState(toggleFriendsPanel);
  }, []);

  const handleCloseFriendsPanel = useCallback(() => {
    setPanelState(closeFriendsPanel);
  }, []);

  const handleToggleChatInvitesPanel = useCallback(() => {
    setPanelState(toggleChatInvitesPanel);
  }, []);

  const handleCloseChatInvitesPanel = useCallback(() => {
    setPanelState(closeChatInvitesPanel);
  }, []);

  useEffect(() => {
    return sidebarActions.subscribe((action) => {
      setPanelState((prevState) => applySidebarAction(prevState, action));
    });
  }, []);

  return (
    <Sidebar
      header={<SidebarLogo />}
      footer={<SidebarFooterContent />}
      panel={
        <>
          <FriendsPanel
            isOpen={panelState.isFriendsPanelOpen}
            onClose={handleCloseFriendsPanel}
          />
          <ChatInvitationsPanel
            isOpen={panelState.isChatInvitesPanelOpen}
            onClose={handleCloseChatInvitesPanel}
          />
        </>
      }
      onExpandedChange={onExpandedChange}
    >
      <SidebarNavContent
        isFriendsPanelOpen={panelState.isFriendsPanelOpen}
        onToggleFriendsPanel={handleToggleFriendsPanel}
        isChatInvitesPanelOpen={panelState.isChatInvitesPanelOpen}
        onToggleChatInvitesPanel={handleToggleChatInvitesPanel}
      />
    </Sidebar>
  );
}
