import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubscriptionCatalogPricesMap, PurchasableProductId } from '@adieuu/shared';
import {
  ComparisonTable,
  COMPARISON_TABLE_PRESET_SUBSCRIPTION,
} from '../../../components/ComparisonTable/ComparisonTable';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import { Tooltip } from '../../../components/Tooltip';
import type { PlansTabProps } from './types';
import {
  COMPARISON_COLUMN_IDS,
  COMPARISON_FEATURE_ORDER,
  type ComparisonColumnId,
  type ComparisonFeatureKey,
  formatDate,
} from './types';
import {
  getSubscriptionFeatureCell,
  parseSubscriptionFeatureVariables,
} from './subscription-feature-cells';
import { footnoteIndicesForFeature } from './comparison-footnotes';
import { CheckoutModal } from './CheckoutModal';

export interface PlansComparisonTableProps extends PlansTabProps {
  annualPlansHeadingId: string;
  /**
   * When true, shows the per-column subscribe / manage row above the billing row.
   * Default false — the summary card already surfaces plan CTAs.
   */
  showActionsRow?: boolean;
  catalogPrices: SubscriptionCatalogPricesMap | null;
  catalogPricesLoading: boolean;
}

const SCROLL_STEP_SELECTOR = 'thead tr:first-child th.comparison-table-tier-col';

function footnoteAnchorId(headingId: string, n: number): string {
  return `${headingId}-comparison-footnote-${n}`;
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
    <th scope="col" className="comparison-table-tier-col" id={idSuffix}>
      <div className="comparison-table-tier-heading">
        <span className="comparison-table-tier-heading-name">
          {t(`account.subscription.tiers.${tierI18nKey}.name`)}
        </span>
        <span className="comparison-table-tier-heading-sub">{sub}</span>
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
  showActionsRow = false,
  catalogPrices,
  catalogPricesLoading,
}: PlansComparisonTableProps) {
  const { t } = useTranslation();
  const { hasAccess, hasInsider, isLifetime, hasVanguard, hasFounder } = derived;

  const [checkoutModalProduct, setCheckoutModalProduct] = useState<PurchasableProductId | null>(null);

  const handleJoinNow = useCallback((product: PurchasableProductId) => {
    setCheckoutModalProduct(product);
  }, []);

  const handleModalCheckout = useCallback(
    (product: PurchasableProductId) => {
      onCheckout(product);
      setCheckoutModalProduct(null);
    },
    [onCheckout],
  );

  const usdFormatter = useMemo(
    () => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }),
    [],
  );

  const featureVariables = useMemo(
    () =>
      parseSubscriptionFeatureVariables(
        t('account.subscription.featureVariables', { returnObjects: true }),
      ),
    [t],
  );

  const footnoteLines = useMemo(() => {
    const raw = t('account.subscription.comparison.footnotes', { returnObjects: true });
    if (!Array.isArray(raw)) return [] as string[];
    return raw.filter((line): line is string => typeof line === 'string' && line.length > 0);
  }, [t]);

  const accessColId = `${annualPlansHeadingId}-col-access`;
  const insiderColId = `${annualPlansHeadingId}-col-insider`;
  const vanguardColId = `${annualPlansHeadingId}-col-vanguard`;
  const founderColId = `${annualPlansHeadingId}-col-founder`;

  const renderBillingCell = (columnId: ComparisonColumnId) => {
    const priceEntry = catalogPrices?.[columnId];
    const fallbackText =
      columnId === 'access' || columnId === 'insider'
        ? t('account.subscription.comparison.cellAnnual')
        : t('account.subscription.comparison.cellLifetime');

    if (catalogPricesLoading) {
      return (
        <td key={columnId} className="comparison-table-cell comparison-table-cell-billing">
          <div className="comparison-table-billing-loading">
            <Spinner size="sm" />
          </div>
        </td>
      );
    }

    if (priceEntry) {
      const amount = usdFormatter.format(priceEntry.unitAmountUsdCents / 100);
      const kindLabel =
        priceEntry.billing === 'annual'
          ? t('account.subscription.comparison.cellAnnual')
          : t('account.subscription.comparison.cellLifetime');
      return (
        <td key={columnId} className="comparison-table-cell comparison-table-cell-billing">
          <div className="comparison-table-billing-amount">{amount}</div>
          <div className="comparison-table-billing-kind">{kindLabel}</div>
        </td>
      );
    }

    return (
      <td key={columnId} className="comparison-table-cell comparison-table-cell-billing">
        {fallbackText}
      </td>
    );
  };

  const renderFeatureCell = (featureKey: string, columnId: ComparisonColumnId) => {
    const cell = getSubscriptionFeatureCell(featureKey, columnId, featureVariables);
    const featureLabel = t(`account.subscription.features.${featureKey}`);
    if (cell.kind === 'variable') {
      return (
        <td
          key={columnId}
          className="comparison-table-cell comparison-table-cell-value"
          aria-label={`${featureLabel}: ${cell.displayValue}`}
        >
          {cell.displayValue}
        </td>
      );
    }
    return (
      <td
        key={columnId}
        className="comparison-table-cell comparison-table-cell-check"
      >
        {cell.included ? (
          <span
            className="subscription-feature-check"
            role="img"
            aria-label={`${featureLabel}: ${t('account.subscription.comparison.included')}`}
          >
            &#10003;
          </span>
        ) : (
          <span className="comparison-table-dash" aria-hidden>
            —
          </span>
        )}
      </td>
    );
  };

  const renderFeatureHeading = (featureKey: ComparisonFeatureKey) => {
    const featureLabel = t(`account.subscription.features.${featureKey}`);
    const fnIndices = footnoteIndicesForFeature(featureKey).filter(
      (n) => n >= 1 && n <= footnoteLines.length,
    );

    return (
      <th
        scope="row"
        className="comparison-table-feature-name comparison-table-pin-col comparison-table-feature-name-with-note"
      >
        <span className="comparison-table-feature-label">{featureLabel}</span>
        {fnIndices.length > 0 ? (
          <span className="comparison-footnote-refs">
            {fnIndices.map((fnIndex) => {
              const footnoteText = footnoteLines[fnIndex - 1];
              if (footnoteText == null) return null;
              return (
                <Tooltip key={fnIndex} content={footnoteText} position="top">
                  <a
                    href={`#${footnoteAnchorId(annualPlansHeadingId, fnIndex)}`}
                    className="comparison-footnote-ref"
                    aria-label={t('account.subscription.comparison.footnoteJumpTo', { n: fnIndex })}
                    onClick={(e) => {
                      e.preventDefault();
                      document
                        .getElementById(footnoteAnchorId(annualPlansHeadingId, fnIndex))
                        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }}
                  >
                    <sup>{fnIndex}</sup>
                  </a>
                </Tooltip>
              );
            })}
          </span>
        ) : null}
      </th>
    );
  };

  const renderJoinNowCell = (columnId: ComparisonColumnId) => {
    const ownsColumn =
      (columnId === 'access' && hasAccess) ||
      (columnId === 'insider' && hasInsider) ||
      (columnId === 'vanguard' && hasVanguard) ||
      (columnId === 'founder' && hasFounder);

    if (ownsColumn) {
      return (
        <td key={columnId} className="comparison-table-cell comparison-table-cell-join">
          <span className="subscription-tier-badge subscription-tier-badge--owned">
            {t('account.subscription.currentPlan')}
          </span>
        </td>
      );
    }

    if (identityMode) {
      return <td key={columnId} className="comparison-table-cell comparison-table-cell-join" />;
    }

    return (
      <td key={columnId} className="comparison-table-cell comparison-table-cell-join">
        <Button
          variant="primary"
          className="comparison-table-join-btn"
          onClick={() => handleJoinNow(columnId)}
          disabled={actionLoading}
        >
          {t('account.subscription.comparison.joinNow')}
        </Button>
      </td>
    );
  };

  const renderJoinNowRow = (key: string) => (
    <tr key={key} className="comparison-table-join-row">
      <th
        scope="row"
        className="comparison-table-feature-name comparison-table-pin-col"
      >
        {t('account.subscription.comparison.joinNowRowLabel')}
      </th>
      {COMPARISON_COLUMN_IDS.map((columnId) => renderJoinNowCell(columnId))}
    </tr>
  );

  return (
    <>
    <ComparisonTable
      labelledBy={annualPlansHeadingId}
      nudgeRegionAriaLabel={t('account.subscription.comparison.scrollNudgeRegionLabel')}
      nudgeHint={t('account.subscription.comparison.scrollHint')}
      scrollPrevAriaLabel={t('account.subscription.comparison.scrollPreviousTiers')}
      scrollNextAriaLabel={t('account.subscription.comparison.scrollNextTiers')}
      scrollStepColumnSelector={SCROLL_STEP_SELECTOR}
      layoutDeps={[
        showActionsRow,
        featureVariables,
        catalogPrices,
        catalogPricesLoading,
        footnoteLines,
      ]}
      classNames={COMPARISON_TABLE_PRESET_SUBSCRIPTION}
    >
      <colgroup>
        <col className="comparison-table-col-feature" />
        <col />
        <col />
        <col />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th
            scope="col"
            className="comparison-table-feature-col comparison-table-pin-col comparison-table-pin-col--header"
          >
            {t('account.subscription.comparison.featureColumn')}
          </th>
          <TierColumnHeader idSuffix={accessColId} tierI18nKey="access" billingKind="annual" />
          <TierColumnHeader idSuffix={insiderColId} tierI18nKey="insider" billingKind="annual" />
          <TierColumnHeader idSuffix={vanguardColId} tierI18nKey="vanguard" billingKind="lifetime" />
          <TierColumnHeader idSuffix={founderColId} tierI18nKey="founder" billingKind="lifetime" />
        </tr>
        {showActionsRow ? (
          <tr className="comparison-table-actions-row">
            <td className="comparison-table-pin-col comparison-table-pin-col--header comparison-table-actions-pin" />
            <td className="comparison-table-actions-cell">
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
            <td className="comparison-table-actions-cell">
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
            <td className="comparison-table-actions-cell">
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
            <td className="comparison-table-actions-cell">
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
        ) : null}
      </thead>
      <tbody>
        <tr className="comparison-table-billing-row">
          <th
            scope="row"
            className="comparison-table-feature-name comparison-table-pin-col"
          >
            {t('account.subscription.comparison.billingRowLabel')}
          </th>
          {COMPARISON_COLUMN_IDS.map((columnId) => renderBillingCell(columnId))}
        </tr>
        {renderJoinNowRow('join-now-top')}
        {COMPARISON_FEATURE_ORDER.map((featureKey) => (
          <tr key={featureKey}>
            {renderFeatureHeading(featureKey)}
            {COMPARISON_COLUMN_IDS.map((columnId) => renderFeatureCell(featureKey, columnId))}
          </tr>
        ))}
        {renderJoinNowRow('join-now-bottom')}
      </tbody>
      {footnoteLines.length > 0 ? (
        <tfoot>
          <tr className="comparison-table-footnotes-row">
            <td colSpan={5} className="comparison-table-footnotes-cell">
              <section
                className="comparison-table-footnotes"
                aria-label={t('account.subscription.comparison.footnotesRegionLabel')}
              >
                {footnoteLines.map((text, i) => {
                  const n = i + 1;
                  return (
                    <p
                      key={n}
                      id={footnoteAnchorId(annualPlansHeadingId, n)}
                      className="comparison-table-footnote-line"
                    >
                      <sup>{n}</sup>
                      <span className="comparison-table-footnote-line-text">{text}</span>
                    </p>
                  );
                })}
              </section>
            </td>
          </tr>
        </tfoot>
      ) : null}
    </ComparisonTable>

    {checkoutModalProduct != null && (
      <CheckoutModal
        open
        onOpenChange={(open) => { if (!open) setCheckoutModalProduct(null); }}
        product={checkoutModalProduct}
        catalogPrices={catalogPrices}
        onCheckout={handleModalCheckout}
        loading={actionLoading}
      />
    )}
    </>
  );
}
