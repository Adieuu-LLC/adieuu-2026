import { useTranslation } from 'react-i18next';
import { Alert } from './Alert';
import { Button } from './Button';

export interface CheckoutPendingBannerProps {
  onCancel: () => void;
}

export function CheckoutPendingBanner({ onCancel }: CheckoutPendingBannerProps) {
  const { t } = useTranslation();

  return (
    <Alert variant="info" className="checkout-pending-banner">
      <div className="checkout-pending-banner__inner">
        <p className="checkout-pending-banner__message">{t('account.subscription.pending.message')}</p>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('account.subscription.pending.cancel')}
        </Button>
      </div>
    </Alert>
  );
}
