import { useTranslation } from 'react-i18next';
import { Card } from '../../../components/Card';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import { Alert } from '../../../components/Alert';
import type { BillingTabProps } from './types';

export function BillingTab({
  status,
  derived,
  identityMode,
  actionLoading,
  onManage,
}: BillingTabProps) {
  const { t } = useTranslation();
  const { hasGifted } = derived;

  if (identityMode) {
    return (
      <div className="subscription-billing">
        <Alert variant="info" className="subscription-identity-banner">
          {t('account.subscription.identityBanner')}
        </Alert>
      </div>
    );
  }

  const hasPortal = status?.hasStripeCustomer === true;

  return (
    <div className="subscription-billing">
      <Card className="subscription-billing-card">
        <h2 className="subscription-billing-heading">{t('account.subscription.billing.heading')}</h2>
        {hasGifted ? (
          <p className="subscription-billing-body">{t('account.subscription.billing.giftedBody')}</p>
        ) : (
          <>
            <p className="subscription-billing-body">{t('account.subscription.billing.stripeManaged')}</p>
            {hasPortal ? (
              <Button
                type="button"
                onClick={() => void onManage()}
                disabled={actionLoading}
                variant="secondary"
                className="subscription-billing-portal-btn"
              >
                {actionLoading ? <Spinner size="sm" /> : t('account.subscription.billing.openStripe')}
              </Button>
            ) : (
              <p className="subscription-billing-no-customer">{t('account.subscription.billing.noCustomer')}</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
