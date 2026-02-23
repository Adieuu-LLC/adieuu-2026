/**
 * Friend list item component for displaying a friend in the sidebar.
 * Shows avatar, display name, and username with a hover card for actions.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Friend } from '@adieuu/shared';
import { HoverCard } from './HoverCard';
import { Button } from './Button';
import { MessageIcon, UserIcon } from './Icons';
import { useSidebar } from './Sidebar';

export interface FriendListItemProps {
  /** Friend data */
  friend: Friend;
  /** Callback when navigating (to close mobile sidebar) */
  onNavigate?: () => void;
}

/**
 * Gets initials from a display name for avatar placeholder.
 */
function getInitials(displayName: string): string {
  return displayName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Friend list item with hover card showing profile info and actions.
 */
export function FriendListItem({ friend, onNavigate }: FriendListItemProps) {
  const { t } = useTranslation();
  const { isExpanded } = useSidebar();
  const { identity } = friend;

  const handleNavigate = () => {
    onNavigate?.();
  };

  const itemContent = (
    <div className="friend-list-item">
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
        <div className="friend-list-item-info">
          <span className="friend-list-item-name">{identity.displayName}</span>
          <span className="friend-list-item-username">@{identity.username}</span>
        </div>
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
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNavigate}
          disabled
          title={t('common.comingSoon')}
        >
          <MessageIcon />
          {t('identity.actions.message')}
        </Button>
        <Link to={`/profile/${identity.username}`} onClick={handleNavigate}>
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
