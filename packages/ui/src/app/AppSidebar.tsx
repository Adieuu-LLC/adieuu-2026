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
import { SidebarTabs, type SidebarTab } from '../components/SidebarTabs';
import { Logo } from '../components/Logo';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { InfoIcon, UserIcon, LogoutIcon, MaskIcon, ShieldIcon, PaletteIcon, DownloadIcon, UsersIcon, CheckIcon, XIcon, SearchIcon, MessageIcon, PlusIcon, SpacesIcon } from '../components/Icons';
import { HoverCard } from '../components/HoverCard';
import { useAppConfig } from '../config';
import { useAuth } from '../hooks/useAuth';
import { useIdentity } from '../hooks/useIdentity';
import { useFriends } from '../hooks/useFriends';
import { IdentityModal } from './IdentityModal';
import { useConversations, type DecryptedConversation } from '../hooks/useConversations';
import type { PublicIdentity } from '@adieuu/shared';

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
 * Toggle button for the friends panel in the sidebar nav.
 * Displays "Friends" or "X Friend Requests" based on incoming request count.
 */
function FriendsSidebarButton({
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { status: identityStatus } = useIdentity();
  const { incomingRequestCount } = useFriends();

  const isIdentityLoggedIn = identityStatus === 'logged_in';
  if (!isIdentityLoggedIn) return null;

  const hasRequests = incomingRequestCount > 0;
  const buttonLabel = hasRequests
    ? t('nav.friendRequests', { count: incomingRequestCount })
    : t('nav.friends');

  return (
    <SidebarItem
      icon={<UsersIcon />}
      label={buttonLabel}
      onClick={onToggle}
      isActive={isOpen}
    />
  );
}

/**
 * Profile hover card that appears when hovering over a friend or request item.
 * Shows identity details and contextual actions.
 */
function FriendProfileHoverCard({
  identity,
  children,
  actions,
  onNavigate,
}: {
  identity: PublicIdentity;
  children: React.ReactElement;
  actions: React.ReactNode;
  onNavigate: (identityId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <HoverCard
      trigger={children}
      positioning={{ placement: 'right', gutter: 8 }}
      className="friend-hover-card"
      openDelay={300}
      closeDelay={200}
    >
      <div className="friend-hover-card-header">
        <div className="friend-hover-card-avatar">
          {identity.avatarUrl ? (
            <img src={identity.avatarUrl} alt="" className="friend-hover-card-avatar-img" />
          ) : (
            <span className="friend-hover-card-avatar-placeholder">
              {identity.displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="friend-hover-card-info">
          <span className="friend-hover-card-name">{identity.displayName}</span>
          <span className="friend-hover-card-username">@{identity.username}</span>
        </div>
      </div>
      {identity.bio && (
        <p className="friend-hover-card-bio">{identity.bio}</p>
      )}
      <div className="friend-hover-card-actions">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onNavigate(identity.id)}
        >
          {t('friends.viewProfile')}
        </Button>
        {actions}
      </div>
    </HoverCard>
  );
}

/**
 * Secondary sidebar panel for friends list and friend requests.
 * Renders inside the sidebar's panel slot (outside sidebar-nav)
 * so it is not clipped by overflow settings.
 */
function FriendsPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closeMobile } = useSidebar();
  const {
    friends,
    incomingRequests,
    acceptRequest,
    ignoreRequest,
    removeFriend,
    searchFriends: searchFriendsFn,
  } = useFriends();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<typeof friends>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
        const results = await searchFriendsFn(value.trim());
        setSearchResults(results);
        setIsSearching(false);
      }, 300);
    },
    [searchFriendsFn]
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

  const handleRemoveFriend = useCallback(
    async (identityId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      await removeFriend(identityId);
    },
    [removeFriend]
  );

  const handleNavToProfile = useCallback(
    (identityId: string) => {
      closeMobile();
      onClose();
      navigate(`/identity/${identityId}`);
    },
    [closeMobile, onClose, navigate]
  );

  // Close on Escape or click outside the panel
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        const hoverCard = (target as Element).closest?.('.hover-card-content');
        if (hoverCard) return;
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Reset search when panel closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [isOpen]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const displayedFriends = searchQuery.trim().length >= 2 ? searchResults : friends;

  return (
    <div className="sidebar-friends-panel" ref={panelRef}>
      <div className="sidebar-friends-panel-header">
        <span className="sidebar-friends-panel-title">{t('friends.title')}</span>
        <Button
          variant="ghost"
          size="sm"
          className="sidebar-friends-panel-close"
          onClick={onClose}
          aria-label={t('friends.close')}
        >
          <XIcon />
        </Button>
      </div>

      <div className="sidebar-friends-panel-search">
        <Input
          inputSize="sm"
          leftIcon={<SearchIcon />}
          rightIcon={isSearching ? <span className="spinner spinner-sm" /> : undefined}
          placeholder={t('friends.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="sidebar-friends-panel-search-input"
        />
      </div>

      <div className="sidebar-friends-panel-list">
        {incomingRequests.length > 0 && !searchQuery && (
          <div className="sidebar-friends-panel-section">
            <span className="sidebar-friends-panel-section-label">
              {t('friends.incomingRequests')}
            </span>
            {incomingRequests.map((req) => (
              <FriendProfileHoverCard
                key={req.request.id}
                identity={req.fromIdentity}
                onNavigate={handleNavToProfile}
                actions={
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={(e) => handleAccept(req.request.id, e)}
                    >
                      <CheckIcon />
                      {t('friends.accept')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleIgnore(req.request.id, e)}
                    >
                      <XIcon />
                      {t('friends.ignore')}
                    </Button>
                  </>
                }
              >
                <div className="sidebar-friends-panel-item sidebar-friends-panel-item-request">
                  <button
                    type="button"
                    className="sidebar-friends-panel-item-info"
                    onClick={() => handleNavToProfile(req.fromIdentity.id)}
                  >
                    <div className="sidebar-friends-panel-item-avatar">
                      {req.fromIdentity.avatarUrl ? (
                        <img src={req.fromIdentity.avatarUrl} alt="" className="sidebar-friends-panel-item-avatar-img" />
                      ) : (
                        <span className="sidebar-friends-panel-item-avatar-placeholder">
                          {req.fromIdentity.displayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="sidebar-friends-panel-item-text">
                      <span className="sidebar-friends-panel-item-name">{req.fromIdentity.displayName}</span>
                      <span className="sidebar-friends-panel-item-username">@{req.fromIdentity.username}</span>
                    </div>
                  </button>
                  <div className="sidebar-friends-panel-item-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="sidebar-friends-panel-action-btn sidebar-friends-panel-action-accept"
                      onClick={(e) => handleAccept(req.request.id, e)}
                      title={t('friends.accept')}
                    >
                      <CheckIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="sidebar-friends-panel-action-btn sidebar-friends-panel-action-ignore"
                      onClick={(e) => handleIgnore(req.request.id, e)}
                      title={t('friends.ignore')}
                    >
                      <XIcon />
                    </Button>
                  </div>
                </div>
              </FriendProfileHoverCard>
            ))}
          </div>
        )}

        {displayedFriends.length > 0 && (
          <div className="sidebar-friends-panel-section">
            {incomingRequests.length > 0 && !searchQuery && (
              <span className="sidebar-friends-panel-section-label">
                {t('friends.title')}
              </span>
            )}
            {displayedFriends.map((friend) => (
              <FriendProfileHoverCard
                key={friend.identity.id}
                identity={friend.identity}
                onNavigate={handleNavToProfile}
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleRemoveFriend(friend.identity.id, e)}
                  >
                    <XIcon />
                    {t('friends.remove')}
                  </Button>
                }
              >
                <button
                  type="button"
                  className="sidebar-friends-panel-item"
                  onClick={() => handleNavToProfile(friend.identity.id)}
                >
                  <div className="sidebar-friends-panel-item-avatar">
                    {friend.identity.avatarUrl ? (
                      <img src={friend.identity.avatarUrl} alt="" className="sidebar-friends-panel-item-avatar-img" />
                    ) : (
                      <span className="sidebar-friends-panel-item-avatar-placeholder">
                        {friend.identity.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="sidebar-friends-panel-item-text">
                    <span className="sidebar-friends-panel-item-name">{friend.identity.displayName}</span>
                    <span className="sidebar-friends-panel-item-username">@{friend.identity.username}</span>
                  </div>
                </button>
              </FriendProfileHoverCard>
            ))}
          </div>
        )}

        {displayedFriends.length === 0 && incomingRequests.length === 0 && !searchQuery && (
          <div className="sidebar-friends-panel-empty">
            {t('friends.noFriends')}
          </div>
        )}
        {displayedFriends.length === 0 && searchQuery.trim().length >= 2 && !isSearching && (
          <div className="sidebar-friends-panel-empty">
            {t('search.noResults')}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Logo that switches between the full wordmark and the icon-only chat-bubble
 * mark depending on whether the sidebar is expanded or collapsed.
 * Must be rendered inside the SidebarContext provider.
 */
function SidebarLogo() {
  const { t } = useTranslation();
  const { isExpanded } = useSidebar();

  return (
    <Link to="/" className="app-logo-link" aria-label={t('nav.home')}>
      <Logo size="sm" variant={isExpanded ? 'full' : 'icon'} />
    </Link>
  );
}

/**
 * Renders a single conversation list item in the sidebar.
 * Uses the existing .conversation-list-item CSS pattern.
 */
function ConversationListItem({ conversation }: { conversation: DecryptedConversation }) {
  const { identity } = useIdentity();
  const { activeConversationId, setActiveConversation, participantProfiles } = useConversations();
  const navigate = useNavigate();
  const { closeMobile } = useSidebar();

  const isActive = activeConversationId === conversation.id;

  const displayName = conversation.type === 'group'
    ? (conversation.decryptedName ?? 'Group')
    : conversation.participants
        .filter((p) => p !== identity?.id)
        .map((p) => {
          const profile = participantProfiles[p];
          return profile?.displayName ?? profile?.username ?? p;
        })
        .join(', ');

  const initial = displayName.charAt(0).toUpperCase();

  const handleClick = () => {
    setActiveConversation(conversation.id);
    navigate(`/conversations/${conversation.id}`);
    closeMobile();
  };

  return (
    <button
      type="button"
      className={`conversation-list-item${isActive ? ' conversation-list-item-active' : ''}`}
      onClick={handleClick}
    >
      <div className="conversation-list-item-avatar">
        <span className="conversation-list-item-avatar-placeholder">{initial}</span>
      </div>
      <div className="conversation-list-item-info">
        <span className="conversation-list-item-title">{displayName}</span>
        {conversation.type === 'group' && (
          <span className="conversation-list-item-members">
            {conversation.participants.length} members
          </span>
        )}
      </div>
      {conversation.unreadCount > 0 && (
        <span className="conversation-list-item-badge">{conversation.unreadCount}</span>
      )}
    </button>
  );
}

/**
 * Conversations section in the sidebar with Conversations/Spaces tabs.
 * Uses the SidebarTabs component for polished icon tabs.
 */
function ConversationsSidebarSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversations, invites, loading, acceptInvite, declineInvite, participantProfiles } = useConversations();
  const { closeMobile } = useSidebar();
  const [activeTab, setActiveTab] = useState('conversations');
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);

  const handleAcceptInvite = useCallback(async (inviteId: string) => {
    setProcessingInvite(inviteId);
    await acceptInvite(inviteId);
    setProcessingInvite(null);
  }, [acceptInvite]);

  const handleDeclineInvite = useCallback(async (inviteId: string) => {
    setProcessingInvite(inviteId);
    await declineInvite(inviteId);
    setProcessingInvite(null);
  }, [declineInvite]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const tabs: SidebarTab[] = [
    {
      id: 'conversations',
      icon: <MessageIcon />,
      label: t('sidebar.conversationsTab', 'Conversations'),
      badge: totalUnread + invites.length,
    },
    {
      id: 'spaces',
      icon: <SpacesIcon />,
      label: t('sidebar.spacesTab', 'Spaces'),
    },
  ];

  const handleNewConversation = () => {
    navigate('/conversations/new');
    closeMobile();
  };

  return (
    <div className="sidebar-tabs-section">
      <SidebarTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="sidebar-tab-content">
        {activeTab === 'conversations' && (
          <>
            <SidebarItem
              icon={<PlusIcon />}
              label={t('sidebar.newConversation', 'New Conversation')}
              onClick={handleNewConversation}
            />

            {invites.length > 0 && (
              <div className="sidebar-invites-section">
                <span className="sidebar-invites-label">
                  {t('conversations.invites.title', 'Pending Invites')}
                </span>
                {invites.map((invite) => {
                  const inviterProfile = participantProfiles[invite.invitedByIdentityId];
                  const inviterName = inviterProfile?.displayName ?? inviterProfile?.username;
                  const isProcessing = processingInvite === invite.id;

                  return (
                    <div key={invite.id} className="sidebar-invite-item">
                      <div className="sidebar-invite-item-info">
                        <span className="sidebar-invite-item-name">
                          {invite.groupName || t('conversations.invites.group', 'Group')}
                        </span>
                        <span className="sidebar-invite-item-meta">
                          {inviterName
                            ? t('conversations.invites.invitedBy', { name: inviterName, defaultValue: `From ${inviterName}` })
                            : t('conversations.invites.memberCount', { count: invite.memberCount, defaultValue: `${invite.memberCount} members` })}
                        </span>
                      </div>
                      <div className="sidebar-invite-item-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="sidebar-invite-action-btn sidebar-invite-action-accept"
                          onClick={() => void handleAcceptInvite(invite.id)}
                          disabled={isProcessing}
                          title={t('conversations.invites.accept', 'Accept')}
                        >
                          {isProcessing ? <span className="spinner spinner-sm" /> : <CheckIcon />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="sidebar-invite-action-btn sidebar-invite-action-decline"
                          onClick={() => void handleDeclineInvite(invite.id)}
                          disabled={isProcessing}
                          title={t('conversations.invites.decline', 'Decline')}
                        >
                          <XIcon />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {loading && conversations.length === 0 && (
              <div className="sidebar-conversations-loading">
                <span className="spinner spinner-sm" />
              </div>
            )}

            <div className="sidebar-conversations-list">
              {conversations.map((conv) => (
                <ConversationListItem key={conv.id} conversation={conv} />
              ))}

              {!loading && conversations.length === 0 && (
                <div className="sidebar-conversations-empty">
                  {t('sidebar.noConversations', 'No conversations yet')}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'spaces' && (
          <div className="sidebar-conversations-empty">
            {t('sidebar.spacesComingSoon', 'Spaces coming soon')}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Navigation content component that has access to sidebar context.
 */
function SidebarNavContent({
  isFriendsPanelOpen,
  onToggleFriendsPanel,
}: {
  isFriendsPanelOpen: boolean;
  onToggleFriendsPanel: () => void;
}) {
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
        <FriendsSidebarButton
          isOpen={isFriendsPanelOpen}
          onToggle={onToggleFriendsPanel}
        />
      </SidebarSection>
      <ConversationsSidebarSection />
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
  const [isFriendsPanelOpen, setFriendsPanelOpen] = useState(false);

  const handleToggleFriendsPanel = useCallback(() => {
    setFriendsPanelOpen((prev) => !prev);
  }, []);

  const handleCloseFriendsPanel = useCallback(() => {
    setFriendsPanelOpen(false);
  }, []);

  return (
    <Sidebar
      header={<SidebarLogo />}
      footer={<SidebarFooterContent />}
      panel={
        <FriendsPanel
          isOpen={isFriendsPanelOpen}
          onClose={handleCloseFriendsPanel}
        />
      }
      onExpandedChange={onExpandedChange}
    >
      <SidebarNavContent
        isFriendsPanelOpen={isFriendsPanelOpen}
        onToggleFriendsPanel={handleToggleFriendsPanel}
      />
    </Sidebar>
  );
}
