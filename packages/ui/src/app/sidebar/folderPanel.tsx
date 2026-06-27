/**
 * FolderPanel — secondary sidebar showing conversations inside a folder.
 *
 * Follows the same pattern as FriendsPanel: slides out to the right of the
 * primary sidebar, closes on Escape / click outside.
 */

import { useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, Portal } from '@ark-ui/react';
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
import { getSidebarListAvatarMemberIds } from '../../pages/conversations/conversationViewModel';
import { useSidebarPanelDismiss } from './useSidebarPanelDismiss';
import type { ConversationFolder } from '@adieuu/shared';

function resolveDisplayName(
  conversation: DecryptedConversation,
  selfId: string | undefined,
  profiles: Record<string, { displayName?: string; username?: string }>,
): string {
  if (conversation.type === 'group') return conversation.decryptedName ?? 'Group';
  if (conversation.decryptedName?.trim()) return conversation.decryptedName.trim();
  const others = conversation.participants.filter((p) => p !== selfId);
  return others
    .map((pid) => {
      const p = profiles[pid];
      return p?.displayName ?? p?.username ?? pid;
    })
    .join(', ');
}

function FolderConversationItem({
  conversation,
  displayName,
  folderId,
  isFavorited,
  isArchived,
  hasActiveCall,
  isUserInCall,
  onClose,
}: {
  conversation: DecryptedConversation;
  displayName: string;
  folderId: string;
  isFavorited: boolean;
  isArchived: boolean;
  hasActiveCall: boolean;
  isUserInCall: boolean;
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

  const row = (
    <button type="button" className="conversation-list-item" onClick={handleClick}>
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
        {folderConversations.length > 0 ? (
          folderConversations.map((conv) => {
            const displayName = resolveDisplayName(conv, identity?.id, participantProfiles);
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
                onClose={onClose}
              />
            );
          })
        ) : (
          <div className="sidebar-folder-panel-empty">
            {t('conversations.folders.emptyFolder')}
          </div>
        )}
      </div>
    </div>
  );
}
