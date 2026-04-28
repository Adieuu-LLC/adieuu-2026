import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/Card';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import type { PlansTabProps } from './types';
import { FREE_FEATURES, ACCESS_FEATURES, INSIDER_FEATURES, formatDate } from './types';

export function PlansTab({
  status,
  derived,
  identityMode,
  actionLoading,
  statusLabel,
  onCheckout,
  onManage,
}: PlansTabProps) {
  const { t } = useTranslation();
  const { hasAccess, hasInsider, isLifetime, hasPaidPlan } = derived;

  return (
    <div className="subscription-plans">
      <h2 className="subscription-section-heading">
        {t('account.subscription.sections.annual')}
      </h2>
      <div className="subscription-grid">
        {/* Free tier */}
        <Card className={`subscription-tier-card ${!hasPaidPlan ? 'subscription-tier-current' : ''}`}>
          <div className="subscription-tier-header">
            <h2 className="subscription-tier-name">
              {t('account.subscription.tiers.free.name')}
            </h2>
            <p className="subscription-tier-price">$0</p>
          </div>
          <p className="subscription-tier-description">
            {t('account.subscription.tiers.free.description')}
          </p>
          <ul className="subscription-feature-list">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="subscription-feature-item">
                <span className="subscription-feature-check" aria-hidden="true">&#10003;</span>
                {t(`account.subscription.features.${f}`)}
              </li>
            ))}
          </ul>
          {!hasPaidPlan && (
            <div className="subscription-tier-badge">
              {t('account.subscription.currentPlan')}
            </div>
          )}
        </Card>

        {/* Access tier */}
        <Card className={`subscription-tier-card ${hasAccess && !hasInsider ? 'subscription-tier-current' : ''}`}>
          <div className="subscription-tier-header">
            <h2 className="subscription-tier-name">
              {t('account.subscription.tiers.access.name')}
            </h2>
          </div>
          <p className="subscription-tier-description">
            {t('account.subscription.tiers.access.description')}
          </p>
          <ul className="subscription-feature-list">
            {ACCESS_FEATURES.map((f) => (
              <li key={f} className="subscription-feature-item">
                <span className="subscription-feature-check" aria-hidden="true">&#10003;</span>
                {t(`account.subscription.features.${f}`)}
              </li>
            ))}
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
          ) : !hasInsider && !identityMode && (
            <Button
              onClick={() => onCheckout('access')}
              disabled={actionLoading}
              variant="secondary"
              className="subscription-subscribe-btn"
            >
              {actionLoading ? <Spinner size="sm" /> : t('account.subscription.subscribe')}
            </Button>
          )}
        </Card>

        {/* Insider tier */}
        <Card className={`subscription-tier-card subscription-tier-featured ${hasInsider ? 'subscription-tier-current' : ''}`}>
          <div className="subscription-tier-header">
            <h2 className="subscription-tier-name">
              {t('account.subscription.tiers.insider.name')}
            </h2>
          </div>
          <p className="subscription-tier-description">
            {t('account.subscription.tiers.insider.description')}
          </p>
          <ul className="subscription-feature-list">
            {INSIDER_FEATURES.map((f) => (
              <li key={f} className="subscription-feature-item">
                <span className="subscription-feature-check" aria-hidden="true">&#10003;</span>
                {t(`account.subscription.features.${f}`)}
              </li>
            ))}
          </ul>
          {hasInsider ? (
            <div className="subscription-tier-status">
              <div className="subscription-tier-badge">
                {t('account.subscription.currentPlan')}
                {isLifetime && <span className="subscription-status-label">{t('account.subscription.lifetime')}</span>}
                {!isLifetime && statusLabel && <span className="subscription-status-label">{statusLabel}</span>}
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
          ) : !identityMode && (
            <Button
              onClick={() => onCheckout('insider')}
              disabled={actionLoading}
              variant="primary"
              className="subscription-subscribe-btn"
            >
              {actionLoading ? <Spinner size="sm" /> : t('account.subscription.subscribe')}
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
