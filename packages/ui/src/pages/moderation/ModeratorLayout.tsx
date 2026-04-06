import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Nested moderator shell: secondary sidebar + main content area.
 * Mirrors the AdminLayout pattern.
 */
export function ModeratorLayout() {
  const { t } = useTranslation();

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `admin-nav-link${isActive ? ' admin-nav-link-active' : ''}`;

  return (
    <div className="admin-shell">
      <aside className="admin-sub-sidebar" aria-label={t('moderation.nav.link')}>
        <nav className="admin-sub-nav">
          <NavLink to="/moderation/reports" className={navClass}>
            {t('moderation.nav.reports')}
          </NavLink>
        </nav>
      </aside>
      <div className="admin-outlet">
        <Outlet />
      </div>
    </div>
  );
}
