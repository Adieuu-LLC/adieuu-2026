import { useState, useEffect, useCallback, useRef, type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SidebarItem, useSidebar } from '../../components/Sidebar';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../icons/Icon';
import { IdentityHoverCard } from '../../components/IdentityHoverCard';
import { BlockActionButton } from '../../components/BlockActionButton';
import { useIdentity } from '../../hooks/useIdentity';
import { useFriends } from '../../hooks/useFriends';
import type { PublicIdentity } from '@adieuu/shared';
import { useSidebarPanelDismiss } from './useSidebarPanelDismiss';

export function FriendsSidebarButton({
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

function FriendProfileHoverCard({
  identity,
  children,
  actions,
}: {
  identity: PublicIdentity;
  children: ReactElement;
  actions: ReactNode;
}) {
  return (
    <IdentityHoverCard identity={identity} actions={actions}>
      {children}
    </IdentityHoverCard>
  );
}

export function FriendsPanel({
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
    async (requestId: string, event: ReactMouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      await acceptRequest(requestId);
    },
    [acceptRequest]
  );

  const handleIgnore = useCallback(
    async (requestId: string, event: ReactMouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      await ignoreRequest(requestId);
    },
    [ignoreRequest]
  );

  const handleRemoveFriend = useCallback(
    async (identityId: string, event: ReactMouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
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

  useSidebarPanelDismiss({
    isOpen,
    onClose,
    panelRef,
  });

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [isOpen]);

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
          onChange={(event) => handleSearch(event.target.value)}
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
                      onClick={(event) => handleAccept(req.request.id, event)}
                    >
                      <Icon name="check" />
                      {t('friends.accept')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(event) => handleIgnore(req.request.id, event)}
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
                      onClick={(event) => handleAccept(req.request.id, event)}
                      title={t('friends.accept')}
                    >
                      <Icon name="check" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="sidebar-friends-panel-action-btn sidebar-friends-panel-action-ignore"
                      onClick={(event) => handleIgnore(req.request.id, event)}
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
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(event) => handleRemoveFriend(friend.identity.id, event)}
                    >
                      <Icon name="x" />
                      {t('friends.remove')}
                    </Button>
                    <BlockActionButton identityId={friend.identity.id} />
                  </>
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
