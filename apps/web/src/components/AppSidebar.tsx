import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sidebar,
  SidebarItem,
  SidebarSubItem,
  SidebarDivider,
  SidebarSection,
  Logo,
  Button,
  HomeIcon,
  InfoIcon,
  UserIcon,
  LogoutIcon,
} from '@chadder/ui';
import { useAuth } from '../hooks/useAuth';

/**
 * Main application sidebar with navigation links.
 * Wraps the Sidebar component with app-specific navigation items.
 */
export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login');
  };

  const isActive = (path: string) => location.pathname === path;
  const isAccountActive = location.pathname.startsWith('/account');

  return (
    <Sidebar
      header={<Logo size="sm" />}
      footer={
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="sidebar-logout-btn"
        >
          <LogoutIcon />
          <span className="sidebar-logout-label">{t('nav.logout')}</span>
        </Button>
      }
    >
      <SidebarSection label={t('sidebar.main')}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <SidebarItem
            icon={<HomeIcon />}
            label={t('nav.home')}
            isActive={isActive('/')}
          />
        </Link>
        <Link to="/about" style={{ textDecoration: 'none' }}>
          <SidebarItem
            icon={<InfoIcon />}
            label={t('nav.about')}
            isActive={isActive('/about')}
          />
        </Link>
      </SidebarSection>

      <SidebarDivider />

      <SidebarSection label={t('sidebar.account')}>
        <SidebarItem
          icon={<UserIcon />}
          label={t('nav.account')}
          isActive={isAccountActive}
        >
          <Link to="/account/overview" style={{ textDecoration: 'none' }}>
            <SidebarSubItem
              label={t('account.overview.title')}
              isActive={isActive('/account/overview')}
            />
          </Link>
          <Link to="/account/appearance" style={{ textDecoration: 'none' }}>
            <SidebarSubItem
              label={t('account.appearance.title')}
              isActive={isActive('/account/appearance')}
            />
          </Link>
          <Link to="/account/security" style={{ textDecoration: 'none' }}>
            <SidebarSubItem
              label={t('account.security.title')}
              isActive={isActive('/account/security')}
            />
          </Link>
          <Link to="/account/privacy" style={{ textDecoration: 'none' }}>
            <SidebarSubItem
              label={t('account.privacy.title')}
              isActive={isActive('/account/privacy')}
            />
          </Link>
          <Link to="/account/notifications" style={{ textDecoration: 'none' }}>
            <SidebarSubItem
              label={t('account.notifications.title')}
              isActive={isActive('/account/notifications')}
            />
          </Link>
        </SidebarItem>
      </SidebarSection>
    </Sidebar>
  );
}
