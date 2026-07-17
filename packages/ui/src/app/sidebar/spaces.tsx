/**
 * Spaces sidebar tab content.
 *
 * Mirrors the Conversations tab: an actions row (Discover / Create) plus a
 * list of the Spaces the current Alias is a member of. Selecting a Space
 * opens `/s/:slug`. Unreads and active highlighting are driven by the
 * SpacesProvider context.
 */

import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SidebarItem, useSidebar } from '../../components/Sidebar';
import { Icon } from '../../icons/Icon';
import { useIdentity } from '../../hooks/useIdentity';
import { useSpaces } from '../../hooks/useSpaces';

export function SpacesSidebarSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { closeMobile } = useSidebar();
  const { status: identityStatus } = useIdentity();
  const isIdentityLoggedIn = identityStatus === 'logged_in';
  const { spaces, spacesLoading, unreadBySpace } = useSpaces();

  const handleDiscover = useCallback(() => {
    navigate('/spaces');
    closeMobile();
  }, [navigate, closeMobile]);

  const handleCreate = useCallback(() => {
    navigate('/spaces/new');
    closeMobile();
  }, [navigate, closeMobile]);

  const handleOpenSpace = useCallback(
    (slug: string) => {
      navigate(`/s/${slug}`);
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
              onClick={() => handleOpenSpace(space.slug)}
            >
              <div className="conversation-list-item-avatar">
                <span className="conversation-list-item-avatar-placeholder">
                  {space.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="conversation-list-item-info">
                <span className="conversation-list-item-title">{space.name}</span>
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
