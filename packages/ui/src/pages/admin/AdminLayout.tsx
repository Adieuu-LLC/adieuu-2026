import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';

/**
 * Nested admin shell: secondary sidebar + main content.
 */
export function AdminLayout() {
  const { t } = useTranslation();

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `admin-nav-link${isActive ? ' admin-nav-link-active' : ''}`;

  return (
    <div className="admin-shell">
      <aside className="admin-sub-sidebar" aria-label={t('admin.nav.link')}>
        <nav className="admin-sub-nav">
          <NavLink to="/admin/dashboard" className={navClass}>
            {t('admin.nav.dashboard')}
          </NavLink>
          <NavLink to="/admin/platform-admins" className={navClass}>
            {t('admin.nav.platformAdmins')}
          </NavLink>
          <NavLink to="/admin/auth-allowlist" className={navClass}>
            {t('admin.nav.authAllowlist')}
          </NavLink>
          <NavLink to="/admin/age-verification" className={navClass}>
            {t('admin.nav.ageVerification', 'Age/Geofencing')}
          </NavLink>
          <NavLink to="/admin/spaces" className={navClass}>
            {t('admin.nav.spaces')}
          </NavLink>
          <NavLink to="/admin/users" className={navClass}>
            {t('admin.nav.userManagement')}
          </NavLink>
          <NavLink to="/admin/identities" className={navClass}>
            {t('admin.nav.identityManagement')}
          </NavLink>
          <NavLink to="/admin/promo-codes" className={navClass}>
            {t('admin.nav.promoCodes')}
          </NavLink>
          <NavLink to="/admin/announcements" className={navClass}>
            {t('admin.nav.announcements')}
          </NavLink>
        </nav>
      </aside>
      <div className="admin-outlet">
        <Outlet />
      </div>
    </div>
  );
}
