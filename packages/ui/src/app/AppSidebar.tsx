import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Sidebar,
  SidebarItem,
  SidebarSection,
  useSidebar,
} from '../components/Sidebar';
import { SidebarSearch } from '../components/SidebarSearch';
import { Logo } from '../components/Logo';
import { Button } from '../components/Button';
import { InfoIcon, UserIcon, LogoutIcon, MaskIcon, ShieldIcon, PaletteIcon, DownloadIcon, UsersIcon, CheckIcon, XIcon, SearchIcon } from '../components/Icons';
import { useAppConfig } from '../config';
import { useAuth } from '../hooks/useAuth';
import { useIdentity } from '../hooks/useIdentity';
import { useFriends } from '../hooks/useFriends';
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
 * Friends flyout menu that appears on hover in the sidebar main section.
 * Shows a searchable list of friends with pending requests at the top.
 * Only visible when an identity session is active.
 */
function FriendsFlyout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isExpanded, closeMobile } = useSidebar();
  const { status: identityStatus } = useIdentity();
  const {
    friends,
    incomingRequests,
    incomingRequestCount,
    acceptRequest,
    ignoreRequest,
    searchFriends,
  } = useFriends();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<typeof friends>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isIdentityLoggedIn = identityStatus === 'logged_in';

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);

      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      if (!value.trim() || value.trim().length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      searchTimerRef.current = setTimeout(async () => {
        const results = await searchFriends(value.trim());
        setSearchResults(results);
        setIsSearching(false);
      }, 300);
    },
    [searchFriends]
  );

  const handleAccept = useCallback(
    async (requestId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      await acceptRequest(requestId);
    },
    [acceptRequest]
  );

  const handleIgnore = useCallback(
    async (requestId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      await ignoreRequest(requestId);
    },
    [ignoreRequest]
  );

  const handleNavToProfile = useCallback(
    (identityId: string) => {
      closeMobile();
      navigate(`/identity/${identityId}`);
    },
    [closeMobile, navigate]
  );

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  if (!isIdentityLoggedIn) return null;

  const displayedFriends = searchQuery.trim().length >= 2 ? searchResults : friends;
  const hasRequests = incomingRequestCount > 0;

  const buttonLabel = hasRequests
    ? t('nav.friendRequests', { count: incomingRequestCount })
    : t('nav.friends');

  return (
    <div className="sidebar-friends-flyout-wrapper">
      <SidebarItem
        icon={<UsersIcon />}
        label={buttonLabel}
      />
      <div className={`sidebar-friends-flyout ${!isExpanded ? 'sidebar-friends-flyout-collapsed' : ''}`}>
        <div className="sidebar-friends-flyout-content">
          <div className="sidebar-friends-flyout-search">
            <span className="sidebar-friends-flyout-search-icon"><SearchIcon /></span>
            <input
              type="text"
              className="sidebar-friends-flyout-search-input"
              placeholder={t('friends.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {isSearching && <span className="spinner spinner-sm" />}
          </div>

          <div className="sidebar-friends-flyout-list">
            {/* Pending requests */}
            {incomingRequests.length > 0 && !searchQuery && (
              <div className="sidebar-friends-flyout-section">
                <span className="sidebar-friends-flyout-section-label">
                  {t('friends.incomingRequests')}
                </span>
                {incomingRequests.map((req) => (
                  <div key={req.request.id} className="sidebar-friends-flyout-item sidebar-friends-flyout-item-request">
                    <button
                      type="button"
                      className="sidebar-friends-flyout-item-info"
                      onClick={() => handleNavToProfile(req.fromIdentity.id)}
                    >
                      <div className="sidebar-friends-flyout-item-avatar">
                        {req.fromIdentity.avatarUrl ? (
                          <img src={req.fromIdentity.avatarUrl} alt="" className="sidebar-friends-flyout-item-avatar-img" />
                        ) : (
                          <span className="sidebar-friends-flyout-item-avatar-placeholder">
                            {req.fromIdentity.displayName.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="sidebar-friends-flyout-item-text">
                        <span className="sidebar-friends-flyout-item-name">{req.fromIdentity.displayName}</span>
                        <span className="sidebar-friends-flyout-item-username">@{req.fromIdentity.username}</span>
                      </div>
                    </button>
                    <div className="sidebar-friends-flyout-item-actions">
                      <button
                        type="button"
                        className="sidebar-friends-flyout-action-btn sidebar-friends-flyout-action-accept"
                        onClick={(e) => handleAccept(req.request.id, e)}
                        title={t('friends.accept')}
                      >
                        <CheckIcon />
                      </button>
                      <button
                        type="button"
                        className="sidebar-friends-flyout-action-btn sidebar-friends-flyout-action-ignore"
                        onClick={(e) => handleIgnore(req.request.id, e)}
                        title={t('friends.ignore')}
                      >
                        <XIcon />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Friends list */}
            {displayedFriends.length > 0 && (
              <div className="sidebar-friends-flyout-section">
                {incomingRequests.length > 0 && !searchQuery && (
                  <span className="sidebar-friends-flyout-section-label">
                    {t('friends.title')}
                  </span>
                )}
                {displayedFriends.map((friend) => (
                  <button
                    key={friend.identity.id}
                    type="button"
                    className="sidebar-friends-flyout-item"
                    onClick={() => handleNavToProfile(friend.identity.id)}
                  >
                    <div className="sidebar-friends-flyout-item-avatar">
                      {friend.identity.avatarUrl ? (
                        <img src={friend.identity.avatarUrl} alt="" className="sidebar-friends-flyout-item-avatar-img" />
                      ) : (
                        <span className="sidebar-friends-flyout-item-avatar-placeholder">
                          {friend.identity.displayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="sidebar-friends-flyout-item-text">
                      <span className="sidebar-friends-flyout-item-name">{friend.identity.displayName}</span>
                      <span className="sidebar-friends-flyout-item-username">@{friend.identity.username}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Empty states */}
            {displayedFriends.length === 0 && incomingRequests.length === 0 && !searchQuery && (
              <div className="sidebar-friends-flyout-empty">
                {t('friends.noFriends')}
              </div>
            )}
            {displayedFriends.length === 0 && searchQuery.trim().length >= 2 && !isSearching && (
              <div className="sidebar-friends-flyout-empty">
                {t('search.noResults')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Navigation content component that has access to sidebar context.
 */
function SidebarNavContent() {
  const { t } = useTranslation();
  const location = useLocation();
  const { closeMobile } = useSidebar();

  const isActive = (path: string) => location.pathname === path;

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
        <FriendsFlyout />
      </SidebarSection>
    </>
  );
}

/**
 * Footer content component that has access to sidebar context.
 */
function SidebarFooterContent() {
  const { t } = useTranslation();
  const { platform } = useAppConfig();
  const { session } = useAuth();
  const location = useLocation();
  const { closeMobile } = useSidebar();
  const showAdmin = session?.isPlatformAdmin === true;
  const isAdminActive = location.pathname.startsWith('/admin');
  const isDownloadActive = location.pathname === '/download';
  const showDesktopAppLink = platform === 'web';

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
      {showDesktopAppLink && (
        <div className="sidebar-desktop-row">
          <Link
            to="/download"
            className={`sidebar-desktop-link${isDownloadActive ? ' sidebar-desktop-link-active' : ''}`}
            onClick={closeMobile}
          >
            <DownloadIcon />
            <span className="sidebar-desktop-label">{t('nav.getDesktopApp')}</span>
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
