import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { createApiClient, type SubscriptionStatus } from '@adieuu/shared';
import { useAuth } from '../../hooks/useAuth';
import { useAppConfig } from '../../config';
import '../../styles/_subscription.scss';

const FREE_FEATURES = [
  'messaging',
  'aliases',
  'voiceMessages',
  'mediaSharing',
] as const;

const VANGUARD_FEATURES = [
  ...FREE_FEATURES,
  'prioritySupport',
  'earlyAccess',
  'extendedMedia',
  'badge',
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
  const { session, refreshSession } = useAuth();
  const { apiBaseUrl } = useAppConfig();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(false);

  const isVanguard = status?.activeSubscriptions?.includes('vanguard') ?? false;

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await api.subscription.getStatus();
      if (res.success && res.data) {
        setStatus(res.data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [api]);

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

  const handleSubscribe = async () => {
    setActionLoading(true);
    try {
      const res = await api.subscription.createCheckoutSession('vanguard');
      if (res.success && res.data?.url) {
        window.location.href = res.data.url;
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
        window.location.href = res.data.url;
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

      <div className="subscription-grid">
        {/* Free tier */}
        <Card className={`subscription-tier-card ${!isVanguard ? 'subscription-tier-current' : ''}`}>
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
          {!isVanguard && (
            <div className="subscription-tier-badge">
              {t('account.subscription.currentPlan')}
            </div>
          )}
        </Card>

        {/* Vanguard tier */}
        <Card className={`subscription-tier-card subscription-tier-featured ${isVanguard ? 'subscription-tier-current' : ''}`}>
          <div className="subscription-tier-header">
            <h2 className="subscription-tier-name">{t('account.subscription.tiers.vanguard.name')}</h2>
            {/* Price is intentionally not hardcoded; it comes from Stripe */}
          </div>
          <p className="subscription-tier-description">
            {t('account.subscription.tiers.vanguard.description')}
          </p>
          <ul className="subscription-feature-list">
            {VANGUARD_FEATURES.map((f) => (
              <li key={f} className="subscription-feature-item">
                <span className="subscription-feature-check" aria-hidden="true">&#10003;</span>
                {t(`account.subscription.features.${f}`)}
              </li>
            ))}
          </ul>

          {isVanguard ? (
            <div className="subscription-tier-status">
              <div className="subscription-tier-badge">
                {t('account.subscription.currentPlan')}
                {statusLabel && <span className="subscription-status-label">{statusLabel}</span>}
              </div>
              {status?.currentPeriodEnd && (
                <p className="subscription-period-info">
                  {status.cancelAtPeriodEnd
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
          ) : (
            <Button
              onClick={handleSubscribe}
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
