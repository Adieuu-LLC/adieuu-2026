/**
 * Discord-style secondary sidebar for a Space.
 *
 * On desktop: persistent channel rail. On mobile: off-canvas drawer inside
 * `.space-page` (opened from SpaceMobileChrome).
 */

import { NavLink, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSpaces } from '../../hooks/useSpaces';
import { Icon } from '../../icons/Icon';
import { useSpaceCipher } from './useSpaceCipher';
import {
  resolveChannelDisplayName,
  resolveSpaceDisplayName,
} from './spaceMetadataCipher';

interface SpaceSecondarySidebarProps {
  mobileOpen?: boolean;
  onNavigate?: () => void;
}

export function SpaceSecondarySidebar({
  mobileOpen = false,
  onNavigate,
}: SpaceSecondarySidebarProps) {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { activeSpace, channels, unreadByChannel, canAccessSpaceManage } = useSpaces();
  const { spaceCipher } = useSpaceCipher(activeSpace?.id);

  if (!activeSpace) return null;

  const spaceName = resolveSpaceDisplayName(activeSpace, spaceCipher, {
    encryptedSpace: t('spaces.encryptedSpacePlaceholder'),
  });

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `space-sidebar-link${isActive ? ' space-sidebar-link-active' : ''}`;

  const handleNav = () => {
    onNavigate?.();
  };

  return (
    <aside
      className={`space-secondary-sidebar${mobileOpen ? ' space-secondary-sidebar--mobile-open' : ''}`}
      aria-label={spaceName}
    >
      <div className="space-sidebar-banner">
        <span className="space-sidebar-banner-name">{spaceName}</span>
        {activeSpace.e2ee && (
          <span className="spaces-badge spaces-badge--encrypted">
            {t('spaces.encrypted')}
          </span>
        )}
      </div>

      {canAccessSpaceManage && (
        <NavLink
          to={`/s/${slug}/manage`}
          className={navLinkClass}
          onClick={handleNav}
        >
          <Icon name="settings" size="sm" />
          <span>{t('spaces.sidebar.manage')}</span>
        </NavLink>
      )}

      <NavLink
        to={`/s/${slug}`}
        end
        className={navLinkClass}
        onClick={handleNav}
      >
        <Icon name="home" size="sm" />
        <span>{t('spaces.sidebar.home')}</span>
      </NavLink>

      <div className="space-sidebar-group">
        <div className="space-sidebar-group-header">
          {t('spaces.sidebar.textChannels')}
        </div>
        <nav
          className="space-sidebar-channels"
          aria-label={t('spaces.sidebar.textChannels')}
        >
          {channels.map((ch) => {
            const unread = unreadByChannel[ch.id];
            const channelName = resolveChannelDisplayName(ch, spaceCipher, {
              encryptedChannel: t('spaces.encryptedChannelPlaceholder'),
            });
            return (
              <NavLink
                key={ch.id}
                to={`/s/${slug}/c/${ch.id}`}
                className={navLinkClass}
                onClick={handleNav}
              >
                <span className="space-sidebar-channel-hash">#</span>
                <span className="space-sidebar-channel-name">{channelName}</span>
                {unread && unread.unread > 0 && (
                  <span
                    role="status"
                    className={`space-sidebar-unread-badge${unread.mention ? ' space-sidebar-unread-badge--mention' : ''}`}
                    aria-label={
                      unread.mention
                        ? t('spaces.sidebar.mentionBadge', { count: unread.unread })
                        : t('spaces.sidebar.unreadBadge', { count: unread.unread })
                    }
                  >
                    {unread.unread}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
