import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { CheckoutPendingBanner } from '../../components/CheckoutPendingBanner';
import { useToast } from '../../components/Toast';
import { createApiClient, type SubscriptionStatus, type PurchasableProductId } from '@adieuu/shared';
import { useAuth } from '../../hooks/useAuth';
import { useAppConfig, usePlatformCapabilities } from '../../config';
import { useCheckoutPolling, type UseCheckoutPollingRun } from '../../hooks/useCheckoutPolling';
import { openCheckoutOrPortalUrl } from '../../utils/open-checkout-url';
import '../../styles/_subscription.scss';

const FREE_FEATURES = [
  'messaging',
  'aliases',
  'voiceMessages',
  'mediaSharing',
] as const;

const ACCESS_FEATURES = [
  ...FREE_FEATURES,
  'prioritySupport',
  'earlyAccess',
] as const;

const INSIDER_FEATURES = [
  ...ACCESS_FEATURES,
  'extendedMedia',
  'largerUploads',
] as const;

const LIFETIME_EXTRA_FEATURES = [
  'lifetimeAccess',
  'supporterBadge',
] as const;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function AccountSubscription() {
  const { t } = useTranslation();
  const { refreshSession } = useAuth();
  const { apiBaseUrl } = useAppConfig();
  const { openExternal } = usePlatformCapabilities();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pollRun, setPollRun] = useState<UseCheckoutPollingRun | null>(null);

  const { phase, cancel } = useCheckoutPolling(api, pollRun);

  const hasAccess = status?.activeSubscriptions?.includes('access') ?? false;
  const hasInsider = status?.activeSubscriptions?.includes('insider') ?? false;
  const isLifetime = status?.isLifetime ?? false;
  const hasVanguard = status?.entitlements?.includes('vanguard') ?? false;
  const hasFounder = status?.entitlements?.includes('founder') ?? false;
  const hasPaidPlan = hasAccess || hasInsider;

  const loadStatus = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setLoading(true);
        setError(false);
      }
      try {
        const res = await api.subscription.getStatus();
        if (res.success && res.data) {
          setStatus(res.data);
          if (!opts?.silent) {
            setError(false);
          }
        } else if (!opts?.silent) {
          setError(true);
        }
      } catch {
        if (!opts?.silent) {
          setError(true);
        }
      } finally {
        if (!opts?.silent) {
          setLoading(false);
        }
      }
    },
    [api],
  );

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const checkoutStatus = searchParams.get('status');
    if (checkoutStatus === 'success') {
      toast.success(t('account.subscription.checkoutSuccess'));
      refreshSession();
      loadStatus();
      setSearchParams({}, { replace: true });
    } else if (checkoutStatus === 'cancelled') {
      toast.info(t('account.subscription.checkoutCancelled'));
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, toast, t, refreshSession, loadStatus]);

  useEffect(() => {
    if (phase === 'completed') {
      toast.success(t('account.subscription.checkoutSuccess'));
      void refreshSession();
      void loadStatus({ silent: true });
      setPollRun(null);
    } else if (phase === 'timeout') {
      toast.info(t('account.subscription.pending.timeout'));
      setPollRun(null);
    } else if (phase === 'cancelled') {
      setPollRun(null);
    }
  }, [phase, toast, t, refreshSession, loadStatus]);

  const handleCheckout = async (product: PurchasableProductId) => {
    if (!status) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await api.subscription.createCheckoutSession(product);
      if (res.success && res.data?.url) {
        const baseline: SubscriptionStatus =
          typeof structuredClone === 'function'
            ? structuredClone(status)
            : {
                ...status,
                activeSubscriptions: [...status.activeSubscriptions],
                entitlements: [...status.entitlements],
              };
        await openCheckoutOrPortalUrl(res.data.url, openExternal);
        setPollRun({ baseline });
        return;
      }
      toast.error(t('account.subscription.errorCheckout'));
    } catch {
      toast.error(t('account.subscription.errorCheckout'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleManage = async () => {
    setActionLoading(true);
    try {
      const res = await api.subscription.createPortalSession();
      if (res.success && res.data?.url) {
        await openCheckoutOrPortalUrl(res.data.url, openExternal);
        return;
      }
      toast.error(t('account.subscription.errorPortal'));
    } catch {
      toast.error(t('account.subscription.errorPortal'));
    } finally {
      setActionLoading(false);
    }
  };

  const statusLabel = status?.status
    ? t(`account.subscription.status.${status.status === 'past_due' ? 'pastDue' : status.status}`, { defaultValue: status.status })
    : null;

  if (loading) {
    return (
      <div className="subscription-page">
        <h1 className="page-title">{t('account.subscription.title')}</h1>
        <div className="subscription-loading">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="subscription-page">
        <h1 className="page-title">{t('account.subscription.title')}</h1>
        <Card>
          <p className="subscription-unavailable">{t('account.subscription.unavailable')}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="subscription-page">
      <h1 className="page-title">{t('account.subscription.title')}</h1>
      <p className="page-subtitle">{t('account.subscription.subtitle')}</p>

      {pollRun && phase === 'pending' ? (
        <CheckoutPendingBanner
          onCancel={() => {
            cancel();
          }}
        />
      ) : null}

      {/* Recurring annual subscriptions */}
      <h2 className="subscription-section-heading">{t('account.subscription.sections.annual')}</h2>
      <div className="subscription-grid">
        {/* Free tier */}
        <Card className={`subscription-tier-card ${!hasPaidPlan ? 'subscription-tier-current' : ''}`}>
          <div className="subscription-tier-header">
            <h2 className="subscription-tier-name">{t('account.subscription.tiers.free.name')}</h2>
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
            <h2 className="subscription-tier-name">{t('account.subscription.tiers.access.name')}</h2>
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
              {!isLifetime && status?.currentPeriodEnd && (
                <p className="subscription-period-info">
                  {status.cancelAt
                    ? t('account.subscription.cancelsOn', { date: formatDate(status.cancelAt) })
                    : status.cancelAtPeriodEnd
                      ? t('account.subscription.cancelAtPeriodEnd')
                      : t('account.subscription.renewsOn', { date: formatDate(status.currentPeriodEnd) })}
                </p>
              )}
              <Button
                onClick={handleManage}
                disabled={actionLoading}
                variant="secondary"
                className="subscription-manage-btn"
              >
                {actionLoading ? <Spinner size="sm" /> : t('account.subscription.manageBilling')}
              </Button>
            </div>
          ) : !hasInsider && (
            <Button
              onClick={() => handleCheckout('access')}
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
            <h2 className="subscription-tier-name">{t('account.subscription.tiers.insider.name')}</h2>
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
              {(hasVanguard || hasFounder) && (
                <p className="subscription-entitlement-info">
                  {hasFounder
                    ? t('account.subscription.entitlements.founder')
                    : t('account.subscription.entitlements.vanguard')}
                </p>
              )}
              {!isLifetime && status?.currentPeriodEnd && (
                <p className="subscription-period-info">
                  {status.cancelAt
                    ? t('account.subscription.cancelsOn', { date: formatDate(status.cancelAt) })
                    : status.cancelAtPeriodEnd
                      ? t('account.subscription.cancelAtPeriodEnd')
                      : t('account.subscription.renewsOn', { date: formatDate(status.currentPeriodEnd) })}
                </p>
              )}
              {status?.hasStripeCustomer && (
                <Button
                  onClick={handleManage}
                  disabled={actionLoading}
                  variant="secondary"
                  className="subscription-manage-btn"
                >
                  {actionLoading ? <Spinner size="sm" /> : t('account.subscription.manageBilling')}
                </Button>
              )}
            </div>
          ) : (
            <Button
              onClick={() => handleCheckout('insider')}
              disabled={actionLoading}
              variant="primary"
              className="subscription-subscribe-btn"
            >
              {actionLoading ? <Spinner size="sm" /> : t('account.subscription.subscribe')}
            </Button>
          )}
        </Card>
      </div>

      {/* Lifetime purchases */}
      <h2 className="subscription-section-heading">{t('account.subscription.sections.lifetime')}</h2>
      <p className="subscription-section-description">{t('account.subscription.sections.lifetimeDescription')}</p>
      <div className="subscription-grid">
        {/* Vanguard */}
        <Card className={`subscription-tier-card ${hasVanguard ? 'subscription-tier-current' : ''}`}>
          <div className="subscription-tier-header">
            <h2 className="subscription-tier-name">{t('account.subscription.tiers.vanguard.name')}</h2>
          </div>
          <p className="subscription-tier-description">
            {t('account.subscription.tiers.vanguard.description')}
          </p>
          <ul className="subscription-feature-list">
            {[...INSIDER_FEATURES, ...LIFETIME_EXTRA_FEATURES].map((f) => (
              <li key={f} className="subscription-feature-item">
                <span className="subscription-feature-check" aria-hidden="true">&#10003;</span>
                {t(`account.subscription.features.${f}`)}
              </li>
            ))}
          </ul>
          {hasVanguard ? (
            <div className="subscription-tier-badge">
              {t('account.subscription.owned')}
            </div>
          ) : !hasFounder && (
            <Button
              onClick={() => handleCheckout('vanguard')}
              disabled={actionLoading}
              variant="secondary"
              className="subscription-subscribe-btn"
            >
              {actionLoading ? <Spinner size="sm" /> : t('account.subscription.buyOnce')}
            </Button>
          )}
        </Card>

        {/* Founder */}
        <Card className={`subscription-tier-card subscription-tier-featured ${hasFounder ? 'subscription-tier-current' : ''}`}>
          <div className="subscription-tier-header">
            <h2 className="subscription-tier-name">{t('account.subscription.tiers.founder.name')}</h2>
          </div>
          <p className="subscription-tier-description">
            {t('account.subscription.tiers.founder.description')}
          </p>
          <ul className="subscription-feature-list">
            {[...INSIDER_FEATURES, ...LIFETIME_EXTRA_FEATURES].map((f) => (
              <li key={f} className="subscription-feature-item">
                <span className="subscription-feature-check" aria-hidden="true">&#10003;</span>
                {t(`account.subscription.features.${f}`)}
              </li>
            ))}
          </ul>
          {hasFounder ? (
            <div className="subscription-tier-badge">
              {t('account.subscription.owned')}
            </div>
          ) : (
            <Button
              onClick={() => handleCheckout('founder')}
              disabled={actionLoading}
              variant="primary"
              className="subscription-subscribe-btn"
            >
              {actionLoading ? <Spinner size="sm" /> : t('account.subscription.buyOnce')}
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
