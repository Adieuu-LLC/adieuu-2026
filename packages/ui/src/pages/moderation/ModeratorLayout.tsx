import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';

/**
 * Nested moderator shell: secondary sidebar + main content area.
 * Mirrors the AdminLayout pattern.
 */
export function ModeratorLayout() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const permissions = session?.platformPermissions ?? [];

  const canReports =
    permissions.includes('read-content-reports') ||
    permissions.includes('read-abuse-reports');
  const canTickets = permissions.includes('read-support-tickets');

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `admin-nav-link${isActive ? ' admin-nav-link-active' : ''}`;

  return (
    <div className="admin-shell">
      <aside className="admin-sub-sidebar" aria-label={t('moderation.nav.link')}>
        <nav className="admin-sub-nav">
          {canTickets && (
            <NavLink to="/moderation/tickets" className={navClass}>
              {t('moderation.nav.tickets')}
            </NavLink>
          )}
          {canReports && (
            <NavLink to="/moderation/reports" className={navClass}>
              {t('moderation.nav.reports')}
            </NavLink>
          )}
        </nav>
      </aside>
      <div className="admin-outlet">
        <Outlet />
      </div>
    </div>
  );
}
