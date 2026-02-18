import { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sidebar,
  SidebarItem,
  SidebarSection,
  useSidebar,
} from '../components/Sidebar';
import { Logo } from '../components/Logo';
import { Button } from '../components/Button';
import { HomeIcon, InfoIcon, UserIcon, LogoutIcon, MaskIcon } from '../components/Icons';
import { useAuth } from '../hooks/useAuth';
import { useIdentity } from '../hooks/useIdentity';
import { IdentityModal } from './IdentityModal';

/**
 * Account flyout menu that appears on hover in the sidebar footer.
 * Shows account navigation links and logout option.
 */
function AccountFlyout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { isExpanded } = useSidebar();

  const isActive = (path: string) => location.pathname === path;
  const isAccountActive = location.pathname.startsWith('/account');

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login');
  };

  return (
    <div className="sidebar-account-flyout-wrapper" data-tour="account">
      <Button
        variant="ghost"
        size="sm"
        className={`sidebar-account-btn ${isAccountActive ? 'sidebar-account-btn-active' : ''}`}
      >
        <UserIcon />
        <span className="sidebar-account-label">{t('nav.account')}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="sidebar-account-chevron"
        >
          <path
            d="M4.5 3L7.5 6L4.5 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Button>
      <div className={`sidebar-account-flyout ${!isExpanded ? 'sidebar-account-flyout-collapsed' : ''}`}>
        <div className="sidebar-account-flyout-content">
          <Link to="/account/overview" className={`sidebar-flyout-item ${isActive('/account/overview') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('account.overview.title')}
          </Link>
          <Link to="/account/appearance" className={`sidebar-flyout-item ${isActive('/account/appearance') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('account.appearance.title')}
          </Link>
          <Link to="/account/security" className={`sidebar-flyout-item ${location.pathname.startsWith('/account/security') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('account.security.title')}
          </Link>
          <Link to="/account/privacy" className={`sidebar-flyout-item ${isActive('/account/privacy') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('account.privacy.title')}
          </Link>
          <Link to="/account/notifications" className={`sidebar-flyout-item ${isActive('/account/notifications') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('account.notifications.title')}
          </Link>
          <div className="sidebar-flyout-divider" />
          <button
            type="button"
            onClick={handleLogout}
            className="sidebar-flyout-item sidebar-flyout-item-logout"
          >
            <LogoutIcon />
            {t('nav.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Main application sidebar with navigation links.
 * Shared across all platforms (web, desktop, mobile).
 */
export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { status: identityStatus, identity, logoutFromIdentity } = useIdentity();

  const [identityModalOpen, setIdentityModalOpen] = useState(false);

  const handleIdentityLogout = async () => {
    await logoutFromIdentity();
  };

  const isActive = (path: string) => location.pathname === path;

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

          {/* Account Menu with Flyout */}
          <AccountFlyout />
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

    </Sidebar>

    {/* Identity Login/Create Modal */}
    <IdentityModal
      isOpen={identityModalOpen}
      onClose={() => setIdentityModalOpen(false)}
    />
    </>
  );
}
