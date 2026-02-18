import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sidebar,
  SidebarItem,
  SidebarSubItem,
  SidebarDivider,
  SidebarSection,
} from '../components/Sidebar';
import { Logo } from '../components/Logo';
import { Button } from '../components/Button';
import { HomeIcon, InfoIcon, UserIcon, LogoutIcon, MaskIcon } from '../components/Icons';
import { useAuth } from '../hooks/useAuth';
import { useIdentity } from '../hooks/useIdentity';
import { IdentityModal } from './IdentityModal';

/**
 * Main application sidebar with navigation links.
 * Shared across all platforms (web, desktop, mobile).
 */
export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { status: identityStatus, identity, logoutFromIdentity } = useIdentity();

  const [identityModalOpen, setIdentityModalOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login');
  };

  const handleIdentityLogout = async () => {
    await logoutFromIdentity();
  };

  const isActive = (path: string) => location.pathname === path;
  const isAccountActive = location.pathname.startsWith('/account');

  const isIdentityLoggedIn = identityStatus === 'logged_in' && identity;

  return (
    <>
    <Sidebar
      header={<Logo size="sm" />}
      footer={
        <div className="sidebar-footer-stack">
          {/* Identity Section */}
          <div className="sidebar-identity-section">
            {isIdentityLoggedIn ? (
              <div className="sidebar-identity-info">
                <div className="sidebar-identity-display">
                  <MaskIcon className="sidebar-identity-icon" />
                  <div className="sidebar-identity-details">
                    <span className="sidebar-identity-name">{identity.displayName}</span>
                    <span className="sidebar-identity-username">@{identity.username}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleIdentityLogout}
                  className="sidebar-identity-logout-btn"
                >
                  {t('identity.logoutButton')}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIdentityModalOpen(true)}
                className="sidebar-identity-btn"
                data-tour="identity"
              >
                <MaskIcon />
                <span className="sidebar-identity-label">{t('identity.loginButton')}</span>
              </Button>
            )}
          </div>

          {/* Account Logout Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="sidebar-logout-btn"
            data-tour="logout"
          >
            <LogoutIcon />
            <span className="sidebar-logout-label">{t('nav.logout')}</span>
          </Button>
        </div>
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
          data-tour="account"
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
              isActive={location.pathname.startsWith('/account/security')}
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

    {/* Identity Login/Create Modal */}
    <IdentityModal
      isOpen={identityModalOpen}
      onClose={() => setIdentityModalOpen(false)}
    />
    </>
  );
}
