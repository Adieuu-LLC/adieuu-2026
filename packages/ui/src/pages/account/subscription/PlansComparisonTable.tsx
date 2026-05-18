import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import type { PlansTabProps } from './types';
import {
  COMPARISON_COLUMN_IDS,
  COMPARISON_FEATURE_ORDER,
  type ComparisonColumnId,
  formatDate,
} from './types';
import {
  getSubscriptionFeatureCell,
  parseSubscriptionFeatureVariables,
} from './subscription-feature-cells';

export interface PlansComparisonTableProps extends PlansTabProps {
  annualPlansHeadingId: string;
}

function TierColumnHeader({
  idSuffix,
  tierI18nKey,
  billingKind,
}: {
  idSuffix: string;
  tierI18nKey: 'access' | 'insider' | 'vanguard' | 'founder';
  billingKind: 'annual' | 'lifetime';
}) {
  const { t } = useTranslation();
  const sub =
    billingKind === 'annual'
      ? t('account.subscription.comparison.tierAnnual')
      : t('account.subscription.comparison.tierLifetime');
  return (
    <th scope="col" className="subscription-comparison-tier-col" id={idSuffix}>
      <div className="subscription-comparison-tier-heading">
        <span className="subscription-comparison-tier-heading-name">
          {t(`account.subscription.tiers.${tierI18nKey}.name`)}
        </span>
        <span className="subscription-comparison-tier-heading-sub">{sub}</span>
      </div>
    </th>
  );
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
  const { hasAccess, hasInsider, isLifetime, hasVanguard, hasFounder } = derived;

  const featureVariables = useMemo(
    () =>
      parseSubscriptionFeatureVariables(
        t('account.subscription.featureVariables', { returnObjects: true }),
      ),
    [t],
  );

  const accessColId = `${annualPlansHeadingId}-col-access`;
  const insiderColId = `${annualPlansHeadingId}-col-insider`;
  const vanguardColId = `${annualPlansHeadingId}-col-vanguard`;
  const founderColId = `${annualPlansHeadingId}-col-founder`;

  const renderFeatureCell = (featureKey: string, columnId: ComparisonColumnId) => {
    const cell = getSubscriptionFeatureCell(featureKey, columnId, featureVariables);
    const featureLabel = t(`account.subscription.features.${featureKey}`);
    if (cell.kind === 'variable') {
      return (
        <td
          key={columnId}
          className="subscription-comparison-cell subscription-comparison-cell-value"
          aria-label={`${featureLabel}: ${cell.displayValue}`}
        >
          {cell.displayValue}
        </td>
      );
    }
    return (
      <td
        key={columnId}
        className="subscription-comparison-cell subscription-comparison-cell-check"
      >
        {cell.included ? (
          <span
            className="subscription-feature-check"
            aria-label={`${featureLabel}: ${t('account.subscription.comparison.included')}`}
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
  };

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
            <TierColumnHeader idSuffix={accessColId} tierI18nKey="access" billingKind="annual" />
            <TierColumnHeader idSuffix={insiderColId} tierI18nKey="insider" billingKind="annual" />
            <TierColumnHeader idSuffix={vanguardColId} tierI18nKey="vanguard" billingKind="lifetime" />
            <TierColumnHeader idSuffix={founderColId} tierI18nKey="founder" billingKind="lifetime" />
          </tr>
          <tr className="subscription-comparison-actions-row">
            <td />
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
            <td className="subscription-comparison-actions-cell">
              {hasVanguard ? (
                <div className="subscription-tier-badge">{t('account.subscription.owned')}</div>
              ) : !hasFounder && !identityMode ? (
                <Button
                  onClick={() => onCheckout('vanguard')}
                  disabled={actionLoading}
                  variant="secondary"
                  className="subscription-subscribe-btn"
                >
                  {actionLoading ? <Spinner size="sm" /> : t('account.subscription.buyOnce')}
                </Button>
              ) : null}
            </td>
            <td className="subscription-comparison-actions-cell">
              {hasFounder ? (
                <div className="subscription-tier-badge">{t('account.subscription.owned')}</div>
              ) : !identityMode ? (
                <Button
                  onClick={() => onCheckout('founder')}
                  disabled={actionLoading}
                  variant="primary"
                  className="subscription-subscribe-btn"
                >
                  {actionLoading ? <Spinner size="sm" /> : t('account.subscription.buyOnce')}
                </Button>
              ) : null}
            </td>
          </tr>
        </thead>
        <tbody>
          <tr className="subscription-comparison-billing-row">
            <th scope="row" className="subscription-comparison-feature-name">
              {t('account.subscription.comparison.billingRowLabel')}
            </th>
            {COMPARISON_COLUMN_IDS.map((columnId) => (
              <td
                key={columnId}
                className="subscription-comparison-cell subscription-comparison-cell-billing"
              >
                {columnId === 'access' || columnId === 'insider'
                  ? t('account.subscription.comparison.cellAnnual')
                  : t('account.subscription.comparison.cellLifetime')}
              </td>
            ))}
          </tr>
          {COMPARISON_FEATURE_ORDER.map((featureKey) => (
            <tr key={featureKey}>
              <th scope="row" className="subscription-comparison-feature-name">
                {t(`account.subscription.features.${featureKey}`)}
              </th>
              {COMPARISON_COLUMN_IDS.map((columnId) => renderFeatureCell(featureKey, columnId))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
