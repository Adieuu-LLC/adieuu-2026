/**
 * Reusable identity profile hover card built on the HoverCard Ark UI primitive.
 * Shows a mini profile banner, avatar, display name, username, optional bio,
 * and built-in actions: Profile, Message, and an ellipsis menu (Block, Report).
 *
 * Applies the identity's profileColors for visual consistency with the
 * full profile page.
 */

import { useState, useEffect, useMemo, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Menu, Portal } from '@ark-ui/react';
import type { PublicIdentity } from '@adieuu/shared';
import { formatFriendsForLine } from '../utils/friendshipDuration';
import { HoverCard } from './HoverCard';
import { Button } from './Button';
import { ReportModal } from './ReportModal';
import { Icon } from '../icons/Icon';
import { useAuth } from '../hooks/useAuth';
import { useIdentity } from '../hooks/useIdentity';
import { useBlockContext } from '../hooks/useBlockContext';
import { useFriends } from '../hooks/useFriends';

export interface IdentityHoverCardContentProps {
  identity: PublicIdentity;
  /**
   * When you already know “friends since” (e.g. friends list). Otherwise we resolve from
   * the friends list cache or GET /friends/status.
   */
  friendsSince?: string;
  extraMenuItems?: ReactNode;
  /** Optional footer below actions (e.g. conversation-specific links). */
  extraFooter?: ReactNode;
}

/** Panel body + report modal; use inside a {@link HoverCard} when the profile is already loaded. */
export function IdentityHoverCardContent({
  identity,
  friendsSince: friendsSinceProp,
  extraMenuItems,
  extraFooter,
}: IdentityHoverCardContentProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { identity: selfIdentity } = useIdentity();
  const { isBlocked, requestBlockConfirm } = useBlockContext();
  const { friends, getFriendshipStatus } = useFriends();
  const [reportOpen, setReportOpen] = useState(false);
  const canReportProfiles = (session?.subscriptions ?? []).some((t_) => t_ !== 'free');
  const [fetchedFriendsSince, setFetchedFriendsSince] = useState<string | undefined>(undefined);

  const friendsSinceFromList = useMemo(
    () => friends.find((f) => f.identity.id === identity.id)?.friendsSince,
    [friends, identity.id]
  );
  const effectiveFromPropOrList = friendsSinceProp ?? friendsSinceFromList;

  const isSelf = selfIdentity?.id === identity.id;

  useEffect(() => {
    if (isSelf || !selfIdentity) {
      setFetchedFriendsSince(undefined);
      return;
    }
    if (effectiveFromPropOrList) {
      setFetchedFriendsSince(undefined);
      return;
    }
    let cancelled = false;
    void getFriendshipStatus(identity.id).then((r) => {
      if (cancelled) return;
      if (r.status === 'friends' && r.friendsSince) {
        setFetchedFriendsSince(r.friendsSince);
      } else {
        setFetchedFriendsSince(undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [identity.id, isSelf, selfIdentity, effectiveFromPropOrList, getFriendshipStatus]);

  const friendsSinceResolved = effectiveFromPropOrList ?? fetchedFriendsSince;
  const blocked = isBlocked(identity.id);
  const colors = identity.profileColors;

  const cardStyle: React.CSSProperties = colors?.cardBackground
    ? { backgroundColor: colors.cardBackground }
    : {};

  const bannerStyle: React.CSSProperties = {
    backgroundImage: identity.bannerUrl ? `url(${identity.bannerUrl})` : undefined,
    backgroundColor: colors?.accent || 'var(--color-bg-tertiary)',
  };

  const nameStyle: React.CSSProperties = colors?.accent
    ? { color: colors.accent }
    : {};

  return (
    <>
      <div className="identity-hover-card-inner" style={cardStyle}>
        <div className="identity-hover-card-banner" style={bannerStyle} />

        <div className="identity-hover-card-avatar-wrapper">
          {identity.avatarUrl ? (
            <img
              src={identity.avatarUrl}
              alt=""
              className="identity-hover-card-avatar"
            />
          ) : (
            <div className="identity-hover-card-avatar identity-hover-card-avatar--placeholder">
              <span>{identity.displayName.charAt(0).toUpperCase()}</span>
            </div>
          )}
        </div>

        <div className="identity-hover-card-body">
          <span className="identity-hover-card-name" style={nameStyle}>
            {identity.displayName}
          </span>
          <span className="identity-hover-card-username">@{identity.username}</span>
          {!isSelf && friendsSinceResolved && (
            <span
              className="identity-hover-card-friendship"
              title={new Date(friendsSinceResolved).toLocaleString()}
            >
              {formatFriendsForLine(friendsSinceResolved, t)}
            </span>
          )}
          {identity.bio && (
            <p className="identity-hover-card-bio">{identity.bio}</p>
          )}
        </div>

        <div className="identity-hover-card-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/identity/${identity.id}`)}
          >
            {t('identityCard.viewProfile')}
          </Button>

          {!isSelf && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                navigate('/conversations/new', {
                  state: { preSelectedIds: [identity.id] },
                })
              }
              title={t('identityCard.message')}
              className="identity-hover-card-icon-btn"
            >
              <Icon name="message" />
            </Button>
          )}

          {!isSelf && (
            <Menu.Root>
              <Menu.Trigger asChild>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm identity-hover-card-icon-btn"
                  title={t('identityCard.viewProfile')}
                >
                  <Icon name="ellipsis" />
                </button>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content className="identity-hover-card-menu">
                    <Menu.Item
                      value="block"
                      className="identity-hover-card-menu-item"
                      onClick={() => requestBlockConfirm(identity.id)}
                    >
                      <Icon name="ban" />
                      {blocked
                        ? t('identityCard.unblock')
                        : t('identityCard.block')}
                    </Menu.Item>
                    {canReportProfiles && (
                      <Menu.Item
                        value="report"
                        className="identity-hover-card-menu-item identity-hover-card-menu-item--danger"
                        onClick={() => setReportOpen(true)}
                      >
                        <Icon name="warning" />
                        {t('identityCard.report')}
                      </Menu.Item>
                    )}
                    {extraMenuItems}
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>
          )}
        </div>

        {extraFooter != null && (
          <div className="identity-hover-card-extra-footer">{extraFooter}</div>
        )}
      </div>

      {!isSelf && reportOpen && (
        <ReportModal
          open={reportOpen}
          onOpenChange={setReportOpen}
          mode="profile"
          targetIdentityId={identity.id}
        />
      )}
    </>
  );
}

export interface IdentityHoverCardProps {
  /** The identity whose profile is displayed in the hover card */
  identity: PublicIdentity;
  /** When known (e.g. from friends list), skip a status request */
  friendsSince?: string;
  /** The element that triggers the hover card */
  children: ReactElement;
  /** Optional extra actions rendered inside the ellipsis menu */
  extraMenuItems?: ReactNode;
  /** Optional footer below primary actions (e.g. contextual links). */
  extraFooter?: ReactNode;
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
  friendsSince,
  children,
  extraMenuItems,
  extraFooter,
  positioning = { placement: 'right', gutter: 8 },
  openDelay = 300,
  closeDelay = 200,
}: IdentityHoverCardProps) {
  const [contentMounted, setContentMounted] = useState(false);

  return (
    <HoverCard
      trigger={children}
      positioning={positioning}
      className="identity-hover-card"
      openDelay={openDelay}
      closeDelay={closeDelay}
      onOpenChange={(details) => setContentMounted(details.open)}
    >
      {contentMounted ? (
        <IdentityHoverCardContent
          identity={identity}
          friendsSince={friendsSince}
          extraMenuItems={extraMenuItems}
          extraFooter={extraFooter}
        />
      ) : null}
    </HoverCard>
  );
}
