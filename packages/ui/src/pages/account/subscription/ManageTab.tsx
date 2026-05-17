import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentGroup } from '@ark-ui/react';
import { Card } from '../../../components/Card';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import { Alert } from '../../../components/Alert';
import { CheckoutPendingBanner } from '../../../components/CheckoutPendingBanner';
import { useIsMobile } from '../../../hooks/useIsMobile';
import type { ManageTabProps } from './types';
import { formatDate } from './types';
import { AnnualPlansCards } from './PlansTab';
import { PlansComparisonTable } from './PlansComparisonTable';

const ANNUAL_PLANS_HEADING_ID = 'subscription-annual-plans-heading';

export function ManageTab({
  status,
  derived,
  identityMode,
  actionLoading,
  statusLabel,
  onManage,
  pollPending,
  onCancelPoll,
  onCheckout,
}: ManageTabProps) {
  const { t } = useTranslation();
  const { hasAccess, hasInsider, isLifetime, hasVanguard, hasFounder, hasPaidPlan } = derived;
  const isMobile = useIsMobile();
  const [plansLayout, setPlansLayout] = useState<'cards' | 'comparison'>(() =>
    isMobile ? 'cards' : 'comparison',
  );

  const currentTierKey = hasInsider
    ? 'insider'
    : hasAccess
      ? 'access'
      : 'free';

  const plansProps = {
    status,
    derived,
    identityMode,
    actionLoading,
    statusLabel,
    onCheckout,
    onManage,
  };

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

      <div className="subscription-manage-plans subscription-plans">
        <div className="subscription-manage-plans-toolbar">
          <h2 id={ANNUAL_PLANS_HEADING_ID} className="subscription-section-heading">
            {t('account.subscription.sections.annual')}
          </h2>
          <SegmentGroup.Root
            className="subscription-layout-segment-group"
            value={plansLayout}
            onValueChange={(details) => {
              const v = details.value as 'cards' | 'comparison';
              if (v === 'cards' || v === 'comparison') {
                setPlansLayout(v);
              }
            }}
          >
            <SegmentGroup.Indicator className="subscription-layout-segment-indicator" />
            <SegmentGroup.Item className="subscription-layout-segment-item" value="cards">
              <SegmentGroup.ItemText>{t('account.subscription.manage.viewCards')}</SegmentGroup.ItemText>
              <SegmentGroup.ItemControl />
              <SegmentGroup.ItemHiddenInput />
            </SegmentGroup.Item>
            <SegmentGroup.Item className="subscription-layout-segment-item" value="comparison">
              <SegmentGroup.ItemText>{t('account.subscription.manage.viewComparison')}</SegmentGroup.ItemText>
              <SegmentGroup.ItemControl />
              <SegmentGroup.ItemHiddenInput />
            </SegmentGroup.Item>
          </SegmentGroup.Root>
        </div>

        {plansLayout === 'cards' ? (
          <AnnualPlansCards {...plansProps} />
        ) : (
          <PlansComparisonTable {...plansProps} annualPlansHeadingId={ANNUAL_PLANS_HEADING_ID} />
        )}
      </div>

      {!identityMode && (
        <Alert variant="info" className="subscription-manual-change-notice">
          <p>{t('account.subscription.manage.manualChangeLead')}</p>
          <p className="subscription-manual-change-contact">
            <a href="mailto:say@adieuu.com">{t('account.subscription.manage.manualChangeEmail')}</a>
          </p>
        </Alert>
      )}
    </div>
  );
}
