import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/Card';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import type { PlansTabProps } from './types';
import { ACCESS_FEATURES, INSIDER_FEATURES, formatDate } from './types';
import {
  formatVariableFeatureSuffix,
  parseSubscriptionFeatureVariables,
} from './subscription-feature-cells';

export function AnnualPlansCards({
  status,
  derived,
  identityMode,
  actionLoading,
  statusLabel,
  onCheckout,
  onManage,
}: PlansTabProps) {
  const { t } = useTranslation();
  const { hasAccess, hasInsider, isLifetime } = derived;

  const featureVariables = useMemo(
    () =>
      parseSubscriptionFeatureVariables(
        t('account.subscription.featureVariables', { returnObjects: true }),
      ),
    [t],
  );

  const renderAnnualFeatureItems = (
    keys: readonly string[],
    columnId: 'access' | 'insider',
  ) =>
    keys.map((f) => {
      const suffix = formatVariableFeatureSuffix(f, columnId, featureVariables);
      const label = t(`account.subscription.features.${f}`);
      return (
        <li key={f} className="subscription-feature-item">
          <span className="subscription-feature-check" aria-hidden="true">
            &#10003;
          </span>
          <span>
            {label}
            {suffix != null ? (
              <>
                {' '}
                <span className="subscription-feature-value">{suffix}</span>
              </>
            ) : null}
          </span>
        </li>
      );
    });

  return (
    <div className="subscription-grid">
      <Card
        className={`subscription-tier-card ${hasAccess && !hasInsider ? 'subscription-tier-current' : ''}`}
      >
        <div className="subscription-tier-header">
          <h2 className="subscription-tier-name">
            {t('account.subscription.tiers.access.name')}
          </h2>
        </div>
        <p className="subscription-tier-description">
          {t('account.subscription.tiers.access.description')}
        </p>
        <ul className="subscription-feature-list">
          {renderAnnualFeatureItems(ACCESS_FEATURES, 'access')}
        </ul>
        {hasAccess && !hasInsider ? (
          <div className="subscription-tier-status">
            <div className="subscription-tier-badge">
              {t('account.subscription.currentPlan')}
              {statusLabel && <span className="subscription-status-label">{statusLabel}</span>}
            </div>
            {!identityMode && !isLifetime && status?.currentPeriodEnd && (
              <p className="subscription-period-info">
                {status.cancelAt
                  ? t('account.subscription.cancelsOn', { date: formatDate(status.cancelAt) })
                  : status.cancelAtPeriodEnd
                    ? t('account.subscription.cancelAtPeriodEnd')
                    : t('account.subscription.renewsOn', { date: formatDate(status.currentPeriodEnd) })}
              </p>
            )}
            {!identityMode && (
              <Button
                onClick={onManage}
                disabled={actionLoading}
                variant="secondary"
                className="subscription-manage-btn"
              >
                {actionLoading ? <Spinner size="sm" /> : t('account.subscription.manageBilling')}
              </Button>
            )}
          </div>
        ) : (
          !hasInsider &&
          !identityMode && (
            <Button
              onClick={() => onCheckout('access')}
              disabled={actionLoading}
              variant="secondary"
              className="subscription-subscribe-btn"
            >
              {actionLoading ? <Spinner size="sm" /> : t('account.subscription.subscribe')}
            </Button>
          )
        )}
      </Card>

      <Card
        className={`subscription-tier-card subscription-tier-featured ${hasInsider ? 'subscription-tier-current' : ''}`}
      >
        <div className="subscription-tier-header">
          <h2 className="subscription-tier-name">
            {t('account.subscription.tiers.insider.name')}
          </h2>
        </div>
        <p className="subscription-tier-description">
          {t('account.subscription.tiers.insider.description')}
        </p>
        <ul className="subscription-feature-list">{renderAnnualFeatureItems(INSIDER_FEATURES, 'insider')}</ul>
        {hasInsider ? (
          <div className="subscription-tier-status">
            <div className="subscription-tier-badge">
              {t('account.subscription.currentPlan')}
              {isLifetime && (
                <span className="subscription-status-label">{t('account.subscription.lifetime')}</span>
              )}
              {!isLifetime && statusLabel && (
                <span className="subscription-status-label">{statusLabel}</span>
              )}
            </div>
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
              <Button
                onClick={onManage}
                disabled={actionLoading}
                variant="secondary"
                className="subscription-manage-btn"
              >
                {actionLoading ? <Spinner size="sm" /> : t('account.subscription.manageBilling')}
              </Button>
            )}
          </div>
        ) : (
          !identityMode && (
            <Button
              onClick={() => onCheckout('insider')}
              disabled={actionLoading}
              variant="primary"
              className="subscription-subscribe-btn"
            >
              {actionLoading ? <Spinner size="sm" /> : t('account.subscription.subscribe')}
            </Button>
          )
        )}
      </Card>
    </div>
  );
}
