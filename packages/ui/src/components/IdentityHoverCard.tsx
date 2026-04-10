/**
 * Reusable identity profile hover card built on the HoverCard Ark UI primitive.
 * Shows a mini profile banner, avatar, display name, username, optional bio,
 * and built-in actions: Profile, Message, and an ellipsis menu (Block, Report).
 *
 * Applies the identity's profileColors for visual consistency with the
 * full profile page.
 */

import { useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Menu, Portal } from '@ark-ui/react';
import type { PublicIdentity } from '@adieuu/shared';
import { HoverCard } from './HoverCard';
import { Button } from './Button';
import { ReportModal } from './ReportModal';
import { Icon } from '../icons/Icon';
import { useIdentity } from '../hooks/useIdentity';
import { useBlockContext } from '../hooks/useBlockContext';

export interface IdentityHoverCardProps {
  /** The identity whose profile is displayed in the hover card */
  identity: PublicIdentity;
  /** The element that triggers the hover card */
  children: ReactElement;
  /** Optional extra actions rendered inside the ellipsis menu */
  extraMenuItems?: ReactNode;
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
  extraMenuItems,
  positioning = { placement: 'right', gutter: 8 },
  openDelay = 300,
  closeDelay = 200,
}: IdentityHoverCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { identity: selfIdentity } = useIdentity();
  const { isBlocked, requestBlockConfirm } = useBlockContext();
  const [reportOpen, setReportOpen] = useState(false);

  const isSelf = selfIdentity?.id === identity.id;
  const blocked = isBlocked(identity.id);
  const colors = identity.profileColors;

  const cardStyle: React.CSSProperties = colors?.background
    ? { backgroundColor: colors.background }
    : {};

  const bannerStyle: React.CSSProperties = {
    backgroundImage: identity.bannerUrl ? `url(${identity.bannerUrl})` : undefined,
    backgroundColor: colors?.primary || 'var(--color-bg-tertiary)',
  };

  const nameStyle: React.CSSProperties = colors?.accent
    ? { color: colors.accent }
    : {};

  return (
    <>
      <HoverCard
        trigger={children}
        positioning={positioning}
        className="identity-hover-card"
        openDelay={openDelay}
        closeDelay={closeDelay}
      >
        <div className="identity-hover-card-inner" style={cardStyle}>
          {/* Mini banner */}
          <div className="identity-hover-card-banner" style={bannerStyle} />

          {/* Avatar overlapping banner */}
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

          {/* Identity info */}
          <div className="identity-hover-card-body">
            <span className="identity-hover-card-name" style={nameStyle}>
              {identity.displayName}
            </span>
            <span className="identity-hover-card-username">@{identity.username}</span>
            {identity.bio && (
              <p className="identity-hover-card-bio">{identity.bio}</p>
            )}
          </div>

          {/* Action bar */}
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
                      <Menu.Item
                        value="report"
                        className="identity-hover-card-menu-item identity-hover-card-menu-item--danger"
                        onClick={() => setReportOpen(true)}
                      >
                        <Icon name="warning" />
                        {t('identityCard.report')}
                      </Menu.Item>
                      {extraMenuItems}
                    </Menu.Content>
                  </Menu.Positioner>
                </Portal>
              </Menu.Root>
            )}
          </div>
        </div>
      </HoverCard>

      {!isSelf && (
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
