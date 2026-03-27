/**
 * Identity card component for displaying identity information with actions.
 * Used in search results and other identity listings.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { PublicIdentity, FriendshipStatus } from '@adieuu/shared';
import { Button } from './Button';
import { UserIcon, UsersIcon, PlusIcon } from './Icons';

export interface IdentityCardProps {
  /** The identity to display */
  identity: PublicIdentity;
  /** Whether to show action buttons */
  showActions?: boolean;
  /** Whether to show the friend action button */
  showFriendAction?: boolean;
  /** Function to send a friend request */
  onSendFriendRequest?: (identityId: string) => Promise<boolean>;
  /** Function to get friendship status */
  onGetFriendshipStatus?: (identityId: string) => Promise<FriendshipStatus>;
  /** The current identity's ID (to hide actions for self) */
  selfIdentityId?: string;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Card component for displaying an identity with avatar, info, and actions.
 */
export function IdentityCard({
  identity,
  showActions = true,
  showFriendAction = false,
  onSendFriendRequest,
  onGetFriendshipStatus,
  selfIdentityId,
  className = '',
}: IdentityCardProps) {
  const { t } = useTranslation();
  const [friendStatus, setFriendStatus] = useState<FriendshipStatus>('none');
  const [isSending, setIsSending] = useState(false);

  const isSelf = selfIdentityId === identity.id;

  useEffect(() => {
    if (!showFriendAction || !onGetFriendshipStatus || isSelf) return;

    let cancelled = false;
    onGetFriendshipStatus(identity.id).then((status) => {
      if (!cancelled) setFriendStatus(status);
    });
    return () => { cancelled = true; };
  }, [identity.id, showFriendAction, onGetFriendshipStatus, isSelf]);

  const handleSendRequest = useCallback(async () => {
    if (!onSendFriendRequest || isSending) return;
    setIsSending(true);
    const ok = await onSendFriendRequest(identity.id);
    if (ok) setFriendStatus('pending_outgoing');
    setIsSending(false);
  }, [onSendFriendRequest, identity.id, isSending]);

  const initials = identity.displayName
    .split(' ')
    .map((word) => word.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const friendActionLabel =
    friendStatus === 'friends'
      ? t('friends.alreadyFriends')
      : friendStatus === 'pending_outgoing' || friendStatus === 'pending_incoming'
        ? t('friends.pending')
        : t('friends.addFriend');

  return (
    <div className={`identity-card ${className}`.trim()}>
      <div className="identity-card-header">
        <div className="identity-card-avatar">
          {identity.avatarUrl ? (
            <img
              src={identity.avatarUrl}
              alt={identity.displayName}
              className="identity-card-avatar-img"
            />
          ) : (
            <span className="identity-card-avatar-placeholder">{initials}</span>
          )}
        </div>
        <div className="identity-card-info">
          <h3 className="identity-card-name">{identity.displayName}</h3>
          <span className="identity-card-username">@{identity.username}</span>
        </div>
      </div>

      {identity.bio && (
        <p className="identity-card-bio">{identity.bio}</p>
      )}

      {showActions && (
        <div className="identity-card-actions">
          <Link to={`/identity/${identity.id}`} className="identity-card-action-link">
            <Button variant="secondary" size="sm">
              <UserIcon />
              {t('search.actions.viewProfile')}
            </Button>
          </Link>
          {showFriendAction && !isSelf && (
            <Button
              variant={friendStatus === 'none' ? 'primary' : 'ghost'}
              size="sm"
              onClick={handleSendRequest}
              disabled={friendStatus !== 'none' || isSending}
            >
              {friendStatus === 'friends' ? <UsersIcon /> : <PlusIcon />}
              {friendActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Compact identity card for lists and autocomplete.
 */
export function IdentityCardCompact({
  identity,
  onClick,
  className = '',
}: {
  identity: PublicIdentity;
  onClick?: () => void;
  className?: string;
}) {
  const initials = identity.displayName.charAt(0).toUpperCase();

  const content = (
    <>
      <div className="identity-card-compact-avatar">
        {identity.avatarUrl ? (
          <img
            src={identity.avatarUrl}
            alt=""
            className="identity-card-compact-avatar-img"
          />
        ) : (
          <span className="identity-card-compact-avatar-placeholder">
            {initials}
          </span>
        )}
      </div>
      <div className="identity-card-compact-info">
        <span className="identity-card-compact-name">{identity.displayName}</span>
        <span className="identity-card-compact-username">@{identity.username}</span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={`identity-card-compact ${className}`.trim()}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      to={`/identity/${identity.id}`}
      className={`identity-card-compact ${className}`.trim()}
    >
      {content}
    </Link>
  );
}
