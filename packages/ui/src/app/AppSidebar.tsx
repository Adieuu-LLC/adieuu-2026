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
import { Icon } from '../icons/Icon';
import { HoverCard } from '../components/HoverCard';
import { IdentityHoverCard } from '../components/IdentityHoverCard';
import { ChatConnectionBanner } from '../components/ChatConnectionBanner';
import { useAppConfig, usePlatformCapabilities } from '../config';
import { useAuth } from '../hooks/useAuth';
import { useIdentity } from '../hooks/useIdentity';
import { useFriends } from '../hooks/useFriends';
import { IdentityModal } from './IdentityModal';
import { useConversations, type DecryptedConversation } from '../hooks/useConversations';
import { useTheme } from '../hooks/useTheme';
import type { PublicIdentity, PublicGroupInvite, GroupInvitePreview, GroupInvitePreviewMember } from '@adieuu/shared';

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

/**
 * Identity flyout menu that appears on hover in the sidebar footer.
 * Shows identity navigation links and logout option when logged in,
 * or login button when not logged in.
 */
function IdentityFlyout() {
  const { t } = useTranslation();
  const location = useLocation();
  const { isExpanded, closeMobile } = useSidebar();
  const { status: identityStatus, identity, logoutFromIdentity, hasIdentity } = useIdentity();
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

  // When not logged in, show a simple button to open the identity modal
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

  // When logged in, show the flyout menu
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
      icon={<Icon name="users" />}
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
}: {
  identity: PublicIdentity;
  children: React.ReactElement;
  actions: React.ReactNode;
}) {
  return (
    <IdentityHoverCard identity={identity} actions={actions}>
      {children}
    </IdentityHoverCard>
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
          <Icon name="x" />
        </Button>
      </div>

      <div className="sidebar-friends-panel-search">
        <Input
          inputSize="sm"
          leftIcon={<Icon name="search" />}
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
                actions={
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={(e) => handleAccept(req.request.id, e)}
                    >
                      <Icon name="check" />
                      {t('friends.accept')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleIgnore(req.request.id, e)}
                    >
                      <Icon name="x" />
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
                      <Icon name="check" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="sidebar-friends-panel-action-btn sidebar-friends-panel-action-ignore"
                      onClick={(e) => handleIgnore(req.request.id, e)}
                      title={t('friends.ignore')}
                    >
                      <Icon name="x" />
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
                actions={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleRemoveFriend(friend.identity.id, e)}
                  >
                    <Icon name="x" />
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
 * Toggle button for the chat invitations panel in the sidebar nav.
 * Displays "X Chat Invitations" when invites exist; hidden otherwise.
 */
function ChatInvitationsSidebarButton({
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { status: identityStatus } = useIdentity();
  const { invites } = useConversations();

  const isIdentityLoggedIn = identityStatus === 'logged_in';
  if (!isIdentityLoggedIn || invites.length === 0) return null;

  const buttonLabel = t('nav.chatInvitations', { count: invites.length });

  return (
    <SidebarItem
      icon={<Icon name="message" />}
      label={buttonLabel}
      onClick={onToggle}
      isActive={isOpen}
      className="sidebar-chat-invitations-btn"
    />
  );
}

/**
 * Hover card showing group details for a pending chat invitation.
 * Fetches the invite preview on hover and displays member list with admin badges.
 */
function InviteGroupHoverCard({
  invite,
  children,
}: {
  invite: PublicGroupInvite;
  children: React.ReactElement;
}) {
  const { t } = useTranslation();
  const { getInvitePreview } = useConversations();
  const [preview, setPreview] = useState<GroupInvitePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const handleOpen = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    const data = await getInvitePreview(invite.id);
    setPreview(data);
    setLoading(false);
  }, [getInvitePreview, invite.id]);

  return (
    <HoverCard
      trigger={children}
      positioning={{ placement: 'right', gutter: 8 }}
      className="invite-group-hover-card"
      openDelay={300}
      closeDelay={200}
      onOpenChange={(details: { open: boolean }) => {
        if (details.open) void handleOpen();
      }}
    >
      {loading && (
        <div className="invite-group-hover-card-loading">
          <span className="spinner spinner-sm" />
        </div>
      )}
      {!loading && preview && (
        <>
          <div className="invite-group-hover-card-header">
            <span className="invite-group-hover-card-name">
              {preview.hasGroupName
                ? t('conversations.invites.groupNameHidden', 'Group Name Hidden')
                : t('conversations.invites.group', 'Group')}
            </span>
            <span className="invite-group-hover-card-count">
              {t('conversations.invites.previewMemberCount', {
                count: preview.memberCount,
                defaultValue: '{{count}} members',
              })}
            </span>
          </div>
          <div className="invite-group-hover-card-inviter">
            <span className="invite-group-hover-card-inviter-label">
              {t('conversations.invites.invitedByLabel', 'Invited by')}
            </span>
            <span className="invite-group-hover-card-inviter-name">
              {preview.invitedBy.displayName}
              {preview.invitedBy.isAdmin && (
                <span className="conversation-member-admin-badge">
                  {t('conversations.admin', 'Admin')}
                </span>
              )}
            </span>
          </div>
          <div className="invite-group-hover-card-members">
            <span className="invite-group-hover-card-members-label">
              {t('conversations.invites.previewMembers', 'Members')}
            </span>
            <div className="invite-group-hover-card-members-list">
              {preview.members.map((member: GroupInvitePreviewMember) => (
                <div key={member.id} className="invite-group-hover-card-member">
                  <div className="invite-group-hover-card-member-avatar">
                    {member.avatarUrl ? (
                      <img src={member.avatarUrl} alt="" className="invite-group-hover-card-member-avatar-img" />
                    ) : (
                      <span className="invite-group-hover-card-member-avatar-placeholder">
                        {member.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="invite-group-hover-card-member-name">
                    {member.displayName}
                    {member.isAdmin && (
                      <span className="conversation-member-admin-badge">
                        {t('conversations.admin', 'Admin')}
                      </span>
                    )}
                  </span>
                  <span className="invite-group-hover-card-member-username">
                    @{member.username}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {preview.invitedMembers.length > 0 && (
            <div className="invite-group-hover-card-members">
              <span className="invite-group-hover-card-members-label">
                {t('conversations.invites.alsoInvited', 'Also Invited')}
              </span>
              <div className="invite-group-hover-card-members-list">
                {preview.invitedMembers.slice(0, 5).map((member: GroupInvitePreviewMember) => (
                  <div key={member.id} className="invite-group-hover-card-member">
                    <div className="invite-group-hover-card-member-avatar">
                      {member.avatarUrl ? (
                        <img src={member.avatarUrl} alt="" className="invite-group-hover-card-member-avatar-img" />
                      ) : (
                        <span className="invite-group-hover-card-member-avatar-placeholder">
                          {member.displayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="invite-group-hover-card-member-name">
                      {member.displayName}
                    </span>
                    <span className="invite-group-hover-card-member-username">
                      @{member.username}
                    </span>
                  </div>
                ))}
                {preview.invitedMembers.length > 5 && (
                  <div className="invite-group-hover-card-overflow">
                    {t('conversations.invites.othersInvited', {
                      count: preview.invitedMembers.length - 5,
                      defaultValue: `+${preview.invitedMembers.length - 5} others invited`,
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {!loading && !preview && (
        <div className="invite-group-hover-card-error">
          {t('conversations.invites.previewUnavailable', 'Preview unavailable')}
        </div>
      )}
    </HoverCard>
  );
}

/**
 * Secondary sidebar panel for chat invitations.
 * Renders inside the sidebar's panel slot, mirroring FriendsPanel.
 */
function ChatInvitationsPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { invites, acceptInvite, declineInvite, participantProfiles, setActiveConversation } = useConversations();
  const navigate = useNavigate();
  const { closeMobile } = useSidebar();
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleAccept = useCallback(
    async (inviteId: string, conversationId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setProcessingInvite(inviteId);
      const accepted = await acceptInvite(inviteId);
      setProcessingInvite(null);
      if (accepted) {
        setActiveConversation(conversationId);
        navigate(`/conversations/${conversationId}`);
        onClose();
        closeMobile();
      }
    },
    [acceptInvite, setActiveConversation, navigate, onClose, closeMobile]
  );

  const handleDecline = useCallback(
    async (inviteId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setProcessingInvite(inviteId);
      await declineInvite(inviteId);
      setProcessingInvite(null);
    },
    [declineInvite]
  );

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

  if (!isOpen) return null;

  return (
    <div className="sidebar-invitations-panel" ref={panelRef}>
      <div className="sidebar-invitations-panel-header">
        <span className="sidebar-invitations-panel-title">
          {t('conversations.invites.panelTitle', 'Chat Invitations')}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="sidebar-invitations-panel-close"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <Icon name="x" />
        </Button>
      </div>

      <div className="sidebar-invitations-panel-list">
        {invites.map((invite) => {
          const inviterProfile = participantProfiles[invite.invitedByIdentityId];
          const inviterName = inviterProfile?.displayName ?? inviterProfile?.username;
          const isProcessing = processingInvite === invite.id;

          const othersCount = invite.memberCount - 1;
          const displayName = invite.hasGroupName
            ? t('conversations.invites.groupNameHidden', 'Group Name Hidden')
            : inviterName
              ? (othersCount > 0
                ? t('conversations.invites.inviterAndOthers', {
                    name: inviterName,
                    count: othersCount,
                    defaultValue: `${inviterName} + ${othersCount} others`,
                  })
                : t('conversations.invites.inviterGroup', {
                    name: inviterName,
                    defaultValue: `${inviterName}'s Group`,
                  }))
              : t('conversations.invites.group', 'Group');

          return (
            <InviteGroupHoverCard key={invite.id} invite={invite}>
              <div className="sidebar-invitations-panel-item">
                <div className="sidebar-invitations-panel-item-info">
                  <span className="sidebar-invitations-panel-item-name">
                    {displayName}
                  </span>
                  <span className="sidebar-invitations-panel-item-meta">
                    {inviterName
                      ? t('conversations.invites.invitedBy', { name: inviterName, defaultValue: `From ${inviterName}` })
                      : t('conversations.invites.memberCount', { count: invite.memberCount, defaultValue: `${invite.memberCount} members` })}
                  </span>
                  <span className="sidebar-invitations-panel-item-members">
                    {t('conversations.invites.memberCount', { count: invite.memberCount, defaultValue: `${invite.memberCount} members` })}
                  </span>
                </div>
                <div className="sidebar-invitations-panel-item-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="sidebar-invite-action-btn sidebar-invite-action-accept"
                    onClick={(e) => void handleAccept(invite.id, invite.conversationId, e)}
                    disabled={isProcessing}
                    title={t('conversations.invites.accept', 'Accept')}
                  >
                    {isProcessing ? <span className="spinner spinner-sm" /> : <Icon name="check" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="sidebar-invite-action-btn sidebar-invite-action-decline"
                    onClick={(e) => void handleDecline(invite.id, e)}
                    disabled={isProcessing}
                    title={t('conversations.invites.decline', 'Decline')}
                  >
                    <Icon name="x" />
                  </Button>
                </div>
              </div>
            </InviteGroupHoverCard>
          );
        })}

        {invites.length === 0 && (
          <div className="sidebar-invitations-panel-empty">
            {t('conversations.invites.noInvites', 'No pending invitations')}
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
  const otherParticipants = conversation.participants.filter((p) => p !== identity?.id);

  const resolveDisplayName = (pid: string) => {
    const profile = participantProfiles[pid];
    return profile?.displayName ?? profile?.username ?? pid;
  };

  const displayName = conversation.type === 'group'
    ? (conversation.decryptedName ?? 'Group')
    : otherParticipants.map(resolveDisplayName).join(', ');

  const handleClick = () => {
    setActiveConversation(conversation.id);
    navigate(`/conversations/${conversation.id}`);
    closeMobile();
  };

  const avatarMembers = otherParticipants.slice(0, 3);

  return (
    <button
      type="button"
      className={`conversation-list-item${isActive ? ' conversation-list-item-active' : ''}`}
      onClick={handleClick}
    >
      {conversation.type === 'group' && avatarMembers.length > 1 ? (
        <div className="conversation-list-item-avatar-stack">
          {avatarMembers.map((pid) => (
            <span key={pid} className="conversation-list-item-avatar-stack-item">
              {resolveDisplayName(pid).charAt(0).toUpperCase()}
            </span>
          ))}
        </div>
      ) : (
        <div className="conversation-list-item-avatar">
          <span className="conversation-list-item-avatar-placeholder">
            {displayName.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
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
function ConversationsSidebarSection({
  isChatInvitesPanelOpen,
  onToggleChatInvitesPanel,
}: {
  isChatInvitesPanelOpen: boolean;
  onToggleChatInvitesPanel: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversations, loading } = useConversations();
  const { closeMobile } = useSidebar();
  const [activeTab, setActiveTab] = useState('conversations');

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const { appWindow } = usePlatformCapabilities();
  const { activeTheme } = useTheme();
  const accentHex = activeTheme?.colors.accentPrimary;

  useEffect(() => {
    appWindow?.setBadgeCount(totalUnread, accentHex);
  }, [totalUnread, appWindow, accentHex]);

  const tabs: SidebarTab[] = [
    {
      id: 'conversations',
      icon: <Icon name="message" />,
      label: t('sidebar.conversationsTab', 'Conversations'),
      badge: totalUnread > 0 ? totalUnread : undefined,
    },
    {
      id: 'spaces',
      icon: <Icon name="spaces" />,
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

      <ChatConnectionBanner />

      <div className="sidebar-tab-content">
        {activeTab === 'conversations' && (
          <>
            <ChatInvitationsSidebarButton
              isOpen={isChatInvitesPanelOpen}
              onToggle={onToggleChatInvitesPanel}
            />
            <SidebarItem
              icon={<Icon name="plus" />}
              label={t('sidebar.newConversation', 'New Conversation')}
              onClick={handleNewConversation}
            />

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
  isChatInvitesPanelOpen,
  onToggleChatInvitesPanel,
}: {
  isFriendsPanelOpen: boolean;
  onToggleFriendsPanel: () => void;
  isChatInvitesPanelOpen: boolean;
  onToggleChatInvitesPanel: () => void;
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
            icon={<Icon name="info" />}
            label={t('nav.about')}
            isActive={isActive('/about')}
          />
        </Link>
        <FriendsSidebarButton
          isOpen={isFriendsPanelOpen}
          onToggle={onToggleFriendsPanel}
        />
      </SidebarSection>
      <ConversationsSidebarSection
        isChatInvitesPanelOpen={isChatInvitesPanelOpen}
        onToggleChatInvitesPanel={onToggleChatInvitesPanel}
      />
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
  const showModerator = session?.isPlatformModerator === true || showAdmin;
  const isAdminActive = location.pathname.startsWith('/admin');
  const isModeratorActive = location.pathname.startsWith('/moderation');
  const isDownloadActive = location.pathname === '/download';
  const showDesktopAppLink = platform === 'web';

  return (
    <div className="sidebar-footer-stack">
      {showModerator && (
        <div className="sidebar-admin-row">
          <Link
            to="/moderation"
            className={`sidebar-admin-link sidebar-admin-link-btn${isModeratorActive ? ' sidebar-admin-link-active' : ''}`}
            onClick={closeMobile}
          >
            <Icon name="shield" />
            <span className="sidebar-admin-label">{t('moderation.nav.link')}</span>
          </Link>
        </div>
      )}
      {showAdmin && (
        <div className="sidebar-admin-row">
          <Link
            to="/admin"
            className={`sidebar-admin-link sidebar-admin-link-btn${isAdminActive ? ' sidebar-admin-link-active' : ''}`}
            onClick={closeMobile}
          >
            <Icon name="shield" />
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
            <Icon name="download" />
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
  const [isChatInvitesPanelOpen, setChatInvitesPanelOpen] = useState(false);

  const handleToggleFriendsPanel = useCallback(() => {
    setFriendsPanelOpen((prev) => {
      if (!prev) setChatInvitesPanelOpen(false);
      return !prev;
    });
  }, []);

  const handleCloseFriendsPanel = useCallback(() => {
    setFriendsPanelOpen(false);
  }, []);

  const handleToggleChatInvitesPanel = useCallback(() => {
    setChatInvitesPanelOpen((prev) => {
      if (!prev) setFriendsPanelOpen(false);
      return !prev;
    });
  }, []);

  const handleCloseChatInvitesPanel = useCallback(() => {
    setChatInvitesPanelOpen(false);
  }, []);

  return (
    <Sidebar
      header={<SidebarLogo />}
      footer={<SidebarFooterContent />}
      panel={
        <>
          <FriendsPanel
            isOpen={isFriendsPanelOpen}
            onClose={handleCloseFriendsPanel}
          />
          <ChatInvitationsPanel
            isOpen={isChatInvitesPanelOpen}
            onClose={handleCloseChatInvitesPanel}
          />
        </>
      }
      onExpandedChange={onExpandedChange}
    >
      <SidebarNavContent
        isFriendsPanelOpen={isFriendsPanelOpen}
        onToggleFriendsPanel={handleToggleFriendsPanel}
        isChatInvitesPanelOpen={isChatInvitesPanelOpen}
        onToggleChatInvitesPanel={handleToggleChatInvitesPanel}
      />
    </Sidebar>
  );
}
