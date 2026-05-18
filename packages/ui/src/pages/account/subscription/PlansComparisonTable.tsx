import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import { Icon } from '../../../icons/Icon';
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

const HEADER_DRAG_THRESHOLD_PX = 8;

export interface PlansComparisonTableProps extends PlansTabProps {
  annualPlansHeadingId: string;
  /**
   * When true, shows the per-column subscribe / manage row above the billing row.
   * Default false — the summary card already surfaces plan CTAs.
   */
  showActionsRow?: boolean;
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

function isComparisonHeaderDragTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.closest('button, a, input, textarea, select, [role="button"]')) {
    return false;
  }
  return el.closest('thead tr:first-child th') != null;
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
}: PlansComparisonTableProps) {
  const { t } = useTranslation();
  const { hasAccess, hasInsider, isLifetime, hasVanguard, hasFounder } = derived;
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startScroll: number; pointerId: number } | null>(null);
  const [scrollState, setScrollState] = useState({
    canLeft: false,
    canRight: false,
    canPanX: false,
  });

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const max = scrollWidth - clientWidth;
    setScrollState({
      canLeft: scrollLeft > 2,
      canRight: max > 2 && scrollLeft < max - 2,
      canPanX: max > 2,
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateScrollState, showActionsRow]);

  const featureVariables = useMemo(
    () =>
      parseSubscriptionFeatureVariables(
        t('account.subscription.featureVariables', { returnObjects: true }),
      ),
    [t],
  );

  useEffect(() => {
    const id = requestAnimationFrame(() => updateScrollState());
    return () => cancelAnimationFrame(id);
  }, [featureVariables, updateScrollState]);

  const accessColId = `${annualPlansHeadingId}-col-access`;
  const insiderColId = `${annualPlansHeadingId}-col-insider`;
  const vanguardColId = `${annualPlansHeadingId}-col-vanguard`;
  const founderColId = `${annualPlansHeadingId}-col-founder`;

  const scrollByTierStep = useCallback((direction: 1 | -1) => {
    const root = scrollRef.current;
    if (!root) return;
    const tierHeader = root.querySelector<HTMLElement>(
      'thead tr:first-child th.subscription-comparison-tier-col',
    );
    const step = tierHeader?.offsetWidth ?? Math.round(root.clientWidth * 0.35);
    root.scrollBy({ left: direction * step, behavior: 'smooth' });
  }, []);

  const endHeaderDrag = useCallback((e: React.PointerEvent, el: HTMLDivElement) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    dragRef.current = null;
    el.classList.remove('subscription-comparison-scroll--dragging');
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    const dx = e.clientX - session.startX;
    if (Math.abs(dx) > HEADER_DRAG_THRESHOLD_PX) {
      e.preventDefault();
    }
  }, []);

  const onScrollPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 2) return;
    if (!isComparisonHeaderDragTarget(e.target)) return;
    dragRef.current = {
      startX: e.clientX,
      startScroll: el.scrollLeft,
      pointerId: e.pointerId,
    };
    el.classList.add('subscription-comparison-scroll--dragging');
    el.setPointerCapture(e.pointerId);
  }, []);

  const onScrollPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragRef.current;
    const el = scrollRef.current;
    if (!session || !el || session.pointerId !== e.pointerId) return;
    const dx = e.clientX - session.startX;
    el.scrollLeft = session.startScroll - dx;
  }, []);

  const onScrollPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;
      endHeaderDrag(e, el);
    },
    [endHeaderDrag],
  );

  const onScrollPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;
      endHeaderDrag(e, el);
    },
    [endHeaderDrag],
  );

  const showScrollNudgeBar = scrollState.canPanX;

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

  const scrollClassName = [
    'subscription-comparison-scroll',
    scrollState.canPanX && 'subscription-comparison-scroll--can-pan-x',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="subscription-comparison-shell">
      {showScrollNudgeBar ? (
        <div
          className="subscription-comparison-scroll-nudge-bar"
          role="region"
          aria-label={t('account.subscription.comparison.scrollNudgeRegionLabel')}
        >
          <div className="subscription-comparison-scroll-nudge-bar__side">
            {scrollState.canLeft ? (
              <button
                type="button"
                className="subscription-comparison-scroll-nudge-btn"
                onClick={() => scrollByTierStep(-1)}
                aria-label={t('account.subscription.comparison.scrollPreviousTiers')}
              >
                <Icon name="arrowLeft" size="sm" />
              </button>
            ) : (
              <span className="subscription-comparison-scroll-nudge-placeholder" aria-hidden />
            )}
          </div>
          <p className="subscription-comparison-scroll-nudge-hint">
            {t('account.subscription.comparison.scrollHint')}
          </p>
          <div className="subscription-comparison-scroll-nudge-bar__side subscription-comparison-scroll-nudge-bar__side--end">
            {scrollState.canRight ? (
              <button
                type="button"
                className="subscription-comparison-scroll-nudge-btn"
                onClick={() => scrollByTierStep(1)}
                aria-label={t('account.subscription.comparison.scrollNextTiers')}
              >
                <Icon name="chevronRight" size="sm" />
              </button>
            ) : (
              <span className="subscription-comparison-scroll-nudge-placeholder" aria-hidden />
            )}
          </div>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className={scrollClassName}
        onScroll={updateScrollState}
        onPointerDown={onScrollPointerDown}
        onPointerMove={onScrollPointerMove}
        onPointerUp={onScrollPointerUp}
        onPointerCancel={onScrollPointerCancel}
      >
        <table
          className="subscription-comparison-table"
          aria-labelledby={annualPlansHeadingId}
        >
          <colgroup>
            <col className="subscription-comparison-col-feature" />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className="subscription-comparison-feature-col subscription-comparison-pin-col subscription-comparison-pin-col--header"
              >
                {t('account.subscription.comparison.featureColumn')}
              </th>
              <TierColumnHeader idSuffix={accessColId} tierI18nKey="access" billingKind="annual" />
              <TierColumnHeader idSuffix={insiderColId} tierI18nKey="insider" billingKind="annual" />
              <TierColumnHeader idSuffix={vanguardColId} tierI18nKey="vanguard" billingKind="lifetime" />
              <TierColumnHeader idSuffix={founderColId} tierI18nKey="founder" billingKind="lifetime" />
            </tr>
            {showActionsRow ? (
              <tr className="subscription-comparison-actions-row">
                <td className="subscription-comparison-pin-col subscription-comparison-pin-col--header subscription-comparison-actions-pin" />
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
            ) : null}
          </thead>
          <tbody>
            <tr className="subscription-comparison-billing-row">
              <th
                scope="row"
                className="subscription-comparison-feature-name subscription-comparison-pin-col"
              >
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
                <th
                  scope="row"
                  className="subscription-comparison-feature-name subscription-comparison-pin-col"
                >
                  {t(`account.subscription.features.${featureKey}`)}
                </th>
                {COMPARISON_COLUMN_IDS.map((columnId) => renderFeatureCell(featureKey, columnId))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
