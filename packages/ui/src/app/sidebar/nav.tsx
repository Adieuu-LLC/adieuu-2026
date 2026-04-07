import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SidebarSection, useSidebar, SidebarItem } from '../../components/Sidebar';
import { SidebarSearch } from '../../components/SidebarSearch';
import { Icon } from '../../icons/Icon';
import { FriendsSidebarButton } from './friends';
import { ConversationsSidebarSection } from './conversations';

export function SidebarNavContent({
  isFriendsPanelOpen,
  onToggleFriendsPanel,
  isChatInvitesPanelOpen,
  onToggleChatInvitesPanel,
}: {
  isFriendsPanelOpen: boolean;
  onToggleFriendsPanel: () => void;
  isChatInvitesPanelOpen: boolean;
  onToggleChatInvitesPanel: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const { closeMobile } = useSidebar();

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <div className="sidebar-search-section" data-tour="search">
        <SidebarSearch />
      </div>
      <SidebarSection label={t('sidebar.main')}>
        <Link to="/about" style={{ textDecoration: 'none' }} onClick={closeMobile}>
          <SidebarItem
            icon={<Icon name="info" />}
            label={t('nav.about')}
            isActive={isActive('/about')}
          />
        </Link>
        <FriendsSidebarButton
          isOpen={isFriendsPanelOpen}
          onToggle={onToggleFriendsPanel}
        />
      </SidebarSection>
      <ConversationsSidebarSection
        isChatInvitesPanelOpen={isChatInvitesPanelOpen}
        onToggleChatInvitesPanel={onToggleChatInvitesPanel}
      />
    </>
  );
}
