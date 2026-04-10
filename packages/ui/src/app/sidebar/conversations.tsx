import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SidebarItem, useSidebar } from '../../components/Sidebar';
import { SidebarTabs, type SidebarTab } from '../../components/SidebarTabs';
import { Logo } from '../../components/Logo';
import { Icon } from '../../icons/Icon';
import { IdentityHoverCard } from '../../components/IdentityHoverCard';
import { ChatConnectionBanner } from '../../components/ChatConnectionBanner';
import { useConversations, type DecryptedConversation } from '../../hooks/useConversations';
import { useIdentity } from '../../hooks/useIdentity';
import { useTheme } from '../../hooks/useTheme';
import { usePlatformCapabilities } from '../../config';
import { ChatInvitationsSidebarButton } from './invitations';

export function SidebarLogo() {
  const { t } = useTranslation();
  const { isExpanded } = useSidebar();

  return (
    <Link to="/" className="app-logo-link" aria-label={t('nav.home')}>
      <Logo size="sm" variant={isExpanded ? 'full' : 'icon'} />
    </Link>
  );
}

function ConversationListItem({ conversation }: { conversation: DecryptedConversation }) {
  const { identity } = useIdentity();
  const { activeConversationId, setActiveConversation, participantProfiles } = useConversations();
  const navigate = useNavigate();
  const { closeMobile } = useSidebar();

  const isActive = activeConversationId === conversation.id;
  const otherParticipants = conversation.participants.filter((participantId) => participantId !== identity?.id);

  const resolveDisplayName = (participantId: string) => {
    const profile = participantProfiles[participantId];
    return profile?.displayName ?? profile?.username ?? participantId;
  };

  const displayName = conversation.type === 'group'
    ? (conversation.decryptedName ?? 'Group')
    : otherParticipants.map(resolveDisplayName).join(', ');

  const handleClick = () => {
    setActiveConversation(conversation.id);
    navigate(`/conversations/${conversation.id}`);
    closeMobile();
  };

  const avatarMembers = otherParticipants.slice(0, 3);
  const isDm = conversation.type === 'dm';
  const dmProfile = isDm && otherParticipants.length === 1
    ? participantProfiles[otherParticipants[0]!]
    : undefined;

  const avatarEl = isDm ? (
    <div className="conversation-list-item-avatar">
      <span className="conversation-list-item-avatar-placeholder">
        {displayName.charAt(0).toUpperCase()}
      </span>
      <span className="conversation-list-item-dm-badge">DM</span>
    </div>
  ) : avatarMembers.length > 1 ? (
    <div className="conversation-list-item-avatar-stack">
      {avatarMembers.map((participantId) => (
        <span key={participantId} className="conversation-list-item-avatar-stack-item">
          {resolveDisplayName(participantId).charAt(0).toUpperCase()}
        </span>
      ))}
    </div>
  ) : (
    <div className="conversation-list-item-avatar">
      <span className="conversation-list-item-avatar-placeholder">
        {displayName.charAt(0).toUpperCase()}
      </span>
    </div>
  );

  const row = (
    <button
      type="button"
      className={`conversation-list-item${isActive ? ' conversation-list-item-active' : ''}`}
      onClick={handleClick}
    >
      {avatarEl}
      <div className="conversation-list-item-info">
        <span className="conversation-list-item-title">{displayName}</span>
        {conversation.type === 'group' && (
          <span className="conversation-list-item-members">
            {conversation.participants.length} members
          </span>
        )}
      </div>
      {conversation.unreadCount > 0 && (
        <span className="conversation-list-item-badge">{conversation.unreadCount}</span>
      )}
    </button>
  );

  if (dmProfile) {
    return (
      <IdentityHoverCard
        identity={dmProfile}
        positioning={{ placement: 'right-start', gutter: 12 }}
      >
        {row}
      </IdentityHoverCard>
    );
  }

  return row;
}

export function ConversationsSidebarSection({
  isChatInvitesPanelOpen,
  onToggleChatInvitesPanel,
}: {
  isChatInvitesPanelOpen: boolean;
  onToggleChatInvitesPanel: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversations, loading } = useConversations();
  const { closeMobile } = useSidebar();
  const [activeTab, setActiveTab] = useState('conversations');

  const totalUnread = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);

  const { appWindow } = usePlatformCapabilities();
  const { activeTheme } = useTheme();
  const accentHex = activeTheme?.colors.accentPrimary;

  useEffect(() => {
    appWindow?.setBadgeCount(totalUnread, accentHex);
  }, [totalUnread, appWindow, accentHex]);

  const tabs: SidebarTab[] = [
    {
      id: 'conversations',
      icon: <Icon name="message" />,
      label: t('sidebar.conversationsTab', 'Conversations'),
      badge: totalUnread > 0 ? totalUnread : undefined,
    },
    {
      id: 'spaces',
      icon: <Icon name="spaces" />,
      label: t('sidebar.spacesTab', 'Spaces'),
    },
  ];

  const handleNewConversation = () => {
    navigate('/conversations/new');
    closeMobile();
  };

  return (
    <div className="sidebar-tabs-section">
      <SidebarTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <ChatConnectionBanner />

      <div className="sidebar-tab-content">
        {activeTab === 'conversations' && (
          <>
            <ChatInvitationsSidebarButton
              isOpen={isChatInvitesPanelOpen}
              onToggle={onToggleChatInvitesPanel}
            />
            <SidebarItem
              icon={<Icon name="plus" />}
              label={t('sidebar.newConversation', 'New Conversation')}
              onClick={handleNewConversation}
            />

            {loading && conversations.length === 0 && (
              <div className="sidebar-conversations-loading">
                <span className="spinner spinner-sm" />
              </div>
            )}

            <div className="sidebar-conversations-list">
              {conversations.map((conversation) => (
                <ConversationListItem key={conversation.id} conversation={conversation} />
              ))}

              {!loading && conversations.length === 0 && (
                <div className="sidebar-conversations-empty">
                  {t('sidebar.noConversations', 'No conversations yet')}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'spaces' && (
          <div className="sidebar-conversations-empty">
            {t('sidebar.spacesComingSoon', 'Spaces coming soon')}
          </div>
        )}
      </div>
    </div>
  );
}
