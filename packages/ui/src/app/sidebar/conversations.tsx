import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import type { PublicIdentity, ConversationFolder } from '@adieuu/shared';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, Portal, Switch } from '@ark-ui/react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SidebarItem, useSidebar } from '../../components/Sidebar';
import { SidebarTabs, type SidebarTab } from '../../components/SidebarTabs';
import { Popover } from '../../components/Popover';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FolderEditModal } from '../../components/FolderEditModal';
import { Logo } from '../../components/Logo';
import { Icon } from '../../icons/Icon';
import type { AppIconName } from '../../icons/appIcons';
import { SidebarConversationDmHoverCard } from './SidebarConversationDmHoverCard';
import { GroupConversationSidebarHoverCard } from './GroupConversationSidebarHoverCard';
import { ChatConnectionBanner } from '../../components/ChatConnectionBanner';
import { useConversations, type DecryptedConversation } from '../../hooks/useConversations';
import { getSidebarListAvatarMemberIds } from '../../pages/conversations/conversationViewModel';
import { useConversationPreferences } from '../../hooks/useConversationPreferences';
import { useConversationFolders } from '../../hooks/useConversationFolders';
import { useIdentity } from '../../hooks/useIdentity';
import { useGlobalCallEvents } from '../../hooks/useGlobalCallEvents';
import { useCallSession } from '../../hooks/useCallSession';
import { useTheme } from '../../hooks/useTheme';
import { usePlatformCapabilities } from '../../config';
import { ChatInvitationsSidebarButton } from './invitations';
import { SpacesSidebarSection } from './spaces';
import { useSpaces } from '../../hooks/useSpaces';
import type { FolderIconName, FolderIconType } from '@adieuu/shared';

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

interface ConversationListItemProps {
  conversation: DecryptedConversation;
  displayName: string;
  isActive: boolean;
  isArchived: boolean;
  isFavorited: boolean;
  hasActiveCall: boolean;
  isUserInCall: boolean;
  selfId: string | undefined;
  participantProfiles: Record<string, PublicIdentity>;
  onSelect: (conversationId: string) => void;
  onEdit: (conversationId: string) => void;
  onArchive: (conversationId: string, archived: boolean, keepArchived?: boolean) => void;
  onFavorite: (conversationId: string, favorited: boolean) => void;
  onLeave: (conversationId: string) => void;
}

/**
 * Compares only the fields the row actually renders. This lets a single
 * conversation update (e.g. an unread bump from a websocket message) re-render
 * just the affected row instead of every row in the sidebar list. The action
 * callbacks are stabilized by the parent, so identity comparison is enough.
 */
function conversationRowPropsEqual(
  prev: ConversationListItemProps,
  next: ConversationListItemProps,
): boolean {
  if (
    prev.displayName !== next.displayName ||
    prev.isActive !== next.isActive ||
    prev.isArchived !== next.isArchived ||
    prev.isFavorited !== next.isFavorited ||
    prev.hasActiveCall !== next.hasActiveCall ||
    prev.isUserInCall !== next.isUserInCall ||
    prev.selfId !== next.selfId ||
    prev.participantProfiles !== next.participantProfiles ||
    prev.onSelect !== next.onSelect ||
    prev.onEdit !== next.onEdit ||
    prev.onArchive !== next.onArchive ||
    prev.onFavorite !== next.onFavorite ||
    prev.onLeave !== next.onLeave
  ) {
    return false;
  }
  const a = prev.conversation;
  const b = next.conversation;
  if (a === b) return true;
  if (
    a.id !== b.id ||
    a.type !== b.type ||
    a.unreadCount !== b.unreadCount ||
    a.hasUnread !== b.hasUnread ||
    a.decryptedName !== b.decryptedName ||
    a.participants.length !== b.participants.length
  ) {
    return false;
  }
  for (let i = 0; i < a.participants.length; i++) {
    if (a.participants[i] !== b.participants[i]) return false;
  }
  return true;
}

const ConversationListItem = memo(function ConversationListItem({
  conversation,
  displayName,
  isActive,
  isArchived,
  isFavorited,
  hasActiveCall,
  isUserInCall,
  selfId,
  participantProfiles,
  onSelect,
  onEdit,
  onArchive,
  onFavorite,
  onLeave,
}: ConversationListItemProps) {
  const { t } = useTranslation();

  const otherParticipants = conversation.participants.filter(
    (pid) => pid !== selfId,
  );
  const isDm = conversation.type === 'dm';
  const isGroup = conversation.type === 'group';

  const handleClick = () => {
    onSelect(conversation.id);
  };

  const handleContextAction = useCallback(
    (details: { value: string }) => {
      switch (details.value) {
        case 'archive':
          onArchive(conversation.id, true, false);
          break;
        case 'unarchive':
          onArchive(conversation.id, false);
          break;
        case 'keep-archived':
          onArchive(conversation.id, true, true);
          break;
        case 'favorite':
          onFavorite(conversation.id, true);
          break;
        case 'unfavorite':
          onFavorite(conversation.id, false);
          break;
        case 'leave':
          onLeave(conversation.id);
          break;
        case 'edit':
          onEdit(conversation.id);
          break;
      }
    },
    [conversation.id, onArchive, onFavorite, onLeave, onEdit],
  );

  const resolveDisplay = (pid: string) => {
    const p = participantProfiles[pid];
    return p?.displayName ?? p?.username ?? pid;
  };

  const listAvatarPids = getSidebarListAvatarMemberIds(
    isGroup,
    conversation.participants,
    selfId,
  );

  const singleLargeAvatar = (opts: { withDmBadge: boolean }) => (
    <div className="conversation-list-item-avatar">
      {listAvatarPids[0] && participantProfiles[listAvatarPids[0]]?.avatarUrl ? (
        <img
          src={participantProfiles[listAvatarPids[0]]?.avatarUrl as string}
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
            {t('conversations.invites.memberCount', { count: conversation.participants.length })}
          </span>
        )}
      </div>
      <div className="conversation-list-item-badges">
        {hasActiveCall && (
          <Icon
            name="phone"
            className={`conversation-list-item-call-icon${isUserInCall ? ' conversation-list-item-call-icon--joined' : ''}`}
            aria-hidden
          />
        )}
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
            <SidebarConversationDmHoverCard conversation={conversation} otherUserId={otherParticipants[0]!} hasActiveCall={hasActiveCall}>
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
            <GroupConversationSidebarHoverCard conversation={conversation} displayName={displayName} hasActiveCall={hasActiveCall}>
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
}, conversationRowPropsEqual);

// ============================================================================
// Draggable Conversation Wrapper
// ============================================================================

function DraggableConversation({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={isDragging ? 'conversation-dragging' : undefined}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Droppable Conversation Wrapper
// ============================================================================

function DroppableTarget({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={isOver ? 'conversation-drop-over' : undefined}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Folder List Item (with context menu)
// ============================================================================

const FOLDER_ICON_MAP: Record<string, AppIconName> = {
  'folder': 'folder',
  'folders': 'folders',
  'layer-group': 'layerGroup',
  'ball-pile': 'ballPile',
  'building': 'building',
  'family': 'family',
  'sportsball': 'sportsball',
  'dice': 'dice',
  'dice-d10': 'diceD10',
  'dice-d12': 'diceD12',
  'game-board': 'gameboard',
  'game-console-handheld': 'gameConsoleHandheld',
};

function FolderListItem({
  folder,
  conversations,
  participantProfiles,
  selfId,
  onOpen,
  onRename,
  onDelete,
  onToggleFavorite,
}: {
  folder: ConversationFolder;
  conversations: DecryptedConversation[];
  participantProfiles: Record<string, PublicIdentity>;
  selfId: string | undefined;
  onOpen: (folderId: string) => void;
  onRename: (folderId: string) => void;
  onDelete: (folderId: string) => void;
  onToggleFavorite: (folderId: string, favorited: boolean) => void;
}) {
  const { t } = useTranslation();

  const folderConversations = folder.conversationIds
    .map((cid) => conversations.find((c) => c.id === cid))
    .filter(Boolean) as DecryptedConversation[];

  const dmCount = folderConversations.filter((c) => c.type === 'dm').length;
  const groupCount = folderConversations.filter((c) => c.type === 'group').length;

  const hasUnread = folderConversations.some(
    (c) => c.unreadCount > 0 || c.hasUnread,
  );

  const handleContextAction = useCallback(
    (details: { value: string }) => {
      switch (details.value) {
        case 'rename':
          onRename(folder.id);
          break;
        case 'remove':
          onDelete(folder.id);
          break;
        case 'favorite':
          onToggleFavorite(folder.id, true);
          break;
        case 'unfavorite':
          onToggleFavorite(folder.id, false);
          break;
      }
    },
    [folder.id, onRename, onDelete, onToggleFavorite],
  );

  const resolveDisplay = (pid: string) => {
    const p = participantProfiles[pid];
    return p?.displayName ?? p?.username ?? pid;
  };

  // Build avatar element
  let avatarEl: React.ReactNode;
  if (folder.iconType === 'icon' && folder.iconName && FOLDER_ICON_MAP[folder.iconName]) {
    avatarEl = (
      <div
        className="conversation-list-item-avatar folder-list-item-icon"
        style={folder.iconColor ? { color: folder.iconColor } : undefined}
      >
        <Icon name={FOLDER_ICON_MAP[folder.iconName]!} />
      </div>
    );
  } else {
    // Dynamic: show up to 3 overlapping conversation avatars
    const avatarPids: string[] = [];
    for (const conv of folderConversations) {
      const pids = getSidebarListAvatarMemberIds(
        conv.type === 'group',
        conv.participants,
        selfId,
      );
      for (const pid of pids) {
        if (!avatarPids.includes(pid)) avatarPids.push(pid);
        if (avatarPids.length >= 3) break;
      }
      if (avatarPids.length >= 3) break;
    }

    if (avatarPids.length > 1) {
      avatarEl = (
        <div className="conversation-list-item-avatar-stack">
          {avatarPids.map((pid) => {
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
      );
    } else {
      avatarEl = (
        <div className="conversation-list-item-avatar">
          <span className="conversation-list-item-avatar-placeholder">
            <Icon name="folder" />
          </span>
        </div>
      );
    }
  }

  const row = (
    <button
      type="button"
      className="conversation-list-item folder-list-item"
      onClick={() => onOpen(folder.id)}
    >
      {avatarEl}
      <div className="conversation-list-item-info">
        <span className="conversation-list-item-title">{folder.name}</span>
        <span className="conversation-list-item-members">
          {[
            dmCount > 0 ? t('conversations.folders.dmCount', { count: dmCount }) : null,
            groupCount > 0 ? t('conversations.folders.groupCount', { count: groupCount }) : null,
          ]
            .filter(Boolean)
            .join(', ') || t('conversations.folders.emptyCount')}
        </span>
      </div>
      <div className="conversation-list-item-badges">
        {folder.favorited && <Icon name="star" className="conversation-list-item-star" />}
        {hasUnread && <span className="conversation-list-item-unread-dot" />}
      </div>
    </button>
  );

  return (
    <Menu.Root onSelect={handleContextAction}>
      <Menu.ContextTrigger asChild>
        <div className="conversation-list-item-context-anchor">{row}</div>
      </Menu.ContextTrigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content className="conversation-context-menu">
            <Menu.Item value="rename" className="conversation-context-menu-item">
              <Icon name="pen" className="conversation-context-menu-item-icon" />
              {t('conversations.folders.rename')}
            </Menu.Item>
            {!folder.favorited ? (
              <Menu.Item value="favorite" className="conversation-context-menu-item">
                <Icon name="star" className="conversation-context-menu-item-icon" />
                {t('conversations.folders.addFavorite')}
              </Menu.Item>
            ) : (
              <Menu.Item value="unfavorite" className="conversation-context-menu-item">
                <Icon name="star" className="conversation-context-menu-item-icon" />
                {t('conversations.folders.removeFavorite')}
              </Menu.Item>
            )}
            <Menu.Item value="remove" className="conversation-context-menu-item conversation-context-menu-item--danger">
              <Icon name="x" className="conversation-context-menu-item-icon" />
              {t('conversations.folders.removeFolder')}
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
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
  onOpenFolder,
}: {
  isChatInvitesPanelOpen: boolean;
  onToggleChatInvitesPanel: () => void;
  onOpenFolder?: (folderId: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    conversations,
    loading,
    leaveGroup,
    participantProfiles,
    activeConversationId,
    setActiveConversation,
  } = useConversations();
  const { preferences, toggleArchive, toggleFavorite } = useConversationPreferences();
  const {
    folders,
    folderedConversationIds,
    createFolder,
    deleteFolder,
    updateFolder,
    addConversationToFolder,
    toggleFolderFavorite,
  } = useConversationFolders();
  const { identity, status: identityStatus } = useIdentity();
  const isIdentityLoggedIn = identityStatus === 'logged_in' && !!identity;
  const { activeCallConversationIds } = useGlobalCallEvents();
  const { activeSession } = useCallSession();
  const { closeMobile } = useSidebar();
  const [activeTab, setActiveTab] = useState('conversations');

  const selfId = identity?.id;

  // Filter state
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showArchived, setShowArchived] = useState(false);

  // Leave dialog state
  const [leaveTargetId, setLeaveTargetId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Drag-and-drop state
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  // Folder edit modal state
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const editFolder = editFolderId
    ? folders.find((f) => f.id === editFolderId) ?? null
    : null;

  const isFiltered = typeFilter !== 'all' || sortMode !== 'recent' || showArchived;

  const totalUnread = conversations.reduce(
    (sum, c) => sum + (c.hasUnread ? 1 : 0) + c.unreadCount,
    0,
  );

  const { unreadBySpace } = useSpaces();
  const totalSpacesUnread = useMemo(
    () => Object.values(unreadBySpace).reduce((sum, n) => sum + n, 0),
    [unreadBySpace],
  );

  const { appWindow } = usePlatformCapabilities();
  const { activeTheme } = useTheme();
  const accentHex = activeTheme?.colors.accentPrimary;
  const secondaryHex = activeTheme?.colors.accentSecondary;

  useEffect(() => {
    appWindow?.setBadgeCount(totalUnread, accentHex, secondaryHex);
  }, [totalUnread, appWindow, accentHex, secondaryHex]);

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
      badge: totalSpacesUnread > 0 ? totalSpacesUnread : undefined,
    },
  ];

  const handleNewConversation = () => {
    navigate('/conversations/new');
    closeMobile();
  };

  const handleLeaveRequest = useCallback((conversationId: string) => {
    setLeaveTargetId(conversationId);
  }, []);

  // Stable callback identities for the memoized rows.
  const setActiveConversationRef = useRef(setActiveConversation);
  setActiveConversationRef.current = setActiveConversation;
  const closeMobileRef = useRef(closeMobile);
  closeMobileRef.current = closeMobile;
  const toggleArchiveRef = useRef(toggleArchive);
  toggleArchiveRef.current = toggleArchive;
  const toggleFavoriteRef = useRef(toggleFavorite);
  toggleFavoriteRef.current = toggleFavorite;

  const handleSelect = useCallback(
    (conversationId: string) => {
      setActiveConversationRef.current(conversationId);
      navigate(`/conversations/${conversationId}`);
      closeMobileRef.current();
    },
    [navigate],
  );

  const handleEdit = useCallback(
    (conversationId: string) => {
      setActiveConversationRef.current(conversationId);
      navigate(`/conversations/${conversationId}?showSettings=true`);
      closeMobileRef.current();
    },
    [navigate],
  );

  const handleArchive = useCallback(
    (conversationId: string, archived: boolean, keepArchived?: boolean) => {
      void toggleArchiveRef.current(conversationId, archived, keepArchived);
    },
    [],
  );

  const handleFavorite = useCallback(
    (conversationId: string, favorited: boolean) => {
      void toggleFavoriteRef.current(conversationId, favorited);
    },
    [],
  );

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

  // --- Drag-and-drop ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const draggedId = String(active.id);
      const overId = String(over.id);

      if (draggedId === overId) return;

      // If dropped onto a folder, add to that folder
      if (overId.startsWith('folder:')) {
        const folderId = overId.slice(7);
        if (!folderedConversationIds.has(draggedId)) {
          void addConversationToFolder(folderId, draggedId);
        }
        return;
      }

      // If dropped onto another conversation, create a new folder
      if (!folderedConversationIds.has(draggedId) && !folderedConversationIds.has(overId)) {
        void createFolder({
          name: t('conversations.folders.newFolder'),
          conversationIds: [overId, draggedId],
        });
      }
    },
    [folderedConversationIds, addConversationToFolder, createFolder, t],
  );

  const handleFolderRename = useCallback((folderId: string) => {
    setEditFolderId(folderId);
  }, []);

  const handleFolderEditSave = useCallback(
    (data: {
      name: string;
      iconType: FolderIconType;
      iconName?: FolderIconName;
      iconColor?: string | null;
    }) => {
      if (!editFolderId) return;
      void updateFolder(editFolderId, data);
      setEditFolderId(null);
    },
    [editFolderId, updateFolder],
  );

  const handleFolderDelete = useCallback(
    (folderId: string) => {
      void deleteFolder(folderId);
    },
    [deleteFolder],
  );

  const handleFolderToggleFavorite = useCallback(
    (folderId: string, favorited: boolean) => {
      void toggleFolderFavorite(folderId, favorited);
    },
    [toggleFolderFavorite],
  );

  const handleFolderOpen = useCallback(
    (folderId: string) => {
      onOpenFolder?.(folderId);
    },
    [onOpenFolder],
  );

  // Derive filtered + sorted conversation lists, excluding foldered conversations
  const { favoritesList, mainList, favoritedFolders, mainFolders } = useMemo(() => {
    const withNames = conversations
      .filter((c) => !folderedConversationIds.has(c.id))
      .map((c) => ({
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

    // Split folders into favorited/main
    const favFolders = folders.filter((f) => f.favorited);
    const restFolders = folders.filter((f) => !f.favorited);

    // Split conversations into favorites and the rest (only when no active filters)
    if (!isFiltered) {
      const favs = filtered.filter((x) => x.pref?.favorited);
      const rest = filtered.filter((x) => !x.pref?.favorited);
      return {
        favoritesList: favs,
        mainList: rest,
        favoritedFolders: favFolders,
        mainFolders: restFolders,
      };
    }

    return {
      favoritesList: [],
      mainList: filtered,
      favoritedFolders: [],
      mainFolders: typeFilter === 'all' ? folders : [],
    };
  }, [
    conversations,
    identity?.id,
    participantProfiles,
    preferences,
    typeFilter,
    sortMode,
    showArchived,
    isFiltered,
    folderedConversationIds,
    folders,
  ]);

  const draggedConversation = dragActiveId
    ? conversations.find((c) => c.id === dragActiveId)
    : null;
  const draggedDisplayName = draggedConversation
    ? resolveConversationDisplayName(draggedConversation, selfId, participantProfiles)
    : '';

  const renderItem = (item: (typeof mainList)[number]) => (
    <DraggableConversation key={item.conversation.id} id={item.conversation.id}>
      <DroppableTarget id={item.conversation.id}>
        <ConversationListItem
          conversation={item.conversation}
          displayName={item.displayName}
          isActive={activeConversationId === item.conversation.id}
          isArchived={!!item.pref?.archived}
          isFavorited={!!item.pref?.favorited}
          hasActiveCall={activeCallConversationIds.has(item.conversation.id)}
          isUserInCall={activeSession?.conversationId === item.conversation.id}
          selfId={selfId}
          participantProfiles={participantProfiles}
          onSelect={handleSelect}
          onEdit={handleEdit}
          onArchive={handleArchive}
          onFavorite={handleFavorite}
          onLeave={handleLeaveRequest}
        />
      </DroppableTarget>
    </DraggableConversation>
  );

  const renderFolderItem = (folder: ConversationFolder) => (
    <DroppableTarget key={folder.id} id={`folder:${folder.id}`}>
      <FolderListItem
        folder={folder}
        conversations={conversations}
        participantProfiles={participantProfiles}
        selfId={selfId}
        onOpen={handleFolderOpen}
        onRename={handleFolderRename}
        onDelete={handleFolderDelete}
        onToggleFavorite={handleFolderToggleFavorite}
      />
    </DroppableTarget>
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
              {isIdentityLoggedIn && (
                <SidebarItem
                  icon={<Icon name="plus" />}
                  label={t('sidebar.newConversation', 'New')}
                  onClick={handleNewConversation}
                />
              )}
            </div>

            {loading && conversations.length === 0 && (
              <div className="sidebar-conversations-loading">
                <span className="spinner spinner-sm" />
              </div>
            )}

            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="sidebar-conversations-list">
                {favoritedFolders.map(renderFolderItem)}

                {favoritesList.length > 0 && (
                  <>
                    {favoritesList.map(renderItem)}
                  </>
                )}

                {mainFolders.map(renderFolderItem)}

                {mainList.map(renderItem)}

                {!loading &&
                  favoritesList.length === 0 &&
                  mainList.length === 0 &&
                  folders.length === 0 && (
                    <div className="sidebar-conversations-empty">
                      {isIdentityLoggedIn
                        ? t('sidebar.noConversations', 'No conversations yet')
                        : t('sidebar.signInForConversations', 'Sign into an Alias to see Conversations')}
                    </div>
                  )}
              </div>

              <DragOverlay>
                {draggedConversation ? (
                  <div className="conversation-drag-overlay">
                    <span className="conversation-drag-overlay-name">
                      {draggedDisplayName}
                    </span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>

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

            <FolderEditModal
              open={!!editFolderId}
              onOpenChange={(open) => {
                if (!open) setEditFolderId(null);
              }}
              initialName={editFolder?.name ?? ''}
              initialIconType={editFolder?.iconType ?? 'dynamic'}
              initialIconName={editFolder?.iconName}
              initialIconColor={editFolder?.iconColor}
              onSave={handleFolderEditSave}
            />
          </>
        )}

        {activeTab === 'spaces' && <SpacesSidebarSection />}
      </div>
    </div>
  );
}
