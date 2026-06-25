/**
 * Request Sponsorship page.
 *
 * Displays consent disclosure and a form to submit a sponsorship request.
 * Only accessible to users without an active subscription.
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createApiClient, type PurchasableProductId, PURCHASABLE_PRODUCT_IDS } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import '../../styles/_sponsorship.scss';

export function RequestSponsorshipPage() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const toast = useToast();

  const [firstName, setFirstName] = useState('');
  const [lastInitial, setLastInitial] = useState('');
  const [message, setMessage] = useState('');
  const [preferredProduct, setPreferredProduct] = useState<PurchasableProductId | ''>('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = firstName.trim().length >= 1 && lastInitial.trim().length === 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    try {
      const res = await api.sponsorship.createRequest({
        firstName: firstName.trim(),
        lastInitial: lastInitial.trim().charAt(0).toUpperCase(),
        message: message.trim() || undefined,
        preferredProduct: preferredProduct || undefined,
      });

      if (res.success) {
        setSubmitted(true);
      } else {
        const code = (res as { error?: { code?: string } }).error?.code;
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
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="sponsorship-page">
        <Card className="sponsorship-success-card">
          <h2>{t('sponsorship.request.successHeading')}</h2>
          <p>{t('sponsorship.request.successBody')}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="sponsorship-page">
      <h1 className="sponsorship-heading">{t('sponsorship.request.heading')}</h1>
      <p className="sponsorship-description">{t('sponsorship.request.description')}</p>

      <Card className="sponsorship-consent-card">
        <h3>{t('sponsorship.request.consentHeading')}</h3>
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
      </Card>

      <form className="sponsorship-form" onSubmit={handleSubmit}>
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

        <Button
          variant="primary"
          type="submit"
          disabled={!canSubmit || loading}
          className="sponsorship-form-submit"
        >
          {loading ? <Spinner size="sm" /> : t('sponsorship.request.submit')}
        </Button>
      </form>
    </div>
  );
}
