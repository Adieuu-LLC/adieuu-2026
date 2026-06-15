import { useState } from 'react';
import { BottomSheet, type BottomSheetOpenChangeDetails } from '@ark-ui/react/bottom-sheet';
import { Portal } from '@ark-ui/react';
import { useIdentityModal } from '../../hooks/useIdentityModal';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '../../components/Sidebar';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';
import { useAuth, type AuthStatus } from '../../hooks/useAuth';
import type { IdentityStatus } from '../../hooks/useIdentity.types';
import { useIdentity } from '../../hooks/useIdentity';
import { SuspensionModal } from '../../components/SuspensionModal';
import { useIsMobile } from '../../hooks/useIsMobile';

function SupportUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="sidebar-tab-badge" aria-label={`${count} unread support replies`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

function SupportNavLink({
  unreadCount,
  isActive,
  onClick,
  label,
}: {
  unreadCount: number;
  isActive: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Link
      to="/support"
      onClick={onClick}
      className={`sidebar-flyout-item ${isActive ? 'sidebar-flyout-item-active' : ''}`}
    >
      {label}
      {unreadCount > 0 && (
        <span
          className="sidebar-tab-badge"
          style={{ marginLeft: 'auto', position: 'static' }}
          aria-label={`${unreadCount} unread support replies`}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}

/** Account routes and sidebar entry are for account (OTP) sessions only, not while in an active alias context. */
export function isAccountSidebarHidden(authStatus: AuthStatus, identityStatus: IdentityStatus): boolean {
  return (
    authStatus === 'identity_mode' ||
    identityStatus === 'logged_in' ||
    identityStatus === 'locked' ||
    identityStatus === 'suspended'
  );
}

export function AccountFlyout({ supportUnreadCount = 0 }: { supportUnreadCount?: number }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, status: authStatus } = useAuth();
  const { isExpanded, closeMobile } = useSidebar();
  const { status: identityStatus } = useIdentity();
  const isMobile = useIsMobile();
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;
  const isAccountActive = location.pathname.startsWith('/account');

  const handleLogout = async () => {
    setDrawerOpen(false);
    closeMobile();
    await logout();
    navigate('/auth/login');
  };

  const handleNavClick = () => {
    setDrawerOpen(false);
    closeMobile();
  };

  if (isAccountSidebarHidden(authStatus, identityStatus)) {
    return null;
  }

  const menuItems = (
    <>
      <Link to="/account/overview" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/account/overview') ? 'sidebar-flyout-item-active' : ''}`}>
        {t('account.overview.title')}
      </Link>
      <Link to="/account/security" onClick={handleNavClick} className={`sidebar-flyout-item ${location.pathname.startsWith('/account/security') ? 'sidebar-flyout-item-active' : ''}`}>
        {t('account.security.title')}
      </Link>
      <Link to="/account/subscription" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/account/subscription') ? 'sidebar-flyout-item-active' : ''}`}>
        {t('account.subscription.title')}
      </Link>
      <Link to="/account/referrals" onClick={handleNavClick} className={`sidebar-flyout-item ${location.pathname.startsWith('/account/referrals') ? 'sidebar-flyout-item-active' : ''}`}>
        {t('account.referral.title')}
      </Link>
      <SupportNavLink
        unreadCount={supportUnreadCount}
        isActive={location.pathname.startsWith('/support')}
        onClick={handleNavClick}
        label={t('support.title')}
      />
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
    </>
  );

  const triggerButton = (
    <Button
      variant="ghost"
      size="sm"
      className={`sidebar-account-btn ${isAccountActive ? 'sidebar-account-btn-active' : ''}`}
      {...(isMobile ? { onClick: () => setDrawerOpen(true) } : {})}
    >
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <Icon name="user" />
        {supportUnreadCount > 0 && (
          <SupportUnreadBadge count={supportUnreadCount} />
        )}
      </span>
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
  );

  if (isMobile) {
    return (
      <div data-tour="account">
        {triggerButton}
        <BottomSheet.Root
          open={isDrawerOpen}
          onOpenChange={(details: BottomSheetOpenChangeDetails) => setDrawerOpen(details.open)}
          lazyMount
          unmountOnExit
        >
          <Portal>
            <BottomSheet.Backdrop className="sidebar-flyout-drawer-backdrop" />
            <BottomSheet.Content className="sidebar-flyout-drawer-content">
              <BottomSheet.Grabber className="sidebar-flyout-drawer-grabber">
                <BottomSheet.GrabberIndicator className="sidebar-flyout-drawer-grabber-indicator" />
              </BottomSheet.Grabber>
              <BottomSheet.Title className="sidebar-flyout-drawer-title">
                {t('nav.account')}
              </BottomSheet.Title>
              <div className="sidebar-flyout-drawer-items">
                {menuItems}
              </div>
            </BottomSheet.Content>
          </Portal>
        </BottomSheet.Root>
      </div>
    );
  }

  return (
    <div className="sidebar-account-flyout-wrapper" data-tour="account">
      {triggerButton}
      <div className={`sidebar-account-flyout ${!isExpanded ? 'sidebar-account-flyout-collapsed' : ''}`}>
        <div className="sidebar-account-flyout-content">
          {menuItems}
        </div>
      </div>
    </div>
  );
}

export function IdentityFlyout({ supportUnreadCount = 0 }: { supportUnreadCount?: number }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { isExpanded, closeMobile } = useSidebar();
  const { status: identityStatus, identity, logoutFromIdentity, hasIdentity, suspensionInfo, clearSuspension } = useIdentity();
  const { openIdentityModal } = useIdentityModal();
  const isMobile = useIsMobile();
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;
  const isIdentityActive = location.pathname.startsWith('/identity');
  const isIdentityLoggedIn = identityStatus === 'logged_in' && identity;
  const isIdentityLocked = identityStatus === 'locked' && identity;
  const isIdentitySuspended = identityStatus === 'suspended' && !!suspensionInfo;

  const handleIdentityLogout = async () => {
    setDrawerOpen(false);
    closeMobile();
    await logoutFromIdentity();
  };

  const handleNavClick = () => {
    setDrawerOpen(false);
    closeMobile();
  };

  const handleLoginClick = () => {
    closeMobile();
    openIdentityModal();
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
      </>
    );
  }

  const identityHeader = (
    <div className="sidebar-identity-flyout-header">
      <span className="sidebar-identity-name">{identity.displayName}</span>
      <span className="sidebar-identity-username">@{identity.username}</span>
    </div>
  );

  const menuItems = (
    <>
      <Link to="/identity/profile" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/profile') ? 'sidebar-flyout-item-active' : ''}`}>
        {t('identity.menu.profile')}
      </Link>
      <Link to="/identity/privacy" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/privacy') ? 'sidebar-flyout-item-active' : ''}`}>
        {t('identity.menu.privacy')}
      </Link>
      <Link to="/identity/appearance" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/appearance') ? 'sidebar-flyout-item-active' : ''}`}>
        {t('identity.menu.appearance')}
      </Link>
      <Link to="/identity/notifications" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/notifications') ? 'sidebar-flyout-item-active' : ''}`}>
        {t('identity.menu.notifications')}
      </Link>
      <Link to="/identity/ciphers" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/ciphers') ? 'sidebar-flyout-item-active' : ''}`}>
        {t('identity.menu.ciphers')}
      </Link>
      <Link to="/identity/devices" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/devices') ? 'sidebar-flyout-item-active' : ''}`}>
        {t('identity.menu.devices')}
      </Link>
      <Link to="/identity/emojis" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/emojis') ? 'sidebar-flyout-item-active' : ''}`}>
        {t('identity.menu.emojis')}
      </Link>
      <Link to="/identity/subscription" onClick={handleNavClick} className={`sidebar-flyout-item ${location.pathname.startsWith('/identity/subscription') ? 'sidebar-flyout-item-active' : ''}`}>
        {t('identity.menu.subscription')}
      </Link>
      <SupportNavLink
        unreadCount={supportUnreadCount}
        isActive={location.pathname.startsWith('/support')}
        onClick={handleNavClick}
        label={t('support.title')}
      />
      <div className="sidebar-flyout-divider" />
      <button
        type="button"
        onClick={handleIdentityLogout}
        className="sidebar-flyout-item sidebar-flyout-item-logout"
      >
        <Icon name="logout" />
        {t('identity.logoutButton')}
      </button>
    </>
  );

  const triggerButton = (
    <Button
      variant="ghost"
      size="sm"
      className={`sidebar-identity-btn ${isIdentityActive ? 'sidebar-identity-btn-active' : ''}`}
      {...(isMobile ? { onClick: () => setDrawerOpen(true) } : {})}
    >
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <Icon name="mask" />
        {supportUnreadCount > 0 && (
          <SupportUnreadBadge count={supportUnreadCount} />
        )}
      </span>
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
  );

  if (isMobile) {
    return (
      <div data-tour="identity">
        {triggerButton}
        <BottomSheet.Root
          open={isDrawerOpen}
          onOpenChange={(details: BottomSheetOpenChangeDetails) => setDrawerOpen(details.open)}
          lazyMount
          unmountOnExit
        >
          <Portal>
            <BottomSheet.Backdrop className="sidebar-flyout-drawer-backdrop" />
            <BottomSheet.Content className="sidebar-flyout-drawer-content">
              <BottomSheet.Grabber className="sidebar-flyout-drawer-grabber">
                <BottomSheet.GrabberIndicator className="sidebar-flyout-drawer-grabber-indicator" />
              </BottomSheet.Grabber>
              <BottomSheet.Title className="sidebar-flyout-drawer-title">
                {identity.displayName}
              </BottomSheet.Title>
              <p className="sidebar-flyout-drawer-subtitle">
                @{identity.username}
              </p>
              <div className="sidebar-flyout-drawer-items">
                {menuItems}
              </div>
            </BottomSheet.Content>
          </Portal>
        </BottomSheet.Root>
      </div>
    );
  }

  return (
    <div className="sidebar-identity-flyout-wrapper" data-tour="identity">
      {triggerButton}
      <div className={`sidebar-identity-flyout ${!isExpanded ? 'sidebar-identity-flyout-collapsed' : ''}`}>
        <div className="sidebar-identity-flyout-content">
          {identityHeader}
          {menuItems}
        </div>
      </div>
    </div>
  );
}
