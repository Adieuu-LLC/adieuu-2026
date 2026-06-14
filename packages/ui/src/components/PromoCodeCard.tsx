import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PromoCodeRedeemErrorCode } from '@adieuu/shared';
import { Card } from './Card';
import { Input } from './Input';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { Alert } from './Alert';

export const PROMO_CODE_CARD_ID = 'subscription-promo-code-card';

export interface PromoCodeCardProps {
  loading: boolean;
  onRedeem: (shortcode: string) => Promise<{ ok: true } | { ok: false; errorCode?: string }>;
}

const PROMO_ERROR_I18N_KEYS: Record<PromoCodeRedeemErrorCode | 'VALIDATION_FAILED' | 'RATE_LIMITED', string> = {
  PROMO_INVALID: 'account.subscription.promo.errors.invalidCode',
  PROMO_NOT_FOUND: 'account.subscription.promo.errors.notFound',
  PROMO_EXPIRED: 'account.subscription.promo.errors.expired',
  PROMO_JURISDICTION: 'account.subscription.promo.errors.jurisdiction',
  PROMO_MAX_USES: 'account.subscription.promo.errors.maxUses',
  PROMO_ALREADY_REDEEMED: 'account.subscription.promo.errors.alreadyRedeemed',
  PROMO_MISSING_REQUIRED: 'account.subscription.promo.errors.missingRequired',
  PROMO_INCOMPATIBLE: 'account.subscription.promo.errors.incompatible',
  PROMO_AUDIENCE: 'account.subscription.promo.errors.audience',
  VALIDATION_FAILED: 'account.subscription.promo.errors.invalid',
  RATE_LIMITED: 'account.subscription.promo.errors.rateLimited',
};

function resolvePromoErrorMessage(
  t: (key: string) => string,
  errorCode?: string,
): string {
  if (!errorCode) {
    return t('account.subscription.promo.errors.generic');
  }

  const key = PROMO_ERROR_I18N_KEYS[errorCode as keyof typeof PROMO_ERROR_I18N_KEYS];
  if (key) {
    return t(key);
  }

  return t('account.subscription.promo.errors.generic');
}

export function PromoCodeCard({ loading, onRedeem }: PromoCodeCardProps) {
  const { t } = useTranslation();
  const formId = useId();
  const [shortcode, setShortcode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = shortcode.trim();
    if (!trimmed) {
      setFeedback({
        type: 'error',
        message: t('account.subscription.promo.errors.invalid'),
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const result = await onRedeem(trimmed);
      if (result.ok) {
        setShortcode('');
        setFeedback({
          type: 'success',
          message: t('account.subscription.promo.success'),
        });
      } else {
        setFeedback({
          type: 'error',
          message: resolvePromoErrorMessage(t, result.errorCode),
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = loading || submitting;

  return (
    <Card id={PROMO_CODE_CARD_ID} className="subscription-promo-card" variant="elevated">
      <h2 className="subscription-section-heading">{t('account.subscription.promo.heading')}</h2>
      <p className="subscription-promo-description">{t('account.subscription.promo.description')}</p>

      <form className="subscription-promo-form" onSubmit={(event) => void handleSubmit(event)}>
        <Input
          id={formId}
          label={t('account.subscription.promo.inputLabel')}
          placeholder={t('account.subscription.promo.inputPlaceholder')}
          value={shortcode}
          onChange={(event) => setShortcode(event.target.value)}
          disabled={isBusy}
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
        />
        <Button type="submit" disabled={isBusy} className="subscription-promo-submit">
          {isBusy ? <Spinner size="sm" /> : t('account.subscription.promo.submit')}
        </Button>
      </form>

      {feedback && (
        <Alert
          variant={feedback.type === 'success' ? 'success' : 'error'}
          className="subscription-promo-feedback"
        >
          {feedback.message}
        </Alert>
      )}
    </Card>
  );
}
