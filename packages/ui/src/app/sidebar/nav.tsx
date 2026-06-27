import { useTranslation } from 'react-i18next';
import { SidebarSection } from '../../components/Sidebar';
import { SidebarSearch } from '../../components/SidebarSearch';
import { AboutFlyout, RoadmapSidebarLink } from './about';
import { FriendsSidebarButton } from './friends';
import { ConversationsSidebarSection } from './conversations';

export type SidebarVariant = 'full' | 'public';

export function SidebarTopNavContent({
  isFriendsPanelOpen,
  onToggleFriendsPanel,
  variant = 'full',
}: {
  isFriendsPanelOpen: boolean;
  onToggleFriendsPanel: () => void;
  variant?: SidebarVariant;
}) {
  const { t } = useTranslation();
  const isPublic = variant === 'public';

  return (
    <>
      <div className="sidebar-search-section" data-tour="search">
        <SidebarSearch
          placeholderOverride={isPublic ? t('search.publicPlaceholder') : undefined}
          showSocialActions={!isPublic}
        />
      </div>
      <SidebarSection>
        <AboutFlyout />
        <RoadmapSidebarLink />
        {!isPublic && (
          <FriendsSidebarButton
            isOpen={isFriendsPanelOpen}
            onToggle={onToggleFriendsPanel}
          />
        )}
      </SidebarSection>
    </>
  );
}

export function SidebarNavContent({
  isChatInvitesPanelOpen,
  onToggleChatInvitesPanel,
  onOpenFolder,
}: {
  isChatInvitesPanelOpen: boolean;
  onToggleChatInvitesPanel: () => void;
  onOpenFolder?: (folderId: string) => void;
}) {
  return (
    <ConversationsSidebarSection
      isChatInvitesPanelOpen={isChatInvitesPanelOpen}
      onToggleChatInvitesPanel={onToggleChatInvitesPanel}
      onOpenFolder={onOpenFolder}
    />
  );
}
