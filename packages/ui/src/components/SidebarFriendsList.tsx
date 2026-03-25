/**
 * Friends list component for the sidebar.
 * Displays incoming friend requests (collapsible) and a scrollable list of friends.
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { IncomingFriendRequest } from '@adieuu/shared';
import { useFriendsList, useFriendRequests } from '../hooks/useFriends';
import { useIdentity } from '../hooks/useIdentity';
import { useSidebar } from './Sidebar';
import { FriendListItem } from './FriendListItem';
import { HoverCard } from './HoverCard';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { CheckIcon, XIcon, UserIcon } from './Icons';

// ============================================================================
// Incoming friend request item (with hover card)
// ============================================================================

function getInitials(displayName: string): string {
  return displayName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

interface FriendRequestItemProps {
  request: IncomingFriendRequest;
  onAccept: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  onDecline: (requestId: string) => Promise<{ success: boolean; error?: string }>;
}

function FriendRequestItem({ request, onAccept, onDecline }: FriendRequestItemProps) {
  const { t } = useTranslation();
  const { isExpanded } = useSidebar();
  const [acting, setActing] = useState(false);
  const { fromIdentity: identity } = request;

  const handleAccept = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (acting) return;
    setActing(true);
    try {
      await onAccept(request.id);
    } finally {
      setActing(false);
    }
  }, [acting, onAccept, request.id]);

  const handleDecline = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (acting) return;
    setActing(true);
    try {
      await onDecline(request.id);
    } finally {
      setActing(false);
    }
  }, [acting, onDecline, request.id]);

  const itemContent = (
    <div className="sidebar-request-item">
      <div className="friend-list-item-avatar">
        {identity.avatarUrl ? (
          <img
            src={identity.avatarUrl}
            alt={identity.displayName}
            className="friend-list-item-avatar-img"
          />
        ) : (
          <span className="friend-list-item-avatar-placeholder">
            {getInitials(identity.displayName)}
          </span>
        )}
      </div>
      {isExpanded && (
        <>
          <div className="friend-list-item-info">
            <span className="friend-list-item-name">{identity.displayName}</span>
            <span className="friend-list-item-username">@{identity.username}</span>
          </div>
          <div className="sidebar-request-actions">
            <Button
              variant="primary"
              size="sm"
              className="sidebar-request-action-btn"
              onClick={handleAccept}
              disabled={acting}
              aria-label={t('sidebar.friends.requests.accept')}
            >
              {acting ? <Spinner size="sm" /> : <CheckIcon />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="sidebar-request-action-btn"
              onClick={handleDecline}
              disabled={acting}
              aria-label={t('sidebar.friends.requests.decline')}
            >
              <XIcon />
            </Button>
          </div>
        </>
      )}
    </div>
  );

  const hoverCardContent = (
    <div className="friend-hover-card">
      <div className="friend-hover-card-header">
        <div className="friend-hover-card-avatar">
          {identity.avatarUrl ? (
            <img
              src={identity.avatarUrl}
              alt={identity.displayName}
              className="friend-hover-card-avatar-img"
            />
          ) : (
            <span className="friend-hover-card-avatar-placeholder">
              {getInitials(identity.displayName)}
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
        <Link to={`/profile/${identity.username}`}>
          <Button variant="secondary" size="sm">
            <UserIcon />
            {t('identity.actions.viewProfile')}
          </Button>
        </Link>
      </div>
    </div>
  );

  return (
    <HoverCard
      trigger={itemContent}
      positioning={{ placement: 'right-start', gutter: 12 }}
      openDelay={300}
      closeDelay={200}
    >
      {hoverCardContent}
    </HoverCard>
  );
}

// ============================================================================
// Collapsible incoming requests section
// ============================================================================

interface FriendRequestsSectionProps {
  requests: IncomingFriendRequest[];
  onAccept: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  onDecline: (requestId: string) => Promise<{ success: boolean; error?: string }>;
}

function FriendRequestsSection({ requests, onAccept, onDecline }: FriendRequestsSectionProps) {
  const { t } = useTranslation();
  const { isExpanded } = useSidebar();
  const [expanded, setExpanded] = useState(false);

  if (requests.length === 0) return null;

  return (
    <div className="sidebar-requests-section">
      <button
        type="button"
        className="sidebar-requests-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="sidebar-requests-badge">{requests.length}</span>
        {isExpanded && (
          <span className="sidebar-requests-label">
            {t('sidebar.friends.requests.count', { count: requests.length })}
          </span>
        )}
        {isExpanded && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={`sidebar-requests-chevron ${expanded ? 'sidebar-requests-chevron-open' : ''}`}
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      {expanded && (
        <div className="sidebar-requests-list">
          {requests.map((req) => (
            <FriendRequestItem
              key={req.id}
              request={req}
              onAccept={onAccept}
              onDecline={onDecline}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main sidebar friends list
// ============================================================================

/**
 * Displays incoming friend requests (collapsible) and the current identity's
 * friends list in the sidebar.
 */
export function SidebarFriendsList() {
  const { t } = useTranslation();
  const { status: identityStatus } = useIdentity();
  const { closeMobile, isExpanded } = useSidebar();
  const { friends, isLoading, error, refresh: refreshFriends } = useFriendsList({ limit: 50, pollInterval: 30_000 });
  const {
    incoming,
    accept: acceptRequest,
    ignore: ignoreRequest,
  } = useFriendRequests({ pollInterval: 30_000 });

  const handleAccept = useCallback(async (requestId: string) => {
    const result = await acceptRequest(requestId);
    if (result.success) {
      await refreshFriends();
    }
    return result;
  }, [acceptRequest, refreshFriends]);

  const isLoggedIn = identityStatus === 'logged_in';

  if (!isLoggedIn) {
    return (
      <div className="sidebar-friends-empty">
        {isExpanded && <p>{t('sidebar.friends.loginRequired')}</p>}
      </div>
    );
  }

  if (isLoading && friends.length === 0) {
    return (
      <div className="sidebar-friends-loading">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="sidebar-friends-error">
        {isExpanded && <p>{t('sidebar.friends.error')}</p>}
      </div>
    );
  }

  const hasRequests = incoming.length > 0;
  const hasFriends = friends.length > 0;

  if (!hasRequests && !hasFriends) {
    return (
      <div className="sidebar-friends-empty">
        {isExpanded && (
          <>
            <p>{t('sidebar.friends.empty')}</p>
            <Link to="/search" onClick={closeMobile} className="sidebar-friends-find-link">
              {t('sidebar.friends.findFriends')}
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="sidebar-friends-list">
      {hasRequests && (
        <FriendRequestsSection
          requests={incoming}
          onAccept={handleAccept}
          onDecline={ignoreRequest}
        />
      )}
      {friends.map((friend) => (
        <FriendListItem
          key={friend.identity.id}
          friend={friend}
          onNavigate={closeMobile}
        />
      ))}
    </div>
  );
}
