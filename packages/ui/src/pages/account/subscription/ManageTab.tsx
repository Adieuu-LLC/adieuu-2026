import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentGroup } from '@ark-ui/react';
import { BorderGlow } from '../../../components/BorderGlow';
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

/** Matches `BorderGlow` intro sequence end (delay 2500ms + fade 1500ms). */
const SUBSCRIPTION_SUMMARY_BORDER_GLOW_INTRO_MS = 4100;

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `0 0 ${Math.round(l * 100)}`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `${Math.round(h * 360)} ${Math.round(s * 100)} ${Math.round(l * 100)}`;
}

function useSummaryBorderGlowColors() {
  const [colors, setColors] = useState({
    primary: '#22d3ee',
    secondary: '#38bdf8',
    bgElevated: '#1a1a2e',
  });

  useEffect(() => {
    const primary = getCssVar('--color-accent-primary') || '#22d3ee';
    const secondary = getCssVar('--color-accent-secondary') || '#38bdf8';
    const bgElevated = getCssVar('--color-bg-elevated') || '#1a1a2e';
    setColors({ primary, secondary, bgElevated });
  }, []);

  return colors;
}

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
  catalogPrices,
  catalogPricesLoading,
}: ManageTabProps) {
  const { t } = useTranslation();
  const glowTheme = useSummaryBorderGlowColors();
  const { hasAccess, hasInsider, isLifetime, hasVanguard, hasFounder, hasGifted, hasPaidPlan } =
    derived;
  const isMobile = useIsMobile();
  const [plansLayout, setPlansLayout] = useState<'cards' | 'comparison'>(() =>
    isMobile ? 'cards' : 'comparison',
  );
  const [summaryGlowIntro, setSummaryGlowIntro] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setSummaryGlowIntro(false), SUBSCRIPTION_SUMMARY_BORDER_GLOW_INTRO_MS);
    return () => window.clearTimeout(id);
  }, []);

  const currentTierKey = hasFounder
    ? 'founder'
    : hasVanguard
      ? 'vanguard'
      : hasInsider
        ? 'insider'
        : hasAccess
          ? 'access'
          : 'unpaid';

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

  const summaryGlowColors = useMemo(() => {
    if (hasFounder) {
      return ['#ca8a04', glowTheme.primary, glowTheme.secondary] as const;
    }
    if (hasVanguard) {
      return [glowTheme.secondary, glowTheme.primary, glowTheme.secondary] as const;
    }
    return [glowTheme.primary, glowTheme.secondary, glowTheme.primary] as const;
  }, [hasFounder, hasVanguard, glowTheme.primary, glowTheme.secondary]);

  const summaryGlowColorHsl = useMemo(
    () => hexToHsl(hasFounder ? '#ca8a04' : glowTheme.primary),
    [hasFounder, glowTheme.primary],
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

      <BorderGlow
        className="subscription-manage-summary-glow"
        animated={summaryGlowIntro}
        colors={[...summaryGlowColors]}
        glowColor={summaryGlowColorHsl}
        backgroundColor={glowTheme.bgElevated}
        borderRadius={12}
        glowRadius={28}
        glowIntensity={0.72}
        fillOpacity={0.3}
      >
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
            {hasPaidPlan && (
              <div className="subscription-manage-badges">
                <span className="subscription-tier-badge subscription-manage-plan-badge">
                  {isLifetime
                    ? t('account.subscription.lifetime')
                    : t('account.subscription.manage.billingPeriodAnnual')}
                </span>
              </div>
            )}
          </div>

          <p className="subscription-manage-description">
            {t(`account.subscription.tiers.${currentTierKey}.description`)}
          </p>

          {hasGifted && hasPaidPlan && (
            <div className="subscription-gifted-callout">
              <span className="subscription-gifted-callout-icon-wrap" aria-hidden>
                <Icon name="star" size="sm" />
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
                <Icon name="trophy" size="sm" />
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

          {!hasPaidPlan && !identityMode && (
            <div className="subscription-sponsorship-cta">
              <Icon name="heart" size="sm" />
              <p>{t('account.subscription.manage.sponsorshipCta')}</p>
            </div>
          )}
        </Card>
      </BorderGlow>

      <div className="subscription-manage-plans subscription-plans" style={{ paddingTop: '20px' }}>
        {/* {!hasPaidPlan && !identityMode && (
          <p className="subscription-read-only-plans-intro">{t('account.subscription.manage.readOnlyPlansIntro')}</p>
        )} */}
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
          <PlansComparisonTable
            {...plansProps}
            annualPlansHeadingId={ANNUAL_PLANS_HEADING_ID}
            catalogPrices={catalogPrices}
            catalogPricesLoading={catalogPricesLoading}
          />
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
