import { useCallback, type ReactNode } from 'react';
import type { PublicIdentity, ConversationFolder } from '@adieuu/shared';
import { useTranslation } from 'react-i18next';
import { Menu, Portal } from '@ark-ui/react';
import { Icon } from '../../icons/Icon';
import type { AppIconName } from '../../icons/appIcons';
import { type DecryptedConversation } from '../../hooks/useConversations';
import { getSidebarListAvatarMemberIds } from '../../pages/conversations/conversationViewModel';

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

export function FolderListItem({
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
  let avatarEl: ReactNode;
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
