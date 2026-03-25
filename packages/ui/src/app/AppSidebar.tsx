import { useState, useEffect, useMemo } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sidebar,
  SidebarItem,
  SidebarSection,
  useSidebar,
} from '../components/Sidebar';
import { SidebarSearch } from '../components/SidebarSearch';
import { SidebarTabs, type SidebarTab } from '../components/SidebarTabs';
import { SidebarFriendsList } from '../components/SidebarFriendsList';
import { SidebarConversationsList } from '../components/SidebarConversationsList';
import { Logo } from '../components/Logo';
import { Button } from '../components/Button';
import { InfoIcon, UserIcon, LogoutIcon, MaskIcon, UsersIcon, MessageIcon, SpacesIcon, ShieldIcon, PaletteIcon } from '../components/Icons';
import { useAuth } from '../hooks/useAuth';
import { useIdentity } from '../hooks/useIdentity';
import { useConversationsContext } from '../hooks/ConversationsProvider';
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
          <Link to="/account/overview" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/account/overview') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('account.overview.title')}
          </Link>
          <Link to="/account/security" onClick={handleNavClick} className={`sidebar-flyout-item ${location.pathname.startsWith('/account/security') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('account.security.title')}
          </Link>
          <Link to="/account/settings" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/account/settings') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('account.settings.title')}
          </Link>
          <Link to="/account/appearance" onClick={handleNavClick} className={`sidebar-flyout-item ${location.pathname.startsWith('/account/appearance') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('account.appearance.title')}
          </Link>
          <div className="sidebar-flyout-divider" />
          <button
            type="button"
            onClick={handleLogout}
            className="sidebar-flyout-item sidebar-flyout-item-logout"
            data-tour="logout"
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
 * Identity flyout menu that appears on hover in the sidebar footer.
 * Shows identity navigation links and logout option when logged in,
 * or login button when not logged in.
 */
function IdentityFlyout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isExpanded, closeMobile } = useSidebar();
  const { status: identityStatus, identity, logoutFromIdentity } = useIdentity();
  const [identityModalOpen, setIdentityModalOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;
  const isIdentityActive = location.pathname.startsWith('/identity');
  const isIdentityLoggedIn = identityStatus === 'logged_in' && identity;
  const isIdentityLocked = identityStatus === 'locked' && identity;

  // Auto-open unlock modal when identity is locked (e.g., after page refresh)
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

  // When locked, show locked button and auto-open unlock modal
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
          <MaskIcon />
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

  // When not logged in, show a simple button to open the identity modal
  if (!isIdentityLoggedIn) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLoginClick}
          className="sidebar-identity-btn"
          data-tour="identity"
        >
          <MaskIcon />
          <span className="sidebar-identity-label">{t('identity.loginButton')}</span>
        </Button>
        <IdentityModal
          isOpen={identityModalOpen}
          onClose={() => setIdentityModalOpen(false)}
        />
      </>
    );
  }

  // When logged in, show the flyout menu
  return (
    <div className="sidebar-identity-flyout-wrapper" data-tour="identity">
      <Button
        variant="ghost"
        size="sm"
        className={`sidebar-identity-btn ${isIdentityActive ? 'sidebar-identity-btn-active' : ''}`}
      >
        <MaskIcon />
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
          <Link to="/identity/friends" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/friends') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('identity.menu.friends')}
          </Link>
          <Link to="/identity/content" onClick={handleNavClick} className={`sidebar-flyout-item ${isActive('/identity/content') ? 'sidebar-flyout-item-active' : ''}`}>
            {t('identity.menu.contentSocial')}
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
            <LogoutIcon />
            {t('identity.logoutButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Placeholder content for tabs that are coming soon.
 */
function ComingSoonPlaceholder({ label }: { label: string }) {
  const { t } = useTranslation();
  const { isExpanded } = useSidebar();

  return (
    <div className="sidebar-coming-soon">
      {isExpanded && (
        <p>{t('sidebar.comingSoon', { feature: label })}</p>
      )}
    </div>
  );
}

/**
 * Navigation content component that has access to sidebar context.
 *
 * All tab panels are kept mounted so their hooks (WS subscriptions, polling)
 * stay active regardless of the visible tab. Inactive panels are hidden
 * with `display: none` so they have zero layout/paint cost.
 */
function SidebarNavContent() {
  const { t } = useTranslation();
  const location = useLocation();
  const { closeMobile, isExpanded } = useSidebar();
  const [activeTab, setActiveTab] = useState('friends');
  const { dmConversations } = useConversationsContext();

  // Auto-switch to conversations tab when viewing a conversation
  useEffect(() => {
    if (location.pathname.startsWith('/conversation/')) {
      setActiveTab('conversations');
    }
  }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const unreadConversationCount = useMemo(
    () => dmConversations.filter((c) => c.hasUnread).length,
    [dmConversations]
  );

  const tabs: SidebarTab[] = useMemo(
    () => [
      { id: 'friends', icon: <UsersIcon />, label: t('sidebar.tabs.friends') },
      { id: 'conversations', icon: <MessageIcon />, label: t('sidebar.tabs.conversations'), badge: unreadConversationCount },
      { id: 'spaces', icon: <SpacesIcon />, label: t('sidebar.tabs.spaces') },
    ],
    [t, unreadConversationCount]
  );

  return (
    <>
      <div className="sidebar-search-section" data-tour="search">
        <SidebarSearch />
      </div>
      <SidebarSection label={t('sidebar.main')}>
        <Link to="/about" style={{ textDecoration: 'none' }} onClick={closeMobile}>
          <SidebarItem
            icon={<InfoIcon />}
            label={t('nav.about')}
            isActive={isActive('/about')}
          />
        </Link>
      </SidebarSection>

      <div className="sidebar-tabs-section" data-tour="sidebar-tabs">
        <SidebarTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="sidebar-tab-content">
          <div className={activeTab !== 'friends' ? 'sidebar-tab-panel-hidden' : undefined}>
            <SidebarFriendsList />
          </div>
          <div className={activeTab !== 'conversations' ? 'sidebar-tab-panel-hidden' : undefined}>
            <SidebarConversationsList />
          </div>
          <div className={activeTab !== 'spaces' ? 'sidebar-tab-panel-hidden' : undefined}>
            <ComingSoonPlaceholder label={t('sidebar.tabs.spaces')} />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Footer content component that has access to sidebar context.
 */
function SidebarFooterContent() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const location = useLocation();
  const { closeMobile } = useSidebar();
  const showAdmin = session?.isPlatformAdmin === true;
  const isAdminActive = location.pathname.startsWith('/admin');

  return (
    <div className="sidebar-footer-stack">
      {showAdmin && (
        <div className="sidebar-admin-row">
          <Link
            to="/admin"
            className={`sidebar-admin-link sidebar-admin-link-btn${isAdminActive ? ' sidebar-admin-link-active' : ''}`}
            onClick={closeMobile}
          >
            <ShieldIcon />
            <span className="sidebar-admin-label">{t('admin.nav.link')}</span>
          </Link>
        </div>
      )}
      {/* Identity Menu with Flyout */}
      <div className="sidebar-identity-section">
        <div className="sidebar-identity-row">
          <IdentityFlyout />
        </div>
      </div>

      {/* Account Menu with Flyout */}
      <AccountFlyout />
    </div>
  );
}

/**
 * Main application sidebar with navigation links.
 * Shared across all platforms (web, desktop, mobile).
 */
interface AppSidebarProps {
  onExpandedChange?: (expanded: boolean) => void;
}

export function AppSidebar({ onExpandedChange }: AppSidebarProps) {
  const { t } = useTranslation();
  return (
    <Sidebar
      header={
        <Link to="/" className="app-logo-link" aria-label={t('nav.home')}>
          <Logo size="sm" />
        </Link>
      }
      footer={<SidebarFooterContent />}
      onExpandedChange={onExpandedChange}
    >
      <SidebarNavContent />
    </Sidebar>
  );
}
