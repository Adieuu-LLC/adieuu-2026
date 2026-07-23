/**
 * Identity card component for displaying identity information with actions.
 * Used in search results and other identity listings.
 *
 * Shows a mini banner, avatar, display name, username, bio, and action
 * buttons. Applies the identity's profileColors for visual consistency
 * with the full profile page and hover cards.
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { BadgeId, PublicIdentity, FriendshipStatus, FriendshipStatusResult } from '@adieuu/shared';
import { formatFriendsForLine } from '../utils/friendshipDuration';
import { BadgeDisplay } from './BadgeDisplay';
import { Button } from './Button';
import { Icon } from '../icons/Icon';

export interface IdentityCardProps {
  /** The identity to display */
  identity: PublicIdentity;
  /** Whether to show action buttons */
  showActions?: boolean;
  /** Whether to show the friend action button */
  showFriendAction?: boolean;
  /** Function to send a friend request */
  onSendFriendRequest?: (identityId: string) => Promise<boolean>;
  /** Function to get friendship status (and `friendsSince` when you are friends) */
  onGetFriendshipStatus?: (identityId: string) => Promise<FriendshipStatusResult>;
  /** When set with `onGetFriendshipStatus`, show “Friends for …” for mutual friends (e.g. member hover) without the add-friend control */
  showFriendshipLength?: boolean;
  /** The current identity's ID (to hide actions for self) */
  selfIdentityId?: string;
  /** Additional CSS class name */
  className?: string;
  /** Optional footer below actions (e.g. contextual links); not shown in compact listings by default */
  extraFooter?: ReactNode;
}

export function IdentityCard({
  identity,
  showActions = true,
  showFriendAction = false,
  onSendFriendRequest,
  onGetFriendshipStatus,
  showFriendshipLength = false,
  selfIdentityId,
  className = '',
  extraFooter,
}: IdentityCardProps) {
  const { t } = useTranslation();
  const [friendStatus, setFriendStatus] = useState<FriendshipStatus>('none');
  const [friendsSinceIso, setFriendsSinceIso] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const isSelf = selfIdentityId === identity.id;

  useEffect(() => {
    if ((!showFriendAction && !showFriendshipLength) || !onGetFriendshipStatus || isSelf) return;

    let cancelled = false;
    onGetFriendshipStatus(identity.id).then((result) => {
      if (cancelled) return;
      setFriendStatus(result.status);
      setFriendsSinceIso(result.friendsSince ?? null);
    });
    return () => { cancelled = true; };
  }, [identity.id, showFriendAction, showFriendshipLength, onGetFriendshipStatus, isSelf]);

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

  const colors = identity.profileColors;

  const cssVars: Record<string, string> = {};
  if (colors?.accent) cssVars['--identity-card-accent'] = colors.accent;
  if (colors?.cardBackground) cssVars['--identity-card-bg'] = colors.cardBackground;
  if (identity.bannerUrl) cssVars['--identity-card-banner-img'] = `url(${identity.bannerUrl})`;

  return (
    <div
      className={`identity-card ${className}`.trim()}
      style={cssVars as React.CSSProperties}
    >
      <div className="identity-card-banner" />

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

      {(identity.badges?.length || (friendStatus === 'friends' && friendsSinceIso)) && (
        <div className="identity-card-meta">
          {identity.badges && identity.badges.length > 0 && (
            <BadgeDisplay badges={identity.badges as BadgeId[]} size="sm" className="identity-card-badges" />
          )}
          {friendStatus === 'friends' && friendsSinceIso && (
            <span className="identity-card-friendship" title={new Date(friendsSinceIso).toLocaleString()}>
              {formatFriendsForLine(friendsSinceIso, t)}
            </span>
          )}
        </div>
      )}

      {identity.bio && (
        <p className="identity-card-bio">{identity.bio}</p>
      )}

      {showActions && (
        <div className="identity-card-actions">
          <Link to={`/identity/${identity.id}`} className="identity-card-action-link">
            <Button variant="secondary" size="sm">
              <Icon name="user" />
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
              {friendStatus === 'friends' ? <Icon name="users" /> : <Icon name="plus" />}
              {friendActionLabel}
            </Button>
          )}
        </div>
      )}

      {extraFooter != null && (
        <div className="identity-card-extra-footer">{extraFooter}</div>
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
