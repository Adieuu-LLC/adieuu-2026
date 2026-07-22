/**
 * FolderPanel — secondary sidebar showing conversations and spaces inside a folder.
 *
 * Follows the same pattern as FriendsPanel: slides out to the right of the
 * primary sidebar, closes on Escape / click outside.
 */

import { useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, Portal } from '@ark-ui/react';
import type { ConversationFolder, PublicSpace } from '@adieuu/shared';
import { useSidebar } from '../../components/Sidebar';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';
import { SidebarConversationDmHoverCard } from './SidebarConversationDmHoverCard';
import { GroupConversationSidebarHoverCard } from './GroupConversationSidebarHoverCard';
import { useConversations, type DecryptedConversation } from '../../hooks/useConversations';
import { useConversationPreferences } from '../../hooks/useConversationPreferences';
import { useConversationFolders } from '../../hooks/useConversationFolders';
import { useIdentity } from '../../hooks/useIdentity';
import { useGlobalCallEvents } from '../../hooks/useGlobalCallEvents';
import { useCallSession } from '../../hooks/useCallSession';
import { useSpaces } from '../../hooks/useSpaces';
import { getSidebarListAvatarMemberIds } from '../../pages/conversations/conversationViewModel';
import { useSidebarPanelDismiss } from './useSidebarPanelDismiss';
import { resolveConversationDisplayName } from './resolveConversationDisplayName';
import {
  SpaceListItem,
  useSpaceSidebarDisplayName,
  getLastChannelId,
} from './spaces';
import {
  useSidebarListViewOptional,
  isConversationMutedInView,
  isSpaceMutedInView,
} from './sidebarListView';

function FolderConversationItem({
  conversation,
  displayName,
  folderId,
  isFavorited,
  isArchived,
  hasActiveCall,
  isUserInCall,
  muted,
  onClose,
}: {
  conversation: DecryptedConversation;
  displayName: string;
  folderId: string;
  isFavorited: boolean;
  isArchived: boolean;
  hasActiveCall: boolean;
  isUserInCall: boolean;
  muted?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { identity } = useIdentity();
  const { setActiveConversation, participantProfiles } = useConversations();
  const { toggleFavorite } = useConversationPreferences();
  const { removeConversationFromFolder } = useConversationFolders();
  const { closeMobile } = useSidebar();

  const isGroup = conversation.type === 'group';
  const isDm = conversation.type === 'dm';
  const otherParticipants = conversation.participants.filter(
    (pid) => pid !== identity?.id,
  );

  const listAvatarPids = getSidebarListAvatarMemberIds(
    isGroup,
    conversation.participants,
    identity?.id,
  );

  const resolveDisplay = (pid: string) => {
    const p = participantProfiles[pid];
    return p?.displayName ?? p?.username ?? pid;
  };

  const handleClick = () => {
    setActiveConversation(conversation.id);
    navigate(`/conversations/${conversation.id}`);
    closeMobile();
    onClose();
  };

  const handleContextAction = useCallback(
    (details: { value: string }) => {
      switch (details.value) {
        case 'remove-from-folder':
          removeConversationFromFolder(folderId, conversation.id);
          break;
        case 'favorite':
          toggleFavorite(conversation.id, true);
          break;
        case 'unfavorite':
          toggleFavorite(conversation.id, false);
          break;
      }
    },
    [conversation.id, folderId, removeConversationFromFolder, toggleFavorite],
  );

  const avatarEl =
    isDm || listAvatarPids.length <= 1 ? (
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
        {isDm && <span className="conversation-list-item-dm-badge">DM</span>}
      </div>
    ) : (
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
    );

  const itemClasses = [
    'conversation-list-item',
    muted && 'sidebar-list-item-muted',
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
          />
        )}
        {isFavorited && <Icon name="star" className="conversation-list-item-star" />}
        {isArchived && <Icon name="archive" className="conversation-list-item-archive-icon" />}
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
          <Menu.Item value="remove-from-folder" className="conversation-context-menu-item">
            <Icon name="x" className="conversation-context-menu-item-icon" />
            {t('conversations.folders.removeFromFolder')}
          </Menu.Item>
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
      <Menu.ContextTrigger asChild>
        <div className="conversation-list-item-context-anchor">{row}</div>
      </Menu.ContextTrigger>
      {contextMenu}
    </Menu.Root>
  );
}

function FolderSpaceItem({
  space,
  displayName,
  folderId,
  unread,
  muted,
  onClose,
}: {
  space: PublicSpace;
  displayName: string;
  folderId: string;
  unread: number;
  muted?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closeMobile } = useSidebar();
  const { removeSpaceFromFolder } = useConversationFolders();

  const handleOpen = useCallback(
    (target: { id: string; slug: string }) => {
      const lastChannelId = getLastChannelId(target.id);
      navigate(lastChannelId ? `/s/${target.slug}/c/${lastChannelId}` : `/s/${target.slug}`);
      closeMobile();
      onClose();
    },
    [navigate, closeMobile, onClose],
  );

  const handleContextAction = useCallback(
    (details: { value: string }) => {
      if (details.value === 'remove-from-folder') {
        void removeSpaceFromFolder(folderId, space.id);
      }
    },
    [folderId, space.id, removeSpaceFromFolder],
  );

  return (
    <Menu.Root onSelect={handleContextAction}>
      <Menu.ContextTrigger asChild>
        <div className="conversation-list-item-context-anchor">
          <SpaceListItem
            space={space}
            displayName={displayName}
            unread={unread}
            muted={muted}
            onOpen={handleOpen}
          />
        </div>
      </Menu.ContextTrigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content className="conversation-context-menu">
            <Menu.Item value="remove-from-folder" className="conversation-context-menu-item">
              <Icon name="x" className="conversation-context-menu-item-icon" />
              {t('conversations.folders.removeFromFolder')}
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

export function FolderPanel({
  isOpen,
  folder,
  onClose,
}: {
  isOpen: boolean;
  folder: ConversationFolder | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { conversations, participantProfiles } = useConversations();
  const { preferences } = useConversationPreferences();
  const { identity } = useIdentity();
  const { activeCallConversationIds } = useGlobalCallEvents();
  const { activeSession } = useCallSession();
  const { spaces, unreadBySpace } = useSpaces();
  const resolveSpaceDisplayName = useSpaceSidebarDisplayName();
  const listViewCtx = useSidebarListViewOptional();
  const listView = listViewCtx?.listView ?? 'all';
  const conversationMuted = isConversationMutedInView(listView);
  const spaceMuted = isSpaceMutedInView(listView);
  const panelRef = useRef<HTMLDivElement>(null);

  useSidebarPanelDismiss({
    isOpen,
    onClose,
    panelRef,
    ignoreClosestSelector: '.hover-card-content, .conversation-context-menu, .conversation-context-menu-item',
  });

  if (!isOpen || !folder) return null;

  const folderConversations = folder.conversationIds
    .map((cid) => conversations.find((c) => c.id === cid))
    .filter(Boolean) as DecryptedConversation[];

  const folderSpaces = folder.spaceIds
    .map((sid) => spaces.find((s) => s.id === sid))
    .filter(Boolean) as PublicSpace[];

  const isEmpty = folderConversations.length === 0 && folderSpaces.length === 0;

  return (
    <div className="sidebar-folder-panel" ref={panelRef}>
      <div className="sidebar-folder-panel-header">
        <span className="sidebar-folder-panel-title">{folder.name}</span>
        <Button
          variant="ghost"
          size="sm"
          className="sidebar-folder-panel-close"
          onClick={onClose}
          aria-label={t('conversations.folders.close')}
        >
          <Icon name="x" />
        </Button>
      </div>

      <div className="sidebar-folder-panel-list">
        {!isEmpty ? (
          <>
            {folderConversations.map((conv) => {
              const displayName = resolveConversationDisplayName(conv, identity?.id, participantProfiles);
              const pref = preferences[conv.id];
              return (
                <FolderConversationItem
                  key={conv.id}
                  conversation={conv}
                  displayName={displayName}
                  folderId={folder.id}
                  isFavorited={!!pref?.favorited}
                  isArchived={!!pref?.archived}
                  hasActiveCall={activeCallConversationIds.has(conv.id)}
                  isUserInCall={activeSession?.conversationId === conv.id}
                  muted={conversationMuted}
                  onClose={onClose}
                />
              );
            })}
            {folderSpaces.map((space) => (
              <FolderSpaceItem
                key={space.id}
                space={space}
                displayName={resolveSpaceDisplayName(space)}
                folderId={folder.id}
                unread={unreadBySpace[space.id] ?? 0}
                muted={spaceMuted}
                onClose={onClose}
              />
            ))}
          </>
        ) : (
          <div className="sidebar-folder-panel-empty">
            {t('conversations.folders.emptyFolder')}
          </div>
        )}
      </div>
    </div>
  );
}
