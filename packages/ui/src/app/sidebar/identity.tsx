import { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '../../components/Sidebar';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';
import { useAuth } from '../../hooks/useAuth';
import { useIdentity } from '../../hooks/useIdentity';
import { IdentityModal } from '../IdentityModal';
import { SuspensionModal } from '../../components/SuspensionModal';

export function AccountFlyout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { isExpanded, closeMobile } = useSidebar();

  const isActive = (path: string) => location.pathname === path;
  const isAccountActive = location.pathname.startsWith('/account');

  const handleLogout = async () => {
    closeMobile();
    await logout();
    navigate('/auth/login');
  };

  const handleNavClick = () => {
    closeMobile();
  };

  return (
    <div className="sidebar-account-flyout-wrapper" data-tour="account">
      <Button
        variant="ghost"
        size="sm"
        className={`sidebar-account-btn ${isAccountActive ? 'sidebar-account-btn-active' : ''}`}
      >
        <Icon name="user" />
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
          <Link to="/account/overview" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/account/overview') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('account.overview.title')}
          </Link>
          <Link to="/account/security" onClick={handleNavClick} className={`sidebar-flyout-item ${location.pathname.startsWith('/account/security') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('account.security.title')}
          </Link>
          <Link to="/account/settings" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/account/settings') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('account.settings.title')}
          </Link>
          <Link to="/account/appearance" onClick={handleNavClick} className={`sidebar-flyout-item ${location.pathname.startsWith('/account/appearance') ? 'sidebar-flyout-item-active' : ''}`} data-tour="appearance-nav">
            {t('account.appearance.title')}
          </Link>
          <div className="sidebar-flyout-divider" />
          <button
            type="button"
            onClick={handleLogout}
            className="sidebar-flyout-item sidebar-flyout-item-logout"
            data-tour="logout"
          >
            <Icon name="logout" />
            {t('nav.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function IdentityFlyout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isExpanded, closeMobile } = useSidebar();
  const { status: identityStatus, identity, logoutFromIdentity, hasIdentity, suspensionInfo, clearSuspension } = useIdentity();
  const [identityModalOpen, setIdentityModalOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;
  const isIdentityActive = location.pathname.startsWith('/identity');
  const isIdentityLoggedIn = identityStatus === 'logged_in' && identity;
  const isIdentityLocked = identityStatus === 'locked' && identity;
  const isIdentitySuspended = identityStatus === 'suspended' && !!suspensionInfo;

  useEffect(() => {
    if (isIdentityLocked) {
      setIdentityModalOpen(true);
    }
  }, [isIdentityLocked]);

  const handleIdentityLogout = async () => {
    closeMobile();
    await logoutFromIdentity();
  };

  const handleNavClick = () => {
    closeMobile();
  };

  const handleLoginClick = () => {
    closeMobile();
    setIdentityModalOpen(true);
  };

  if (isIdentitySuspended) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          className="sidebar-identity-btn"
          disabled
          data-tour="identity"
        >
          <Icon name="mask" />
          <span className="sidebar-identity-label">{t('identity.notLoggedIn')}</span>
        </Button>
        <SuspensionModal info={suspensionInfo} onDismiss={clearSuspension} />
      </>
    );
  }

  if (isIdentityLocked) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLoginClick}
          className="sidebar-identity-btn sidebar-identity-btn-locked"
          data-tour="identity"
        >
          <Icon name="mask" />
          <span className="sidebar-identity-label">{t('identity.unlock.title')}</span>
        </Button>
        <IdentityModal
          isOpen={identityModalOpen}
          onClose={() => setIdentityModalOpen(false)}
          unlockMode={true}
        />
      </>
    );
  }

  if (!isIdentityLoggedIn) {
    const aliasButtonLabel = hasIdentity
      ? t('identity.loginButton')
      : t('identity.createAliasButton');

    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLoginClick}
          className="sidebar-identity-btn"
          data-tour="identity"
        >
          <Icon name="mask" />
          <span className="sidebar-identity-label">{aliasButtonLabel}</span>
        </Button>
        <IdentityModal
          isOpen={identityModalOpen}
          onClose={() => setIdentityModalOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="sidebar-identity-flyout-wrapper" data-tour="identity">
      <Button
        variant="ghost"
        size="sm"
        className={`sidebar-identity-btn ${isIdentityActive ? 'sidebar-identity-btn-active' : ''}`}
      >
        <Icon name="mask" />
        <span className="sidebar-identity-label">
          {identity.displayName}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="sidebar-identity-chevron"
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
      <div className={`sidebar-identity-flyout ${!isExpanded ? 'sidebar-identity-flyout-collapsed' : ''}`}>
        <div className="sidebar-identity-flyout-content">
          <div className="sidebar-identity-flyout-header">
            <span className="sidebar-identity-name">{identity.displayName}</span>
            <span className="sidebar-identity-username">@{identity.username}</span>
          </div>
          <Link to="/identity/profile" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/profile') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('identity.menu.profile')}
          </Link>
          <Link to="/identity/privacy" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/privacy') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('identity.menu.privacy')}
          </Link>
          <Link to="/identity/appearance" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/appearance') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('identity.menu.appearance')}
          </Link>
          <Link to="/identity/ciphers" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/ciphers') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('identity.menu.ciphers')}
          </Link>
          <Link to="/identity/devices" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/devices') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('identity.menu.devices')}
          </Link>
          <div className="sidebar-flyout-divider" />
          <button
            type="button"
            onClick={handleIdentityLogout}
            className="sidebar-flyout-item sidebar-flyout-item-logout"
          >
            <Icon name="logout" />
            {t('identity.logoutButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
