import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, Portal, Switch } from '@ark-ui/react';
import { SidebarItem, useSidebar } from '../../components/Sidebar';
import { SidebarTabs, type SidebarTab } from '../../components/SidebarTabs';
import { Popover } from '../../components/Popover';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Logo } from '../../components/Logo';
import { Icon } from '../../icons/Icon';
import { SidebarConversationDmHoverCard } from './SidebarConversationDmHoverCard';
import { GroupConversationSidebarHoverCard } from './GroupConversationSidebarHoverCard';
import { ChatConnectionBanner } from '../../components/ChatConnectionBanner';
import { useConversations, type DecryptedConversation } from '../../hooks/useConversations';
import { getSidebarListAvatarMemberIds } from '../../pages/conversations/conversationViewModel';
import { useConversationPreferences } from '../../hooks/useConversationPreferences';
import { useIdentity } from '../../hooks/useIdentity';
import { useTheme } from '../../hooks/useTheme';
import { usePlatformCapabilities } from '../../config';
import { ChatInvitationsSidebarButton } from './invitations';

// ============================================================================
// Types
// ============================================================================

type TypeFilter = 'all' | 'dm' | 'group';
type SortMode = 'recent' | 'alpha';

// ============================================================================
// Sidebar Logo
// ============================================================================

export function SidebarLogo() {
  const { t } = useTranslation();
  const { isExpanded } = useSidebar();

  return (
    <Link to="/" className="app-logo-link" aria-label={t('nav.home')}>
      <Logo size="sm" variant={isExpanded ? 'full' : 'icon'} />
    </Link>
  );
}

// ============================================================================
// Filter Popover
// ============================================================================

function ConversationFilterPopover({
  typeFilter,
  onTypeFilter,
  sortMode,
  onSortMode,
  showArchived,
  onShowArchived,
}: {
  typeFilter: TypeFilter;
  onTypeFilter: (v: TypeFilter) => void;
  sortMode: SortMode;
  onSortMode: (v: SortMode) => void;
  showArchived: boolean;
  onShowArchived: (v: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <Popover
      trigger={
        <button
          type="button"
          className="sidebar-filter-trigger"
          aria-label={t('conversations.filter.button')}
        >
          <Icon name="filter" />
        </button>
      }
      positioning={{ placement: 'bottom-start' }}
      className="sidebar-filter-popover"
    >
      <div className="sidebar-filter-popover-body">
        <div className="sidebar-filter-group">
          <div className="sidebar-filter-row">
            {(['all', 'dm', 'group'] as const).map((val) => (
              <button
                key={val}
                type="button"
                className={`sidebar-filter-chip${typeFilter === val ? ' sidebar-filter-chip--active' : ''}`}
                onClick={() => onTypeFilter(val)}
              >
                {val === 'all'
                  ? t('conversations.filter.typeAll')
                  : val === 'dm'
                    ? t('conversations.filter.typeDms')
                    : t('conversations.filter.typeGroups')}
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-filter-group">
          <div className="sidebar-filter-row">
            {(['recent', 'alpha'] as const).map((val) => (
              <button
                key={val}
                type="button"
                className={`sidebar-filter-chip${sortMode === val ? ' sidebar-filter-chip--active' : ''}`}
                onClick={() => onSortMode(val)}
              >
                {val === 'recent'
                  ? t('conversations.filter.sortRecent')
                  : t('conversations.filter.sortAlpha')}
              </button>
            ))}
          </div>
        </div>

        <Switch.Root
          checked={showArchived}
          onCheckedChange={(details) => onShowArchived(details.checked)}
          className="sidebar-filter-switch"
        >
          <Switch.Label className="sidebar-filter-switch-label">
            {t('conversations.filter.showArchived')}
          </Switch.Label>
          <Switch.Control className="sidebar-filter-switch-control">
            <Switch.Thumb className="sidebar-filter-switch-thumb" />
          </Switch.Control>
          <Switch.HiddenInput />
        </Switch.Root>
      </div>
    </Popover>
  );
}

// ============================================================================
// Conversation List Item (with context menu)
// ============================================================================

function ConversationListItem({
  conversation,
  displayName,
  isArchived,
  isFavorited,
  onLeave,
}: {
  conversation: DecryptedConversation;
  displayName: string;
  isArchived: boolean;
  isFavorited: boolean;
  onLeave: (conversationId: string) => void;
}) {
  const { t } = useTranslation();
  const { identity } = useIdentity();
  const { activeConversationId, setActiveConversation, participantProfiles } = useConversations();
  const { toggleArchive, toggleFavorite } = useConversationPreferences();
  const navigate = useNavigate();
  const { closeMobile } = useSidebar();

  const isActive = activeConversationId === conversation.id;
  const otherParticipants = conversation.participants.filter(
    (pid) => pid !== identity?.id,
  );
  const isDm = conversation.type === 'dm';
  const isGroup = conversation.type === 'group';

  const handleClick = () => {
    setActiveConversation(conversation.id);
    navigate(`/conversations/${conversation.id}`);
    closeMobile();
  };

  const handleContextAction = useCallback(
    (details: { value: string }) => {
      switch (details.value) {
        case 'archive':
          toggleArchive(conversation.id, true, false);
          break;
        case 'unarchive':
          toggleArchive(conversation.id, false);
          break;
        case 'keep-archived':
          toggleArchive(conversation.id, true, true);
          break;
        case 'favorite':
          toggleFavorite(conversation.id, true);
          break;
        case 'unfavorite':
          toggleFavorite(conversation.id, false);
          break;
        case 'leave':
          onLeave(conversation.id);
          break;
        case 'edit':
          setActiveConversation(conversation.id);
          navigate(`/conversations/${conversation.id}?showSettings=true`);
          closeMobile();
          break;
      }
    },
    [conversation.id, toggleArchive, toggleFavorite, onLeave, setActiveConversation, navigate, closeMobile],
  );

  const resolveDisplay = (pid: string) => {
    const p = participantProfiles[pid];
    return p?.displayName ?? p?.username ?? pid;
  };

  const listAvatarPids = getSidebarListAvatarMemberIds(
    isGroup,
    conversation.participants,
    identity?.id,
  );

  const singleLargeAvatar = (opts: { withDmBadge: boolean }) => (
    <div className="conversation-list-item-avatar">
      {listAvatarPids[0] && participantProfiles[listAvatarPids[0]!]?.avatarUrl ? (
        <img
          src={participantProfiles[listAvatarPids[0]!]!.avatarUrl!}
          alt=""
          className="conversation-list-item-avatar-img"
        />
      ) : (
        <span className="conversation-list-item-avatar-placeholder">
          {displayName.charAt(0).toUpperCase()}
        </span>
      )}
      {opts.withDmBadge ? <span className="conversation-list-item-dm-badge">DM</span> : null}
    </div>
  );

  const avatarEl = isDm ? (
    singleLargeAvatar({ withDmBadge: true })
  ) : listAvatarPids.length > 1 ? (
    <div className="conversation-list-item-avatar-stack">
      {listAvatarPids.map((pid) => {
        const p = participantProfiles[pid];
        const initial = resolveDisplay(pid).charAt(0).toUpperCase();
        return (
          <span key={pid} className="conversation-list-item-avatar-stack-item">
            {p?.avatarUrl ? (
              <img src={p.avatarUrl} alt="" className="conversation-list-item-avatar-stack-item-img" />
            ) : (
              <span className="conversation-list-item-avatar-stack-item-placeholder">
                {initial}
              </span>
            )}
          </span>
        );
      })}
    </div>
  ) : (
    singleLargeAvatar({ withDmBadge: false })
  );

  const itemClasses = [
    'conversation-list-item',
    isActive && 'conversation-list-item-active',
    isArchived && 'conversation-list-item--archived',
  ]
    .filter(Boolean)
    .join(' ');

  const row = (
    <button type="button" className={itemClasses} onClick={handleClick}>
      {avatarEl}
      <div className="conversation-list-item-info">
        <span className="conversation-list-item-title">{displayName}</span>
        {isGroup && (
          <span className="conversation-list-item-members">
            {conversation.participants.length} members
          </span>
        )}
      </div>
      <div className="conversation-list-item-badges">
        {isFavorited && (
          <Icon name="star" className="conversation-list-item-star" />
        )}
        {isArchived && (
          <Icon name="archive" className="conversation-list-item-archive-icon" />
        )}
        {conversation.unreadCount > 0 ? (
          <span className="conversation-list-item-badge">{conversation.unreadCount}</span>
        ) : conversation.hasUnread ? (
          <span className="conversation-list-item-unread-dot" />
        ) : null}
      </div>
    </button>
  );

  const contextMenu = (
    <Portal>
      <Menu.Positioner>
        <Menu.Content className="conversation-context-menu">
          {!isArchived ? (
            <>
              <Menu.Item value="archive" className="conversation-context-menu-item">
                <Icon name="archive" className="conversation-context-menu-item-icon" />
                {t('conversations.contextMenu.archive')}
              </Menu.Item>
              {isGroup && (
                <Menu.Item value="keep-archived" className="conversation-context-menu-item">
                  <Icon name="archive" className="conversation-context-menu-item-icon" />
                  {t('conversations.contextMenu.keepArchived')}
                </Menu.Item>
              )}
            </>
          ) : (
            <Menu.Item value="unarchive" className="conversation-context-menu-item">
              <Icon name="archive" className="conversation-context-menu-item-icon" />
              {t('conversations.contextMenu.unarchive')}
            </Menu.Item>
          )}

          {!isFavorited ? (
            <Menu.Item value="favorite" className="conversation-context-menu-item">
              <Icon name="star" className="conversation-context-menu-item-icon" />
              {t('conversations.contextMenu.addFavorite')}
            </Menu.Item>
          ) : (
            <Menu.Item value="unfavorite" className="conversation-context-menu-item">
              <Icon name="star" className="conversation-context-menu-item-icon" />
              {t('conversations.contextMenu.removeFavorite')}
            </Menu.Item>
          )}

          {isGroup && (
            <Menu.Item value="leave" className="conversation-context-menu-item conversation-context-menu-item--danger">
              <Icon name="logout" className="conversation-context-menu-item-icon" />
              {t('conversations.leave')}
            </Menu.Item>
          )}

          <Menu.Item value="edit" className="conversation-context-menu-item">
            <Icon name="settings" className="conversation-context-menu-item-icon" />
            {t('conversations.contextMenu.editConversation')}
          </Menu.Item>
        </Menu.Content>
      </Menu.Positioner>
    </Portal>
  );

  if (isDm && otherParticipants.length === 1) {
    return (
      <Menu.Root onSelect={handleContextAction}>
        <Menu.ContextTrigger asChild>
          <div className="conversation-list-item-context-anchor">
            <SidebarConversationDmHoverCard conversation={conversation} otherUserId={otherParticipants[0]!}>
              {row}
            </SidebarConversationDmHoverCard>
          </div>
        </Menu.ContextTrigger>
        {contextMenu}
      </Menu.Root>
    );
  }

  if (isGroup) {
    return (
      <Menu.Root onSelect={handleContextAction}>
        <Menu.ContextTrigger asChild>
          <div className="conversation-list-item-context-anchor">
            <GroupConversationSidebarHoverCard conversation={conversation} displayName={displayName}>
              {row}
            </GroupConversationSidebarHoverCard>
          </div>
        </Menu.ContextTrigger>
        {contextMenu}
      </Menu.Root>
    );
  }

  return (
    <Menu.Root onSelect={handleContextAction}>
      <Menu.ContextTrigger asChild>{row}</Menu.ContextTrigger>
      {contextMenu}
    </Menu.Root>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function resolveConversationDisplayName(
  conversation: DecryptedConversation,
  selfId: string | undefined,
  profiles: Record<string, { displayName?: string; username?: string }>,
): string {
  if (conversation.type === 'group') {
    return conversation.decryptedName ?? 'Group';
  }
  if (conversation.decryptedName?.trim()) {
    return conversation.decryptedName.trim();
  }
  const others = conversation.participants.filter((p) => p !== selfId);
  return others
    .map((pid) => {
      const p = profiles[pid];
      return p?.displayName ?? p?.username ?? pid;
    })
    .join(', ');
}

// ============================================================================
// Main Section
// ============================================================================

export function ConversationsSidebarSection({
  isChatInvitesPanelOpen,
  onToggleChatInvitesPanel,
}: {
  isChatInvitesPanelOpen: boolean;
  onToggleChatInvitesPanel: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversations, loading, leaveGroup, participantProfiles } = useConversations();
  const { preferences } = useConversationPreferences();
  const { identity } = useIdentity();
  const { closeMobile } = useSidebar();
  const [activeTab, setActiveTab] = useState('conversations');

  // Filter state
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showArchived, setShowArchived] = useState(false);

  // Leave dialog state
  const [leaveTargetId, setLeaveTargetId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const isFiltered = typeFilter !== 'all' || sortMode !== 'recent' || showArchived;

  const totalUnread = conversations.reduce(
    (sum, c) => sum + (c.hasUnread ? 1 : 0) + c.unreadCount,
    0,
  );

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

  const handleLeaveRequest = useCallback((conversationId: string) => {
    setLeaveTargetId(conversationId);
  }, []);

  const handleLeaveConfirm = useCallback(async () => {
    if (!leaveTargetId) return;
    setLeaving(true);
    try {
      await leaveGroup(leaveTargetId);
    } finally {
      setLeaving(false);
      setLeaveTargetId(null);
    }
  }, [leaveTargetId, leaveGroup]);

  const leaveTargetConversation = leaveTargetId
    ? conversations.find((c) => c.id === leaveTargetId)
    : undefined;
  const isSoleMember =
    leaveTargetConversation?.participants.length === 1;

  // Derive filtered + sorted conversation lists
  const { favoritesList, mainList } = useMemo(() => {
    const withNames = conversations.map((c) => ({
      conversation: c,
      displayName: resolveConversationDisplayName(
        c,
        identity?.id,
        participantProfiles,
      ),
      pref: preferences[c.id],
    }));

    // Apply type filter
    let filtered = withNames;
    if (typeFilter === 'dm') {
      filtered = filtered.filter((x) => x.conversation.type === 'dm');
    } else if (typeFilter === 'group') {
      filtered = filtered.filter((x) => x.conversation.type === 'group');
    }

    // Apply archive filter
    if (!showArchived) {
      filtered = filtered.filter((x) => !x.pref?.archived);
    }

    // Sort
    if (sortMode === 'alpha') {
      filtered.sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: 'base',
        }),
      );
    }
    // 'recent' preserves the server ordering (already by lastMessageAt desc)

    // Split favorites from the rest (only when no active filters)
    if (!isFiltered) {
      const favs = filtered.filter((x) => x.pref?.favorited);
      const rest = filtered.filter((x) => !x.pref?.favorited);
      return { favoritesList: favs, mainList: rest };
    }

    return { favoritesList: [], mainList: filtered };
  }, [
    conversations,
    identity?.id,
    participantProfiles,
    preferences,
    typeFilter,
    sortMode,
    showArchived,
    isFiltered,
  ]);

  const renderItem = (item: (typeof mainList)[number]) => (
    <ConversationListItem
      key={item.conversation.id}
      conversation={item.conversation}
      displayName={item.displayName}
      isArchived={!!item.pref?.archived}
      isFavorited={!!item.pref?.favorited}
      onLeave={handleLeaveRequest}
    />
  );

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

            <div className="sidebar-conversations-actions">
              <ConversationFilterPopover
                typeFilter={typeFilter}
                onTypeFilter={setTypeFilter}
                sortMode={sortMode}
                onSortMode={setSortMode}
                showArchived={showArchived}
                onShowArchived={setShowArchived}
              />
              <SidebarItem
                icon={<Icon name="plus" />}
                label={t('sidebar.newConversation', 'New')}
                onClick={handleNewConversation}
              />
              
            </div>

            {loading && conversations.length === 0 && (
              <div className="sidebar-conversations-loading">
                <span className="spinner spinner-sm" />
              </div>
            )}

            <div className="sidebar-conversations-list">
              {favoritesList.length > 0 && (
                <>
                  {/* <div className="sidebar-conversations-section-header">
                    <Icon name="star" className="sidebar-conversations-section-icon" />
                    <span>{t('conversations.favorites.section')}</span>
                  </div> */}
                  {favoritesList.map(renderItem)}
                </>
              )}

              {mainList.map(renderItem)}

              {!loading &&
                favoritesList.length === 0 &&
                mainList.length === 0 && (
                  <div className="sidebar-conversations-empty">
                    {t('sidebar.noConversations', 'No conversations yet')}
                  </div>
                )}
            </div>

            <ConfirmDialog
              open={!!leaveTargetId}
              onOpenChange={(open) => {
                if (!open) setLeaveTargetId(null);
              }}
              title={t('conversations.leaveGroup.title', 'Leave group?')}
              description={
                isSoleMember
                  ? t(
                      'conversations.leaveGroup.lastMember',
                      'You are the last member. The group and all messages will be permanently deleted.',
                    )
                  : t(
                      'conversations.leaveGroup.confirm',
                      "You won't be able to rejoin without a new invite.",
                    )
              }
              confirmLabel={t('conversations.leaveGroup.confirmBtn', 'Leave')}
              variant={isSoleMember ? 'danger' : 'warning'}
              loading={leaving}
              onConfirm={handleLeaveConfirm}
            />
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
