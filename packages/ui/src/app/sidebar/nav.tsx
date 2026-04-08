import { SidebarSection } from '../../components/Sidebar';
import { SidebarSearch } from '../../components/SidebarSearch';
import { AboutFlyout } from './about';
import { FriendsSidebarButton } from './friends';
import { ConversationsSidebarSection } from './conversations';

export function SidebarTopNavContent({
  isFriendsPanelOpen,
  onToggleFriendsPanel,
}: {
  isFriendsPanelOpen: boolean;
  onToggleFriendsPanel: () => void;
}) {
  return (
    <>
      <div className="sidebar-search-section" data-tour="search">
        <SidebarSearch />
      </div>
      <SidebarSection>
        <AboutFlyout />
        <FriendsSidebarButton
          isOpen={isFriendsPanelOpen}
          onToggle={onToggleFriendsPanel}
        />
      </SidebarSection>
    </>
  );
}

export function SidebarNavContent({
  isChatInvitesPanelOpen,
  onToggleChatInvitesPanel,
}: {
  isChatInvitesPanelOpen: boolean;
  onToggleChatInvitesPanel: () => void;
}) {
  return (
    <ConversationsSidebarSection
      isChatInvitesPanelOpen={isChatInvitesPanelOpen}
      onToggleChatInvitesPanel={onToggleChatInvitesPanel}
    />
  );
}
