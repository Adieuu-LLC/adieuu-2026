import { useCallback, memo } from 'react';
import type { PublicIdentity } from '@adieuu/shared';
import { useTranslation } from 'react-i18next';
import { Menu, Portal } from '@ark-ui/react';
import { Icon } from '../../icons/Icon';
import { SidebarConversationDmHoverCard } from './SidebarConversationDmHoverCard';
import { GroupConversationSidebarHoverCard } from './GroupConversationSidebarHoverCard';
import { type DecryptedConversation } from '../../hooks/useConversations';
import { getSidebarListAvatarMemberIds } from '../../pages/conversations/conversationViewModel';

export interface ConversationListItemProps {
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
  /** Visually muted (still interactive) when out of the current sidebar view */
  muted?: boolean;
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
    prev.onLeave !== next.onLeave ||
    prev.muted !== next.muted
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

export const ConversationListItem = memo(function ConversationListItem({
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
  muted,
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
