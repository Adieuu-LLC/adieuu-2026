import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/Card';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import { Alert } from '../../../components/Alert';
import { CheckoutPendingBanner } from '../../../components/CheckoutPendingBanner';
import type { ManageTabProps } from './types';
import { formatDate } from './types';

export function ManageTab({
  status,
  derived,
  identityMode,
  actionLoading,
  statusLabel,
  onManage,
  pollPending,
  onCancelPoll,
}: ManageTabProps) {
  const { t } = useTranslation();
  const { hasAccess, hasInsider, isLifetime, hasVanguard, hasFounder, hasPaidPlan } = derived;

  const currentTierKey = hasInsider
    ? 'insider'
    : hasAccess
      ? 'access'
      : 'free';

  return (
    <div className="subscription-manage">
      {identityMode && (
        <Alert variant="info" className="subscription-identity-banner">
          {t('account.subscription.identityBanner')}
        </Alert>
      )}

      {pollPending && !identityMode && (
        <CheckoutPendingBanner onCancel={onCancelPoll} />
      )}

      <Card className="subscription-manage-summary">
        <div className="subscription-manage-header">
          <h2 className="subscription-manage-tier-name">
            {t(`account.subscription.tiers.${currentTierKey}.name`)}
          </h2>
          {hasPaidPlan && statusLabel && (
            <span className="subscription-tier-badge">
              {t('account.subscription.currentPlan')}
              {isLifetime && (
                <span className="subscription-status-label">
                  {t('account.subscription.lifetime')}
                </span>
              )}
              {!isLifetime && (
                <span className="subscription-status-label">{statusLabel}</span>
              )}
            </span>
          )}
          {!hasPaidPlan && (
            <span className="subscription-tier-badge">
              {t('account.subscription.currentPlan')}
            </span>
          )}
        </div>

        <p className="subscription-manage-description">
          {t(`account.subscription.tiers.${currentTierKey}.description`)}
        </p>

        {(hasVanguard || hasFounder) && (
          <p className="subscription-entitlement-info">
            {hasFounder
              ? t('account.subscription.entitlements.founder')
              : t('account.subscription.entitlements.vanguard')}
          </p>
        )}

        {!identityMode && !isLifetime && status?.currentPeriodEnd && (
          <p className="subscription-period-info">
            {status.cancelAt
              ? t('account.subscription.cancelsOn', { date: formatDate(status.cancelAt) })
              : status.cancelAtPeriodEnd
                ? t('account.subscription.cancelAtPeriodEnd')
                : t('account.subscription.renewsOn', { date: formatDate(status.currentPeriodEnd) })}
          </p>
        )}

        {!identityMode && status?.hasStripeCustomer && (
          <div className="subscription-manage-actions">
            <p className="subscription-manage-portal-hint">
              {t('account.subscription.manage.billingPortal')}
            </p>
            <Button
              onClick={onManage}
              disabled={actionLoading}
              variant="secondary"
              className="subscription-manage-btn"
            >
              {actionLoading ? <Spinner size="sm" /> : t('account.subscription.manageBilling')}
            </Button>
          </div>
        )}

        {!hasPaidPlan && !identityMode && (
          <p className="subscription-manage-noPlan">
            {t('account.subscription.manage.noPlan')}
          </p>
        )}
      </Card>
    </div>
  );
}
