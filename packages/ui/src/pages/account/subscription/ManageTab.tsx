import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentGroup } from '@ark-ui/react';
import { Card } from '../../../components/Card';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import { Alert } from '../../../components/Alert';
import { CheckoutPendingBanner } from '../../../components/CheckoutPendingBanner';
import { Icon } from '../../../icons/Icon';
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
  const { hasAccess, hasInsider, isLifetime, hasVanguard, hasFounder, hasGifted, hasPaidPlan } = derived;
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

  const summaryCardClassName = useMemo(
    () =>
      [
        'subscription-manage-summary',
        hasPaidPlan && 'subscription-manage-summary--has-plan',
        hasFounder && 'subscription-manage-summary--tier-founder',
        hasVanguard && !hasFounder && 'subscription-manage-summary--tier-vanguard',
        hasGifted && hasPaidPlan && 'subscription-manage-summary--is-gifted',
      ]
        .filter(Boolean)
        .join(' '),
    [hasPaidPlan, hasFounder, hasVanguard, hasGifted],
  );

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

      <Card className={summaryCardClassName} variant="elevated">
        <div className="subscription-manage-header">
          <div className="subscription-manage-title-block">
            <p className="subscription-manage-eyebrow">
              {t('account.subscription.manage.currentPlanLabel')}
            </p>
            <h2 className="subscription-manage-tier-name">
              {t(`account.subscription.tiers.${currentTierKey}.name`)}
            </h2>
          </div>
          <div className="subscription-manage-badges">
            {hasPaidPlan && (
              <span className="subscription-tier-badge subscription-manage-plan-badge">
                {t('account.subscription.currentPlan')}
                {isLifetime && (
                  <span className="subscription-status-label">
                    {t('account.subscription.lifetime')}
                  </span>
                )}
                {!isLifetime && statusLabel && (
                  <span className="subscription-status-label">{statusLabel}</span>
                )}
              </span>
            )}
            {!hasPaidPlan && (
              <span className="subscription-tier-badge subscription-manage-plan-badge">
                {t('account.subscription.currentPlan')}
              </span>
            )}
          </div>
        </div>

        <p className="subscription-manage-description">
          {t(`account.subscription.tiers.${currentTierKey}.description`)}
        </p>

        {hasGifted && hasPaidPlan && (
          <div className="subscription-gifted-callout">
            <span className="subscription-gifted-callout-icon-wrap" aria-hidden>
              <Icon name="star" size="lg" />
            </span>
            <p className="subscription-gifted-callout-text">
              {t('account.subscription.manage.giftedSubscription')}
            </p>
          </div>
        )}

        {(hasVanguard || hasFounder) && (
          <div
            className={`subscription-supporter-callout ${hasFounder ? 'subscription-supporter-callout--founder' : 'subscription-supporter-callout--vanguard'}`}
          >
            <span className="subscription-supporter-callout-icon-wrap" aria-hidden>
              <Icon name="trophy" size="lg" />
            </span>
            <div className="subscription-supporter-callout-text">
              <p className="subscription-supporter-callout-title">
                {hasFounder
                  ? t('account.subscription.entitlements.founder')
                  : t('account.subscription.entitlements.vanguard')}
              </p>
              <p className="subscription-supporter-callout-sub">
                {hasFounder
                  ? t('account.subscription.entitlements.founderCelebrate')
                  : t('account.subscription.entitlements.vanguardCelebrate')}
              </p>
            </div>
          </div>
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
            <p className="subscription-manage-stripe-intro">
              {t('account.subscription.manage.stripeBillingIntro')}
            </p>
            <p className="subscription-manage-portal-hint">
              {t('account.subscription.manage.billingPortal')}
            </p>
            <Button
              type="button"
              onClick={() => void onManage()}
              disabled={actionLoading}
              variant="secondary"
              className="subscription-manage-btn"
            >
              {actionLoading ? <Spinner size="sm" /> : t('account.subscription.billing.openStripe')}
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
