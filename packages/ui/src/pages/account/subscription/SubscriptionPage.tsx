import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/Card';
import { Spinner } from '../../../components/Spinner';
import { Tabs, TabList, TabTrigger, TabContent } from '../../../components/Tabs';
import { useToast } from '../../../components/Toast';
import {
  createApiClient,
  type SubscriptionStatus,
  type PurchasableProductId,
  type SubscriptionTierId,
} from '@adieuu/shared';
import { useAuth } from '../../../hooks/useAuth';
import { useAppConfig, usePlatformCapabilities } from '../../../config';
import { useCheckoutPolling, type UseCheckoutPollingRun } from '../../../hooks/useCheckoutPolling';
import { openCheckoutOrPortalUrl } from '../../../utils/open-checkout-url';
import { ManageTab } from './ManageTab';
import { PlansTab } from './PlansTab';
import { LifetimeTab } from './LifetimeTab';
import type { SubscriptionDerivedState } from './types';
import '../../../styles/_subscription.scss';

const VALID_TABS = ['manage', 'subscriptions', 'lifetime'] as const;
type SubscriptionTab = (typeof VALID_TABS)[number];

function deriveState(status: SubscriptionStatus | null): SubscriptionDerivedState {
  const hasAccess = status?.activeSubscriptions?.includes('access') ?? false;
  const hasInsider = status?.activeSubscriptions?.includes('insider') ?? false;
  const isLifetime = status?.isLifetime ?? false;
  const hasVanguard = status?.entitlements?.includes('vanguard') ?? false;
  const hasFounder = status?.entitlements?.includes('founder') ?? false;
  const hasPaidPlan = hasAccess || hasInsider;
  return { hasAccess, hasInsider, isLifetime, hasVanguard, hasFounder, hasPaidPlan };
}

function deriveFromSession(
  subscriptions: string[],
  entitlements: string[],
): SubscriptionDerivedState {
  const hasAccess = subscriptions.includes('access');
  const hasInsider = subscriptions.includes('insider');
  const hasVanguard = entitlements.includes('vanguard');
  const hasFounder = entitlements.includes('founder');
  const hasPaidPlan = hasAccess || hasInsider;
  const isLifetime = (hasVanguard || hasFounder) && hasInsider;
  return { hasAccess, hasInsider, isLifetime, hasVanguard, hasFounder, hasPaidPlan };
}

interface IdentitySessionData {
  subscriptions: SubscriptionTierId[];
  entitlements: string[];
}

export function AccountSubscription() {
  const { t } = useTranslation();
  const { refreshSession, status: authStatus } = useAuth();
  const { apiBaseUrl } = useAppConfig();
  const { openExternal } = usePlatformCapabilities();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const isIdentityRoute = location.pathname.startsWith('/identity/');
  const routeBase = isIdentityRoute ? '/identity/subscription' : '/account/subscription';

  const activeTab: SubscriptionTab = VALID_TABS.includes(tab as SubscriptionTab)
    ? (tab as SubscriptionTab)
    : 'manage';

  const handleTabChange = (newTab: string) => {
    navigate(`${routeBase}/${newTab}`, { replace: true });
  };

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [identitySessionData, setIdentitySessionData] = useState<IdentitySessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pollRun, setPollRun] = useState<UseCheckoutPollingRun | null>(null);

  /** From session API — not useAuth alone: auth can lag after identity login until refreshSession runs. */
  const identityMode = identitySessionData != null;

  const { phase, cancel } = useCheckoutPolling(api, pollRun);

  const derived = useMemo(() => {
    if (identitySessionData) {
      return deriveFromSession(
        identitySessionData.subscriptions,
        identitySessionData.entitlements,
      );
    }
    return deriveState(status);
  }, [identitySessionData, status]);

  const loadStatus = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setLoading(true);
      }
      try {
        const sessionRes = await api.auth.getSession();

        if (!sessionRes.success || !sessionRes.data) {
          if (!opts?.silent) {
            setError(true);
            setIdentitySessionData(null);
            setStatus(null);
          }
          return;
        }

        const data = sessionRes.data as unknown as Record<string, unknown>;

        if ('sessionType' in data && data.sessionType === 'identity') {
          setError(false);
          setIdentitySessionData({
            subscriptions: (data.subscriptions as SubscriptionTierId[]) ?? [],
            entitlements: (data.entitlements as string[]) ?? [],
          });
          setStatus(null);
          return;
        }

        setIdentitySessionData(null);

        if (!opts?.silent) {
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
        }
      } catch {
        if (!opts?.silent) {
          setError(true);
          setIdentitySessionData(null);
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
    if (authStatus === 'loading') return;
    loadStatus();
  }, [loadStatus, authStatus]);

  useEffect(() => {
    if (identityMode) return;
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
  }, [searchParams, setSearchParams, toast, t, refreshSession, loadStatus, identityMode]);

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
    if (!status || identityMode) return;
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
    if (identityMode) return;
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

  if (error && !identitySessionData) {
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

      <Tabs value={activeTab} onValueChange={handleTabChange} className="slide-up">
        <TabList>
          <TabTrigger value="manage">
            {t('account.subscription.tabs.manage')}
          </TabTrigger>
          <TabTrigger value="subscriptions">
            {t('account.subscription.tabs.subscriptions')}
          </TabTrigger>
          <TabTrigger value="lifetime">
            {t('account.subscription.tabs.lifetime')}
          </TabTrigger>
        </TabList>

        <TabContent value="manage">
          <ManageTab
            status={status}
            derived={derived}
            identityMode={identityMode}
            actionLoading={actionLoading}
            statusLabel={statusLabel}
            onManage={handleManage}
            pollPending={!!pollRun && phase === 'pending'}
            onCancelPoll={cancel}
          />
        </TabContent>

        <TabContent value="subscriptions">
          <PlansTab
            status={status}
            derived={derived}
            identityMode={identityMode}
            actionLoading={actionLoading}
            statusLabel={statusLabel}
            onCheckout={handleCheckout}
            onManage={handleManage}
          />
        </TabContent>

        <TabContent value="lifetime">
          <LifetimeTab
            status={status}
            derived={derived}
            identityMode={identityMode}
            actionLoading={actionLoading}
            onCheckout={handleCheckout}
          />
        </TabContent>
      </Tabs>
    </div>
  );
}
