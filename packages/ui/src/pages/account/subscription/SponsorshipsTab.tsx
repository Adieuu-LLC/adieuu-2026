/**
 * Sponsorships tab — embedded within the Subscription page.
 *
 * Shows the sponsorship directory for potential sponsors, and allows
 * the user to request sponsorship (if eligible) or view their request status.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@ark-ui/react';
import {
  createApiClient,
  type SponsorshipDirectoryEntry,
  type SponsorshipRequestStatus,
  type SponsorStats,
  type PurchasableProductId,
  PURCHASABLE_PRODUCT_IDS,
} from '@adieuu/shared';
import { useAppConfig } from '../../../config';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { BorderGlow } from '../../../components/BorderGlow';
import { Spinner } from '../../../components/Spinner';
import { Alert } from '../../../components/Alert';
import { useToast } from '../../../components/Toast';
import { SponsorCheckoutModal } from '../../sponsorship/SponsorCheckoutModal';
import type { SubscriptionDerivedState } from './types';

export interface SponsorshipsTabProps {
  derived: SubscriptionDerivedState;
  identityMode: boolean;
}

export function SponsorshipsTab({ derived, identityMode }: SponsorshipsTabProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const toast = useToast();

  const [requestStatus, setRequestStatus] = useState<SponsorshipRequestStatus | null>(null);
  const [entries, setEntries] = useState<SponsorshipDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sponsorTarget, setSponsorTarget] = useState<SponsorshipDirectoryEntry | null>(null);
  const [sponsorStats, setSponsorStats] = useState<SponsorStats | null>(null);
  const [achievementToggling, setAchievementToggling] = useState(false);

  // Request form state
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastInitial, setLastInitial] = useState('');
  const [message, setMessage] = useState('');
  const [preferredProduct, setPreferredProduct] = useState<PurchasableProductId | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const canRequest = !derived.hasPaidPlan && !identityMode;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, dirRes, statsRes] = await Promise.all([
        api.sponsorship.getStatus(),
        api.sponsorship.getDirectory(),
        identityMode ? Promise.resolve(null) : api.sponsorship.getSponsorStats(),
      ]);
      if (statusRes.success && statusRes.data) {
        setRequestStatus(statusRes.data);
      }
      if (dirRes.success && dirRes.data) {
        setEntries(dirRes.data.entries);
        setHasMore(dirRes.data.hasMore);
      }
      if (statsRes && statsRes.success && statsRes.data) {
        setSponsorStats(statsRes.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [api, identityMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleLoadMore() {
    if (loadingMore || !entries.length) return;
    setLoadingMore(true);
    try {
      const last = entries[entries.length - 1]!;
      const res = await api.sponsorship.getDirectory(last.createdAt);
      if (res.success && res.data) {
        setEntries((prev) => [...prev, ...res.data!.entries]);
        setHasMore(res.data.hasMore);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await api.sponsorship.createRequest({
        firstName: firstName.trim(),
        lastInitial: lastInitial.trim().charAt(0).toUpperCase(),
        message: message.trim() || undefined,
        preferredProduct: preferredProduct || undefined,
      });
      if (res.success) {
        toast.success(t('sponsorship.request.successHeading'));
        setShowRequestForm(false);
        await fetchData();
      } else {
        const code = (res as any).error?.code; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (code === 'HAS_SUBSCRIPTION') {
          toast.error(t('sponsorship.errors.hasSubscription'));
        } else if (code === 'ALREADY_REQUESTED') {
          toast.error(t('sponsorship.errors.alreadyRequested'));
        } else {
          toast.error(t('sponsorship.errors.generic'));
        }
      }
    } catch {
      toast.error(t('sponsorship.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw() {
    if (withdrawing) return;
    setWithdrawing(true);
    try {
      const res = await api.sponsorship.withdrawRequest();
      if (res.success) {
        toast.success(t('sponsorship.status.withdrawn'));
        await fetchData();
      } else {
        toast.error(t('sponsorship.errors.generic'));
      }
    } catch {
      toast.error(t('sponsorship.errors.generic'));
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleAchievementToggle(checked: boolean) {
    if (achievementToggling) return;
    setAchievementToggling(true);
    setSponsorStats((prev) => prev ? { ...prev, hasAchievementOptIn: checked } : prev);
    try {
      const res = await api.sponsorship.setSponsorAchievement(checked);
      if (!res.success) {
        setSponsorStats((prev) => prev ? { ...prev, hasAchievementOptIn: !checked } : prev);
        toast.error(t('sponsorship.errors.generic'));
      }
    } catch {
      setSponsorStats((prev) => prev ? { ...prev, hasAchievementOptIn: !checked } : prev);
      toast.error(t('sponsorship.errors.generic'));
    } finally {
      setAchievementToggling(false);
    }
  }

  if (loading) {
    return (
      <div className="sponsorship-tab-loading">
        <Spinner size="lg" />
      </div>
    );
  }

  const hasActiveRequest = requestStatus?.hasRequest && requestStatus.status === 'active';
  const hasFulfilledRequest = requestStatus?.hasRequest && requestStatus.status === 'fulfilled';
  const canSubmit = firstName.trim().length >= 1 && lastInitial.trim().length === 1;

  const showSponsorCallout = !identityMode && sponsorStats && sponsorStats.lifetimeCount > 0;

  return (
    <div className="sponsorship-tab">
      {/* Sponsor callout card */}
      {showSponsorCallout && (
        <BorderGlow
          className="sponsorship-sponsor-callout-glow"
          colors={['var(--color-success)', 'color-mix(in srgb, var(--color-success) 60%, var(--color-accent-primary))']}
        >
          <Card className="sponsorship-sponsor-callout" variant="elevated">
            <p className="sponsorship-sponsor-callout-eyebrow">
              {t('sponsorship.sponsorCallout.eyebrow')}
            </p>
            <h2 className="sponsorship-sponsor-callout-heading">
              {t('sponsorship.sponsorCallout.heading')}
            </h2>
            <p className="sponsorship-sponsor-callout-stats">
              {t('sponsorship.sponsorCallout.stats', {
                lifetimeCount: sponsorStats.lifetimeCount,
                activeCount: sponsorStats.activeCount,
              })}
            </p>
            <div className="sponsorship-sponsor-callout-achievement">
              <div className="sponsorship-sponsor-callout-achievement-text">
                <p className="sponsorship-sponsor-callout-achievement-label">
                  {t('sponsorship.sponsorCallout.achievementLabel')}
                </p>
                <p className="sponsorship-sponsor-callout-achievement-desc">
                  {t('sponsorship.sponsorCallout.achievementDescription')}
                </p>
              </div>
              <Switch.Root
                checked={sponsorStats.hasAchievementOptIn}
                disabled={achievementToggling}
                onCheckedChange={(details) => handleAchievementToggle(details.checked)}
                className="sidebar-filter-switch"
              >
                <Switch.Control className="sidebar-filter-switch-control">
                  <Switch.Thumb className="sidebar-filter-switch-thumb" />
                </Switch.Control>
                <Switch.HiddenInput />
              </Switch.Root>
            </div>
          </Card>
        </BorderGlow>
      )}

      {/* Request sponsorship section */}
      {canRequest && !hasActiveRequest && !hasFulfilledRequest && (
        <Card className="sponsorship-tab-request-section">
          {!showRequestForm ? (
            <div className="sponsorship-tab-request-intro">
              <h3>{t('sponsorship.request.heading')}</h3>
              <p>{t('sponsorship.request.description')}</p>
              <Button
                variant="secondary"
                onClick={() => setShowRequestForm(true)}
              >
                {t('sponsorship.request.submit')}
              </Button>
            </div>
          ) : (
            <div className="sponsorship-tab-request-form-wrapper">
              <h3>{t('sponsorship.request.heading')}</h3>
              <Alert variant="info" className="sponsorship-tab-consent-alert">
                <p>{t('sponsorship.request.consentBody')}</p>
                <ul className="sponsorship-consent-list">
                  <li>{t('sponsorship.request.consentItems.name')}</li>
                  <li>{t('sponsorship.request.consentItems.jurisdiction')}</li>
                  <li>{t('sponsorship.request.consentItems.message')}</li>
                  <li>{t('sponsorship.request.consentItems.preference')}</li>
                </ul>
                <p className="sponsorship-consent-acknowledge">
                  {t('sponsorship.request.consentAcknowledge')}
                </p>
              </Alert>

              <form className="sponsorship-form" onSubmit={handleSubmitRequest}>
                <div className="sponsorship-form-row">
                  <label className="sponsorship-form-label">
                    {t('sponsorship.request.firstNameLabel')}
                    <input
                      type="text"
                      className="sponsorship-form-input"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={t('sponsorship.request.firstNamePlaceholder')}
                      maxLength={50}
                      required
                    />
                  </label>
                  <label className="sponsorship-form-label sponsorship-form-label--short">
                    {t('sponsorship.request.lastInitialLabel')}
                    <input
                      type="text"
                      className="sponsorship-form-input"
                      value={lastInitial}
                      onChange={(e) => setLastInitial(e.target.value.slice(0, 1))}
                      placeholder={t('sponsorship.request.lastInitialPlaceholder')}
                      maxLength={1}
                      required
                    />
                  </label>
                </div>

                <label className="sponsorship-form-label">
                  {t('sponsorship.request.messageLabel')}
                  <textarea
                    className="sponsorship-form-textarea"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t('sponsorship.request.messagePlaceholder')}
                    maxLength={280}
                    rows={3}
                  />
                  <span className="sponsorship-form-char-count">{message.length}/280</span>
                </label>

                <label className="sponsorship-form-label">
                  {t('sponsorship.request.preferenceLabel')}
                  <select
                    className="sponsorship-form-select"
                    value={preferredProduct}
                    onChange={(e) => setPreferredProduct(e.target.value as PurchasableProductId | '')}
                  >
                    <option value="">{t('sponsorship.request.preferencePlaceholder')}</option>
                    {PURCHASABLE_PRODUCT_IDS.map((id) => (
                      <option key={id} value={id}>
                        {t(`account.subscription.tiers.${id}.name`)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="sponsorship-form-actions">
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={!canSubmit || submitting}
                  >
                    {submitting ? <Spinner size="sm" /> : t('sponsorship.request.submit')}
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => setShowRequestForm(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </Card>
      )}

      {/* Own request status */}
      {hasActiveRequest && (
        <Card className="sponsorship-tab-status-card">
          <h3>{t('sponsorship.status.heading')}</h3>
          <p className="sponsorship-tab-status-badge sponsorship-tab-status-badge--active">
            {t('sponsorship.status.active')}
          </p>
          <p className="sponsorship-tab-status-date">
            {t('sponsorship.status.createdAt', {
              date: new Date(requestStatus!.createdAt!).toLocaleDateString(),
            })}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleWithdraw}
            disabled={withdrawing}
          >
            {withdrawing ? <Spinner size="sm" /> : t('sponsorship.status.withdrawButton')}
          </Button>
        </Card>
      )}

      {hasFulfilledRequest && (
        <Card className="sponsorship-tab-status-card sponsorship-tab-status-card--fulfilled">
          <h3>{t('sponsorship.status.heading')}</h3>
          <p className="sponsorship-tab-status-badge sponsorship-tab-status-badge--fulfilled">
            {t('sponsorship.status.fulfilled')}
          </p>
          {requestStatus!.fulfilledAt && (
            <p className="sponsorship-tab-status-date">
              {t('sponsorship.status.fulfilledAt', {
                date: new Date(requestStatus!.fulfilledAt).toLocaleDateString(),
              })}
            </p>
          )}
          {requestStatus!.sponsorRevealed && requestStatus!.sponsorFirstName && (
            <p className="sponsorship-tab-status-sponsor">
              {t('sponsorship.status.sponsorRevealedBy', {
                name: `${requestStatus!.sponsorFirstName} ${requestStatus!.sponsorLastInitial ?? ''}.`,
              })}
            </p>
          )}
        </Card>
      )}

      {/* Directory section */}
      <div className="sponsorship-tab-directory">
        <h3 className="sponsorship-tab-directory-heading">
          {t('sponsorship.directory.heading')}
        </h3>
        <p className="sponsorship-tab-directory-description">
          {t('sponsorship.directory.description')}
        </p>

        {entries.length === 0 ? (
          <Card className="sponsorship-empty-card">
            <p>{t('sponsorship.directory.emptyBody')}</p>
          </Card>
        ) : (
          <>
            <div className="sponsorship-directory-grid">
              {entries.map((entry) => (
                <Card key={entry.id} className="sponsorship-directory-card">
                  <div className="sponsorship-directory-card-header">
                    <span className="sponsorship-directory-card-name">
                      {entry.firstName} {entry.lastInitial}.
                    </span>
                    <span className="sponsorship-directory-card-jurisdiction">
                      {entry.jurisdiction}
                    </span>
                  </div>
                  {entry.message && (
                    <p className="sponsorship-directory-card-message">{entry.message}</p>
                  )}
                  <div className="sponsorship-directory-card-footer">
                    {entry.preferredProduct && (
                      <span className="sponsorship-directory-card-preference">
                        {t('sponsorship.directory.cardPreference', {
                          product: t(`account.subscription.tiers.${entry.preferredProduct}.name`),
                        })}
                      </span>
                    )}
                    <span className="sponsorship-directory-card-date">
                      {t('sponsorship.directory.cardDate', {
                        date: new Date(entry.createdAt).toLocaleDateString(),
                      })}
                    </span>
                  </div>
                  {!identityMode && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="sponsorship-directory-card-btn"
                      onClick={() => setSponsorTarget(entry)}
                    >
                      {t('sponsorship.directory.sponsorButton')}
                    </Button>
                  )}
                </Card>
              ))}
            </div>

            {hasMore && (
              <Button
                variant="secondary"
                className="sponsorship-load-more"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? <Spinner size="sm" /> : t('sponsorship.directory.loadMore')}
              </Button>
            )}
          </>
        )}
      </div>

      {sponsorTarget && (
        <SponsorCheckoutModal
          open={!!sponsorTarget}
          entry={sponsorTarget}
          onClose={() => {
            setSponsorTarget(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
