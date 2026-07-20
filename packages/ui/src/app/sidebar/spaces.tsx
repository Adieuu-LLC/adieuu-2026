/**
 * Spaces sidebar tab content.
 *
 * Mirrors the Conversations tab: an actions row (Discover / Create) plus a
 * list of the Spaces the current Alias is a member of. Selecting a Space
 * resumes the last-viewed channel when known, otherwise opens Space Home.
 * Unreads and active highlighting are driven by the SpacesProvider context.
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
import { SidebarItem, useSidebar } from '../../components/Sidebar';
import { Icon } from '../../icons/Icon';
import { useIdentity } from '../../hooks/useIdentity';
import { useSpaces } from '../../hooks/useSpaces';
import { useCipherStore } from '../../hooks/useCipherStore';
import { getSpaceCipherLink } from '../../services/spaceCipherService';
import { resolveSpaceDisplayName } from '../../pages/spaces/spaceMetadataCipher';

export function SpacesSidebarSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { closeMobile } = useSidebar();
  const { status: identityStatus } = useIdentity();
  const isIdentityLoggedIn = identityStatus === 'logged_in';
  const { spaces, spacesLoading, unreadBySpace } = useSpaces();
  const { getCipherKey } = useCipherStore();

  const handleDiscover = useCallback(() => {
    navigate('/spaces');
    closeMobile();
  }, [navigate, closeMobile]);

  const handleCreate = useCallback(() => {
    navigate('/spaces/new');
    closeMobile();
  }, [navigate, closeMobile]);

  const handleOpenSpace = useCallback(
    (space: { id: string; slug: string }) => {
      const lastChannelId = getLastChannelId(space.id);
      navigate(lastChannelId ? `/s/${space.slug}/c/${lastChannelId}` : `/s/${space.slug}`);
      closeMobile();
    },
    [navigate, closeMobile],
  );

  const activeSlug = location.pathname.startsWith('/s/')
    ? location.pathname.split('/')[2]
    : null;

  return (
    <>
      <div className="sidebar-conversations-actions">
        <SidebarItem
          icon={<Icon name="globe" />}
          label={t('sidebar.discoverSpaces', 'Discover')}
          onClick={handleDiscover}
        />
        {isIdentityLoggedIn && (
          <SidebarItem
            icon={<Icon name="plus" />}
            label={t('sidebar.createSpace', 'Create Space')}
            onClick={handleCreate}
          />
        )}
      </div>

      {isIdentityLoggedIn && spacesLoading && spaces.length === 0 && (
        <div className="sidebar-conversations-loading">
          <span className="spinner spinner-sm" />
        </div>
      )}

      <div className="sidebar-conversations-list">
        {spaces.map((space) => {
          const isActive = activeSlug === space.slug;
          const unread = unreadBySpace[space.id] ?? 0;
          const localCipherId = getSpaceCipherLink(space.id);
          const cipher = localCipherId ? getCipherKey(localCipherId) : null;
          const displayName = resolveSpaceDisplayName(space, cipher, {
            encryptedSpace: t('spaces.encryptedSpacePlaceholder'),
          });
          const avatarChar = (displayName.charAt(0) || space.slug.charAt(0) || '?').toUpperCase();
          const itemClasses = [
            'conversation-list-item',
            isActive && 'conversation-list-item-active',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={space.id}
              type="button"
              className={itemClasses}
              onClick={() => handleOpenSpace(space)}
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
              {unread > 0 && (
                <div className="conversation-list-item-badges">
                  <span className="conversation-list-item-badge">{unread}</span>
                </div>
              )}
            </button>
          );
        })}

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
