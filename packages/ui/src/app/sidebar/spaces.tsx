/**
 * Spaces sidebar list items and actions.
 *
 * Used by the unified Conversations / Spaces / All sidebar section.
 */

function getLastChannelId(spaceId: string): string | null {
  try {
    return localStorage.getItem(`adieuu:lastChannel:${spaceId}`);
  } catch {
    return null;
  }
}

import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, Portal } from '@ark-ui/react';
import type { PublicSpace } from '@adieuu/shared';
import { SidebarItem, useSidebar } from '../../components/Sidebar';
import { Icon } from '../../icons/Icon';
import { useIdentity } from '../../hooks/useIdentity';
import { useSpaces } from '../../hooks/useSpaces';
import { useOptionalVoiceChannelSession } from '../../hooks/useVoiceChannelSession';
import { useCipherStore } from '../../hooks/useCipherStore';
import { getSpaceCipherLink } from '../../services/spaceCipherService';
import { resolveSpaceDisplayName } from '../../pages/spaces/spaceMetadataCipher';

export { getLastChannelId };

export function DiscoverSpacesSidebarItem() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closeMobile } = useSidebar();

  const handleDiscover = useCallback(() => {
    navigate('/spaces');
    closeMobile();
  }, [navigate, closeMobile]);

  return (
    <SidebarItem
      icon={<Icon name="earth" />}
      label={t('sidebar.discoverSpaces', 'Discover')}
      onClick={handleDiscover}
    />
  );
}

/** Standalone Discover action row (Create Space lives on the Discover page). */
export function SpacesSidebarActions() {
  return (
    <div className="sidebar-conversations-actions">
      <DiscoverSpacesSidebarItem />
    </div>
  );
}

export function useSpaceSidebarDisplayName() {
  const { t } = useTranslation();
  const { getCipherKey } = useCipherStore();

  return useCallback(
    (space: PublicSpace) => {
      const localCipherId = getSpaceCipherLink(space.id);
      const cipher = localCipherId ? getCipherKey(localCipherId) : null;
      return resolveSpaceDisplayName(space, cipher, {
        encryptedSpace: t('spaces.encryptedSpacePlaceholder'),
      });
    },
    [getCipherKey, t],
  );
}

export function SpaceListItem({
  space,
  displayName,
  unread,
  muted,
  isFavorited,
  onOpen,
  onFavorite,
  onMarkAllRead,
  onLeave,
}: {
  space: PublicSpace;
  displayName: string;
  unread: number;
  muted?: boolean;
  isFavorited?: boolean;
  onOpen: (space: { id: string; slug: string }) => void;
  onFavorite?: (spaceId: string, favorited: boolean) => void;
  onMarkAllRead?: (spaceId: string) => void;
  onLeave?: (spaceId: string) => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const voice = useOptionalVoiceChannelSession();
  const isInVoiceHere = voice?.joined?.spaceId === space.id;
  const activeSlug = location.pathname.startsWith('/s/')
    ? location.pathname.split('/')[2]
    : null;
  const isActive = activeSlug === space.slug;
  const avatarChar = (displayName.charAt(0) || space.slug.charAt(0) || '?').toUpperCase();
  const itemClasses = [
    'conversation-list-item',
    isActive && 'conversation-list-item-active',
    muted && 'sidebar-list-item-muted',
  ]
    .filter(Boolean)
    .join(' ');

  const handleContextAction = useCallback(
    (details: { value: string }) => {
      switch (details.value) {
        case 'favorite':
          onFavorite?.(space.id, true);
          break;
        case 'unfavorite':
          onFavorite?.(space.id, false);
          break;
        case 'mark-all-read':
          onMarkAllRead?.(space.id);
          break;
        case 'leave':
          onLeave?.(space.id);
          break;
      }
    },
    [space.id, onFavorite, onMarkAllRead, onLeave],
  );

  const row = (
    <button
      type="button"
      className={itemClasses}
      onClick={() => onOpen(space)}
    >
      <div className="conversation-list-item-avatar">
        <span className="conversation-list-item-avatar-placeholder">
          {avatarChar}
        </span>
      </div>
      <div className="conversation-list-item-info">
        <span className="conversation-list-item-title">{displayName}</span>
        <span className="conversation-list-item-members">
          {t('spaces.memberCount', { count: space.memberCount })}
        </span>
      </div>
      <div className="conversation-list-item-badges">
        {isInVoiceHere && (
          <Icon
            name="phone"
            className="conversation-list-item-call-icon conversation-list-item-call-icon--joined"
            aria-hidden
          />
        )}
        {isFavorited && (
          <Icon name="star" className="conversation-list-item-star" />
        )}
        {unread > 0 && (
          <span className="conversation-list-item-badge">{unread}</span>
        )}
      </div>
    </button>
  );

  if (!onFavorite && !onMarkAllRead && !onLeave) {
    return row;
  }

  return (
    <Menu.Root onSelect={handleContextAction}>
      <Menu.ContextTrigger asChild>{row}</Menu.ContextTrigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content className="conversation-context-menu">
            {!isFavorited ? (
              <Menu.Item value="favorite" className="conversation-context-menu-item">
                <Icon name="star" className="conversation-context-menu-item-icon" />
                {t('spaces.contextMenu.addFavorite', 'Add to Favourites')}
              </Menu.Item>
            ) : (
              <Menu.Item value="unfavorite" className="conversation-context-menu-item">
                <Icon name="star" className="conversation-context-menu-item-icon" />
                {t('spaces.contextMenu.removeFavorite', 'Remove from Favourites')}
              </Menu.Item>
            )}

            <Menu.Item value="mark-all-read" className="conversation-context-menu-item">
              <Icon name="check" className="conversation-context-menu-item-icon" />
              {t('spaces.contextMenu.markAllRead', 'Mark all as read')}
            </Menu.Item>

            {onLeave && (
              <Menu.Item
                value="leave"
                className="conversation-context-menu-item conversation-context-menu-item--danger"
              >
                <Icon name="logout" className="conversation-context-menu-item-icon" />
                {t('spaces.contextMenu.leave', 'Leave Space')}
              </Menu.Item>
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

/**
 * Standalone Spaces list (actions + rows). The primary sidebar composes these
 * pieces into the unified Conversations/Spaces/All section instead.
 */
export function SpacesSidebarSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closeMobile } = useSidebar();
  const { status: identityStatus } = useIdentity();
  const isIdentityLoggedIn = identityStatus === 'logged_in';
  const { spaces, spacesLoading, unreadBySpace } = useSpaces();
  const resolveDisplayName = useSpaceSidebarDisplayName();

  const handleOpenSpace = useCallback(
    (space: { id: string; slug: string }) => {
      const lastChannelId = getLastChannelId(space.id);
      navigate(lastChannelId ? `/s/${space.slug}/c/${lastChannelId}` : `/s/${space.slug}`);
      closeMobile();
    },
    [navigate, closeMobile],
  );

  return (
    <>
      <SpacesSidebarActions />

      {isIdentityLoggedIn && spacesLoading && spaces.length === 0 && (
        <div className="sidebar-conversations-loading">
          <span className="spinner spinner-sm" />
        </div>
      )}

      <div className="sidebar-conversations-list">
        {spaces.map((space) => (
          <SpaceListItem
            key={space.id}
            space={space}
            displayName={resolveDisplayName(space)}
            unread={unreadBySpace[space.id] ?? 0}
            onOpen={handleOpenSpace}
          />
        ))}

        {!spacesLoading && spaces.length === 0 && (
          <div className="sidebar-conversations-empty">
            {isIdentityLoggedIn
              ? t('sidebar.noSpaces', "You haven't joined any Spaces yet")
              : t('sidebar.signInForSpaces', 'Sign into an Alias to see Spaces')}
          </div>
        )}
      </div>
    </>
  );
}
