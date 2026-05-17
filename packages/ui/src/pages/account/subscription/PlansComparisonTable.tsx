import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import type { PlansTabProps } from './types';
import {
  FREE_FEATURES,
  ACCESS_FEATURES,
  INSIDER_FEATURES,
  formatDate,
} from './types';

const TIER_ORDER = ['free', 'access', 'insider'] as const;
type TierColumnId = (typeof TIER_ORDER)[number];

const TIER_FEATURE_SETS: Record<TierColumnId, ReadonlySet<string>> = {
  free: new Set(FREE_FEATURES),
  access: new Set(ACCESS_FEATURES),
  insider: new Set(INSIDER_FEATURES),
};

const FEATURE_ROWS = [...INSIDER_FEATURES];

export interface PlansComparisonTableProps extends PlansTabProps {
  annualPlansHeadingId: string;
}

export function PlansComparisonTable({
  status,
  derived,
  identityMode,
  actionLoading,
  statusLabel,
  onCheckout,
  onManage,
  annualPlansHeadingId,
}: PlansComparisonTableProps) {
  const { t } = useTranslation();
  const { hasAccess, hasInsider, isLifetime, hasPaidPlan } = derived;

  return (
    <div className="subscription-comparison-scroll">
      <table
        className="subscription-comparison-table"
        aria-labelledby={annualPlansHeadingId}
      >
        <thead>
          <tr>
            <th scope="col" className="subscription-comparison-feature-col">
              {t('account.subscription.comparison.featureColumn')}
            </th>
            <th scope="col" className="subscription-comparison-tier-col">
              {t('account.subscription.tiers.free.name')}
            </th>
            <th scope="col" className="subscription-comparison-tier-col">
              {t('account.subscription.tiers.access.name')}
            </th>
            <th scope="col" className="subscription-comparison-tier-col">
              {t('account.subscription.tiers.insider.name')}
            </th>
          </tr>
          <tr className="subscription-comparison-actions-row">
            <td />
            <td className="subscription-comparison-actions-cell">
              <p className="subscription-comparison-price">$0</p>
              {!hasPaidPlan && (
                <span className="subscription-tier-badge">
                  {t('account.subscription.currentPlan')}
                </span>
              )}
            </td>
            <td className="subscription-comparison-actions-cell">
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
                          : t('account.subscription.renewsOn', {
                              date: formatDate(status.currentPeriodEnd),
                            })}
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
              ) : !hasInsider && !identityMode ? (
                <Button
                  onClick={() => onCheckout('access')}
                  disabled={actionLoading}
                  variant="secondary"
                  className="subscription-subscribe-btn"
                >
                  {actionLoading ? <Spinner size="sm" /> : t('account.subscription.subscribe')}
                </Button>
              ) : null}
            </td>
            <td className="subscription-comparison-actions-cell">
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
                          : t('account.subscription.renewsOn', {
                              date: formatDate(status.currentPeriodEnd),
                            })}
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
              ) : !identityMode ? (
                <Button
                  onClick={() => onCheckout('insider')}
                  disabled={actionLoading}
                  variant="primary"
                  className="subscription-subscribe-btn"
                >
                  {actionLoading ? <Spinner size="sm" /> : t('account.subscription.subscribe')}
                </Button>
              ) : null}
            </td>
          </tr>
        </thead>
        <tbody>
          {FEATURE_ROWS.map((featureKey) => (
            <tr key={featureKey}>
              <th scope="row" className="subscription-comparison-feature-name">
                {t(`account.subscription.features.${featureKey}`)}
              </th>
              {TIER_ORDER.map((tierId) => {
                const included = TIER_FEATURE_SETS[tierId].has(featureKey);
                return (
                  <td
                    key={tierId}
                    className="subscription-comparison-cell subscription-comparison-cell-check"
                  >
                    {included ? (
                      <span
                        className="subscription-feature-check"
                        aria-label={t('account.subscription.comparison.included')}
                      >
                        &#10003;
                      </span>
                    ) : (
                      <span className="subscription-comparison-dash" aria-hidden>
                        —
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
