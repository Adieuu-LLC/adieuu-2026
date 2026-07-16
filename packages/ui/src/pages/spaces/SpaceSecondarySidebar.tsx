/**
 * Discord-style secondary sidebar for a Space.
 *
 * Rendered inside the main content pane (to the right of the app sidebar).
 * Contains a banner with the Space name, a stub "Manage" link for admins, a
 * Home entry that links to the landing page, and a channel list grouped under
 * a single "Text Channels" header.
 */

import { NavLink, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSpaces } from '../../hooks/useSpaces';
import { Icon } from '../../icons/Icon';

export function SpaceSecondarySidebar() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { activeSpace, channels, unreadByChannel } = useSpaces();

  if (!activeSpace) return null;

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `space-sidebar-link${isActive ? ' space-sidebar-link-active' : ''}`;

  return (
    <aside className="space-secondary-sidebar" aria-label={activeSpace.name}>
      {/* Banner */}
      <div className="space-sidebar-banner">
        <span className="space-sidebar-banner-name">{activeSpace.name}</span>
        {activeSpace.cipherCheck && (
          <span className="spaces-badge spaces-badge--encrypted">
            {t('spaces.encrypted')}
          </span>
        )}
      </div>

      {/* Manage stub */}
      <button
        type="button"
        className="space-sidebar-link space-sidebar-manage"
        disabled
        title={t('spaces.sidebar.manageTooltip')}
      >
        <Icon name="settings" size="sm" />
        <span>{t('spaces.sidebar.manage')}</span>
      </button>

      {/* Home */}
      <NavLink to={`/s/${slug}`} end className={navLinkClass}>
        <Icon name="home" size="sm" />
        <span>{t('spaces.sidebar.home')}</span>
      </NavLink>

      {/* Channel list */}
      <div className="space-sidebar-group">
        <div className="space-sidebar-group-header">
          {t('spaces.sidebar.textChannels')}
        </div>
        <nav className="space-sidebar-channels" aria-label={t('spaces.sidebar.textChannels')}>
          {channels.map((ch) => {
            const unread = unreadByChannel[ch.id];
            return (
              <NavLink
                key={ch.id}
                to={`/s/${slug}/c/${ch.id}`}
                className={navLinkClass}
              >
                <span className="space-sidebar-channel-hash">#</span>
                <span className="space-sidebar-channel-name">{ch.name}</span>
                {unread && unread.unread > 0 && (
                  <span
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
