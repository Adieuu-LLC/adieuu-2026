import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Sidebar } from '../components/Sidebar';
import { sidebarActions } from '../utils/sidebarActions';
import { SidebarLogo } from './sidebar/conversations';
import { SidebarFooterContent } from './sidebar/footer';
import { FriendsPanel } from './sidebar/friends';
import { FolderPanel } from './sidebar/folderPanel';
import { ChatInvitationsPanel } from './sidebar/invitations';
import { SidebarTopNavContent, SidebarNavContent, type SidebarVariant } from './sidebar/nav';
import { useConversationFolders } from '../hooks/useConversationFolders';
import { SidebarListViewProvider } from './sidebar/sidebarListView';
import {
  applySidebarAction,
  closeChatInvitesPanel,
  closeFolderPanel,
  closeFriendsPanel,
  initialSidebarPanelState,
  openFolderPanel,
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

  const handleOpenFolder = useCallback((folderId: string) => {
    setPanelState((s) => openFolderPanel(s, folderId));
  }, []);

  const handleCloseFolder = useCallback(() => {
    setPanelState(closeFolderPanel);
  }, []);

  useEffect(() => {
    return sidebarActions.subscribe((action) => {
      setPanelState((prevState) => applySidebarAction(prevState, action));
    });
  }, []);

  const authenticatedChrome = (children: ReactNode) =>
    isPublic ? children : (
      <SidebarListViewProvider>{children}</SidebarListViewProvider>
    );

  return authenticatedChrome(
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
            <FolderPanelConnector
              openFolderId={panelState.openFolderId}
              onClose={handleCloseFolder}
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
          onOpenFolder={handleOpenFolder}
        />
      )}
    </Sidebar>,
  );
}

/**
 * Resolves the folder object from the openFolderId and renders FolderPanel.
 * Separated to avoid calling useConversationFolders in the public variant.
 */
function FolderPanelConnector({
  openFolderId,
  onClose,
}: {
  openFolderId: string | null;
  onClose: () => void;
}) {
  const { folders } = useConversationFolders();
  const folder = useMemo(
    () => (openFolderId ? folders.find((f) => f.id === openFolderId) ?? null : null),
    [openFolderId, folders],
  );

  return (
    <FolderPanel
      isOpen={!!openFolderId}
      folder={folder}
      onClose={onClose}
    />
  );
}
