/**
 * Reusable identity profile hover card built on the HoverCard Ark UI primitive.
 * Shows avatar, display name, username, optional bio, and a "View profile" link.
 * Accepts optional action buttons (e.g. accept/reject friend request).
 */

import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { PublicIdentity } from '@adieuu/shared';
import { HoverCard } from './HoverCard';
import { Button } from './Button';

export interface IdentityHoverCardProps {
  /** The identity whose profile is displayed in the hover card */
  identity: PublicIdentity;
  /** The element that triggers the hover card */
  children: ReactElement;
  /** Optional action buttons rendered below the profile */
  actions?: ReactNode;
  /** Positioning configuration forwarded to HoverCard */
  positioning?: {
    placement?:
      | 'top' | 'bottom' | 'left' | 'right'
      | 'top-start' | 'top-end'
      | 'bottom-start' | 'bottom-end'
      | 'left-start' | 'left-end'
      | 'right-start' | 'right-end';
    gutter?: number;
  };
  /** Delay before showing the hover card (ms) */
  openDelay?: number;
  /** Delay before hiding the hover card (ms) */
  closeDelay?: number;
}

export function IdentityHoverCard({
  identity,
  children,
  actions,
  positioning = { placement: 'right', gutter: 8 },
  openDelay = 300,
  closeDelay = 200,
}: IdentityHoverCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <HoverCard
      trigger={children}
      positioning={positioning}
      className="friend-hover-card"
      openDelay={openDelay}
      closeDelay={closeDelay}
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
          onClick={() => navigate(`/identity/${identity.id}`)}
        >
          {t('identity.actions.viewProfile')}
        </Button>
        {actions}
      </div>
    </HoverCard>
  );
}
