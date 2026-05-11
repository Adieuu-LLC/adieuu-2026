import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '../components/Sidebar';
import { sidebarActions } from '../utils/sidebarActions';
import { SidebarLogo } from './sidebar/conversations';
import { SidebarFooterContent } from './sidebar/footer';
import { FriendsPanel } from './sidebar/friends';
import { ChatInvitationsPanel } from './sidebar/invitations';
import { SidebarTopNavContent, SidebarNavContent, type SidebarVariant } from './sidebar/nav';
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
 *
 * When variant is 'public', authenticated-only sections (friends, conversations,
 * identity/account flyouts) are omitted and a login prompt is shown instead.
 */
interface AppSidebarProps {
  onExpandedChange?: (expanded: boolean) => void;
  variant?: SidebarVariant;
}

export function AppSidebar({ onExpandedChange, variant = 'full' }: AppSidebarProps) {
  const [panelState, setPanelState] = useState(initialSidebarPanelState);
  const isPublic = variant === 'public';

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
      topNav={
        <SidebarTopNavContent
          isFriendsPanelOpen={panelState.isFriendsPanelOpen}
          onToggleFriendsPanel={handleToggleFriendsPanel}
          variant={variant}
        />
      }
      footer={<SidebarFooterContent variant={variant} />}
      panel={
        isPublic ? undefined : (
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
        )
      }
      onExpandedChange={onExpandedChange}
    >
      {!isPublic && (
        <SidebarNavContent
          isChatInvitesPanelOpen={panelState.isChatInvitesPanelOpen}
          onToggleChatInvitesPanel={handleToggleChatInvitesPanel}
        />
      )}
    </Sidebar>
  );
}
