import { useCallback, type ReactNode } from 'react';
import type { PublicIdentity, ConversationFolder, PublicSpace } from '@adieuu/shared';
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
  spaces,
  unreadBySpace,
  resolveSpaceDisplayName,
  participantProfiles,
  selfId,
  onOpen,
  onRename,
  onDelete,
  onToggleFavorite,
}: {
  folder: ConversationFolder;
  conversations: DecryptedConversation[];
  spaces: PublicSpace[];
  unreadBySpace: Record<string, number>;
  resolveSpaceDisplayName: (space: PublicSpace) => string;
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

  const folderSpaces = folder.spaceIds
    .map((sid) => spaces.find((s) => s.id === sid))
    .filter(Boolean) as PublicSpace[];

  const dmCount = folderConversations.filter((c) => c.type === 'dm').length;
  const groupCount = folderConversations.filter((c) => c.type === 'group').length;
  const spaceCount = folderSpaces.length;

  const hasUnread =
    folderConversations.some((c) => c.unreadCount > 0 || c.hasUnread) ||
    folderSpaces.some((s) => (unreadBySpace[s.id] ?? 0) > 0);

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
    // Dynamic: up to 3 overlapping avatars from conversations then spaces
    type AvatarSlot =
      | { key: string; kind: 'identity'; pid: string }
      | { key: string; kind: 'space'; initial: string };

    const slots: AvatarSlot[] = [];
    for (const conv of folderConversations) {
      const pids = getSidebarListAvatarMemberIds(
        conv.type === 'group',
        conv.participants,
        selfId,
      );
      for (const pid of pids) {
        if (!slots.some((s) => s.kind === 'identity' && s.pid === pid)) {
          slots.push({ key: `i:${pid}`, kind: 'identity', pid });
        }
        if (slots.length >= 3) break;
      }
      if (slots.length >= 3) break;
    }
    if (slots.length < 3) {
      for (const space of folderSpaces) {
        const name = resolveSpaceDisplayName(space);
        const initial = (name.charAt(0) || space.slug.charAt(0) || '?').toUpperCase();
        slots.push({ key: `s:${space.id}`, kind: 'space', initial });
        if (slots.length >= 3) break;
      }
    }

    if (slots.length > 1) {
      avatarEl = (
        <div className="conversation-list-item-avatar-stack">
          {slots.map((slot) => {
            if (slot.kind === 'space') {
              return (
                <span key={slot.key} className="conversation-list-item-avatar-stack-item">
                  <span className="conversation-list-item-avatar-stack-item-placeholder">
                    {slot.initial}
                  </span>
                </span>
              );
            }
            const p = participantProfiles[slot.pid];
            const initial = resolveDisplay(slot.pid).charAt(0).toUpperCase();
            return (
              <span key={slot.key} className="conversation-list-item-avatar-stack-item">
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

  const countParts = [
    dmCount > 0 ? t('conversations.folders.dmCount', { count: dmCount }) : null,
    groupCount > 0 ? t('conversations.folders.groupCount', { count: groupCount }) : null,
    spaceCount > 0 ? t('conversations.folders.spaceCount', { count: spaceCount }) : null,
  ].filter(Boolean);

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
          {countParts.join(', ') || t('conversations.folders.emptyCount')}
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
