/**
 * Identity card component for displaying identity information with actions.
 * Used in search results and other identity listings.
 */

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { PublicIdentity } from '@adieuu/shared';
import { Button } from './Button';
import { MessageIcon, UserIcon, PlusIcon } from './Icons';

export interface IdentityCardProps {
  /** The identity to display */
  identity: PublicIdentity;
  /** Whether to show action buttons */
  showActions?: boolean;
  /** Callback when "Add Friend" is clicked */
  onAddFriend?: (identity: PublicIdentity) => void;
  /** Callback when "Message" is clicked */
  onMessage?: (identity: PublicIdentity) => void;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Card component for displaying an identity with avatar, info, and actions.
 */
export function IdentityCard({
  identity,
  showActions = true,
  onAddFriend,
  onMessage,
  className = '',
}: IdentityCardProps) {
  const { t } = useTranslation();

  const initials = identity.displayName
    .split(' ')
    .map((word) => word.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

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
          {onMessage && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onMessage(identity)}
            >
              <MessageIcon />
              {t('search.actions.message')}
            </Button>
          )}
          {onAddFriend && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onAddFriend(identity)}
            >
              <PlusIcon />
              {t('search.actions.addFriend')}
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
