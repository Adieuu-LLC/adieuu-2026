import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BAN_TROLL_COUNTDOWN_MS } from '@adieuu/shared';
import { Card } from './Card';
import { Alert } from './Alert';
import { Button } from './Button';
import { Icon } from '../icons/Icon';
import { useUntilCountdown } from '../hooks/useUntilCountdown';
import type { AccountRestrictionInfo } from '../services/authRestrictionFlow';
import { isOfacSanctionedBan } from '../services/authRestrictionFlow';

interface AccountRestrictionPanelProps {
  info: AccountRestrictionInfo;
}

export function AccountRestrictionPanel({ info }: AccountRestrictionPanelProps) {
  const { t } = useTranslation();
  const isBanned = info.type === 'banned';

  const banUntil = useMemo(
    () => new Date(Date.now() + BAN_TROLL_COUNTDOWN_MS).toISOString(),
    [],
  );

  const { label: countdown, isExpired } = useUntilCountdown(
    isBanned ? banUntil : info.suspendedUntil,
  );

  const isOfacBan = isBanned && isOfacSanctionedBan(info.category);

  const title = isBanned
    ? isOfacBan
      ? t('auth.restriction.ofacBannedTitle')
      : t('auth.restriction.bannedTitle')
    : t('auth.restriction.suspendedTitle');

  const categoryLabel = info.category
    ? t(`auth.restriction.category.${info.category}`, info.category)
    : undefined;

  const clubMessage = isBanned
    ? isOfacBan
      ? info.reason ?? t('auth.restriction.ofacMessage')
      : info.category && categoryLabel
        ? t('auth.restriction.bannedClubWithCategory', {
            count: info.bannedPeerCount ?? 0,
            category: categoryLabel,
          })
        : t('auth.restriction.bannedClubTotal', {
            count: info.bannedPeerCount ?? 0,
          })
    : t('auth.restriction.suspendedSubtitle');

  return (
    <Card variant="elevated" className="slide-up stagger-2">
      <div className="auth-form" style={{ textAlign: 'center' }}>
        <Alert variant="error" icon={<Icon name="gavel" />} className="fade-in">
          <strong>{title}</strong>
        </Alert>

        <p style={{ marginTop: 'var(--spacing-sm)', color: 'var(--color-text-secondary)' }}>
          {clubMessage}
        </p>

        {info.reason && !isOfacBan && (
          <div className="suspension-modal-field" style={{ marginTop: 'var(--spacing-md)' }}>
            <span className="suspension-modal-label">{t('auth.restriction.reason')}</span>
            <span className="suspension-modal-value">{info.reason}</span>
          </div>
        )}

        {(isBanned || (!isBanned && !isExpired)) && (
          <div className="suspension-modal-field" style={{ marginTop: 'var(--spacing-sm)' }}>
            <span className="suspension-modal-label">{t('auth.restriction.timeRemaining')}</span>
            <span className="suspension-modal-value" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {countdown}
            </span>
          </div>
        )}

        {!isBanned && isExpired && (
          <p style={{ marginTop: 'var(--spacing-md)', color: 'var(--color-text-secondary)' }}>
            {t('auth.restriction.expiredMessage')}
          </p>
        )}

        {!isOfacBan && (
          <p className="suspension-modal-appeal" style={{ marginTop: 'var(--spacing-md)' }}>
            {t('auth.restriction.appealMessage')}{' '}
            <a href="mailto:disputes@adieuu.com" className="suspension-modal-email">
              {t('auth.restriction.appealEmail')}
            </a>{' '}
            {t('auth.restriction.appealInstructions')}
          </p>
        )}

        <Link to="/auth/login" replace style={{ marginTop: 'var(--spacing-md)', display: 'block' }}>
          <Button type="button" variant="ghost" className="btn-full">
            {t('auth.restriction.backToLogin')}
          </Button>
        </Link>
      </div>
    </Card>
  );
}
