import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  BillingDetailsPayload,
  BillingInvoiceEntry,
  BillingPromoRedemptionEntry,
} from '@adieuu/shared';
import { Card } from '../../../components/Card';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import { Alert } from '../../../components/Alert';
import type { BillingTabProps } from './types';
import { formatDate } from './types';

type BillingHistoryEntry =
  | {
      kind: 'invoice';
      date: string;
      invoice: BillingInvoiceEntry;
    }
  | {
      kind: 'promo';
      date: string;
      promo: BillingPromoRedemptionEntry;
    };

function formatCurrency(amountCents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

function formatCardBrand(brand: string): string {
  if (!brand) return brand;
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

function buildHistoryEntries(details: BillingDetailsPayload): BillingHistoryEntry[] {
  const entries: BillingHistoryEntry[] = [
    ...details.invoices.map((invoice) => ({
      kind: 'invoice' as const,
      date: invoice.created,
      invoice,
    })),
    ...details.promoRedemptions.map((promo) => ({
      kind: 'promo' as const,
      date: promo.redeemedAt,
      promo,
    })),
  ];

  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function BillingTab({
  status,
  derived,
  identityMode,
  actionLoading,
  onManage,
  billingDetails,
  billingDetailsLoading,
  billingDetailsError,
}: BillingTabProps) {
  const { t } = useTranslation();
  const { hasGifted } = derived;

  const historyEntries = useMemo(
    () => (billingDetails ? buildHistoryEntries(billingDetails) : []),
    [billingDetails],
  );

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

  if (billingDetailsLoading || (!billingDetails && !billingDetailsError)) {
    return (
      <div className="subscription-billing">
        <div className="subscription-billing-loading">
          <Spinner size="lg" />
          <p>{t('account.subscription.billing.loading')}</p>
        </div>
      </div>
    );
  }

  if (billingDetailsError) {
    return (
      <div className="subscription-billing">
        <Alert variant="error">{t('account.subscription.billing.loadError')}</Alert>
        {hasPortal && !hasGifted && (
          <Card className="subscription-billing-card">
            <Button
              type="button"
              onClick={() => void onManage()}
              disabled={actionLoading}
              variant="secondary"
              className="subscription-billing-portal-btn"
            >
              {actionLoading ? <Spinner size="sm" /> : t('account.subscription.billing.openStripe')}
            </Button>
          </Card>
        )}
      </div>
    );
  }

  const renewal = billingDetails?.renewal;
  const paymentMethod = billingDetails?.paymentMethod ?? null;

  return (
    <div className="subscription-billing">
      <Card className="subscription-billing-card">
        <h2 className="subscription-billing-heading">{t('account.subscription.billing.heading')}</h2>
        {hasGifted ? (
          <p className="subscription-billing-body">{t('account.subscription.billing.giftedBody')}</p>
        ) : (
          <p className="subscription-billing-body">{t('account.subscription.billing.stripeManaged')}</p>
        )}
        {hasPortal && !hasGifted && (
          <Button
            type="button"
            onClick={() => void onManage()}
            disabled={actionLoading}
            variant="secondary"
            className="subscription-billing-portal-btn"
          >
            {actionLoading ? <Spinner size="sm" /> : t('account.subscription.billing.openStripe')}
          </Button>
        )}
        {!hasPortal && (
          <p className="subscription-billing-no-customer">{t('account.subscription.billing.noCustomer')}</p>
        )}
      </Card>

      {renewal && (
        <Card className="subscription-billing-card">
          <h3 className="subscription-billing-subheading">
            {t('account.subscription.billing.renewalHeading')}
          </h3>
          {renewal.isLifetime ? (
            <p className="subscription-billing-body">{t('account.subscription.billing.lifetime')}</p>
          ) : renewal.currentPeriodEnd ? (
            <div className="subscription-billing-renewal-details">
              <p className="subscription-billing-body">
                {renewal.cancelAt
                  ? t('account.subscription.billing.cancelsOn', {
                      date: formatDate(renewal.cancelAt),
                    })
                  : renewal.cancelAtPeriodEnd
                    ? t('account.subscription.billing.cancelAtPeriodEnd')
                    : renewal.autoRenew
                      ? t('account.subscription.billing.renewsOn', {
                          date: formatDate(renewal.currentPeriodEnd),
                        })
                      : t('account.subscription.billing.expiresOn', {
                          date: formatDate(renewal.currentPeriodEnd),
                        })}
              </p>
              <p className="subscription-billing-meta">
                {renewal.autoRenew
                  ? t('account.subscription.billing.autoRenewOn')
                  : t('account.subscription.billing.autoRenewOff')}
              </p>
            </div>
          ) : (
            <p className="subscription-billing-body">{t('account.subscription.billing.noRenewalInfo')}</p>
          )}
        </Card>
      )}

      <Card className="subscription-billing-card">
        <h3 className="subscription-billing-subheading">
          {t('account.subscription.billing.paymentMethodHeading')}
        </h3>
        {paymentMethod ? (
          <div className="subscription-billing-payment-method">
            <p className="subscription-billing-body">
              {t('account.subscription.billing.paymentMethodCard', {
                brand: formatCardBrand(paymentMethod.brand),
                last4: paymentMethod.last4,
              })}
            </p>
            <p className="subscription-billing-meta">
              {t('account.subscription.billing.paymentMethodExpires', {
                month: paymentMethod.expMonth,
                year: paymentMethod.expYear,
              })}
            </p>
            {hasPortal && !hasGifted && (
              <Button
                type="button"
                onClick={() => void onManage()}
                disabled={actionLoading}
                variant="secondary"
                size="sm"
                className="subscription-billing-portal-btn"
              >
                {actionLoading ? (
                  <Spinner size="sm" />
                ) : (
                  t('account.subscription.billing.updatePaymentMethod')
                )}
              </Button>
            )}
          </div>
        ) : (
          <p className="subscription-billing-body">{t('account.subscription.billing.noPaymentMethod')}</p>
        )}
      </Card>

      <Card className="subscription-billing-card">
        <h3 className="subscription-billing-subheading">
          {t('account.subscription.billing.historyHeading')}
        </h3>
        {historyEntries.length === 0 ? (
          <p className="subscription-billing-body">{t('account.subscription.billing.historyEmpty')}</p>
        ) : (
          <div className="subscription-billing-history">
            <div className="subscription-billing-history-header" aria-hidden>
              <span>{t('account.subscription.billing.historyDate')}</span>
              <span>{t('account.subscription.billing.historyDescription')}</span>
              <span>{t('account.subscription.billing.historyAmount')}</span>
              <span>{t('account.subscription.billing.historyStatus')}</span>
            </div>
            <ul className="subscription-billing-history-list">
              {historyEntries.map((entry) => {
                if (entry.kind === 'invoice') {
                  const { invoice } = entry;
                  const statusLabel = t(
                    `account.subscription.billing.invoiceStatus.${invoice.status}`,
                    { defaultValue: invoice.status },
                  );

                  return (
                    <li key={`invoice-${invoice.id}`} className="subscription-billing-history-row">
                      <span className="subscription-billing-history-date">
                        {formatDate(entry.date)}
                      </span>
                      <span className="subscription-billing-history-description">
                        <span className="subscription-billing-history-type">
                          {t('account.subscription.billing.historyTypeInvoice')}
                        </span>
                        {invoice.number
                          ? t('account.subscription.billing.invoiceDescription', {
                              number: invoice.number,
                            })
                          : t('account.subscription.billing.invoiceDescriptionFallback')}
                        {invoice.hostedInvoiceUrl && (
                          <a
                            href={invoice.hostedInvoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="subscription-billing-history-link"
                          >
                            {t('account.subscription.billing.viewInvoice')}
                          </a>
                        )}
                      </span>
                      <span className="subscription-billing-history-amount">
                        {formatCurrency(invoice.amountPaid ?? invoice.amountDue, invoice.currency)}
                      </span>
                      <span className="subscription-billing-history-status">{statusLabel}</span>
                    </li>
                  );
                }

                const { promo } = entry;
                const promoDescription =
                  promo.description ??
                  t('account.subscription.billing.promoDescription', {
                    shortcode: promo.shortcode,
                  });
                const grantDescription = promo.subscriptionOverride
                  ? t('account.subscription.billing.promoGrantedTier', {
                      tier: t(`account.subscription.tiers.${promo.subscriptionOverride.tier}.name`, {
                        defaultValue: promo.subscriptionOverride.tier,
                      }),
                      date: formatDate(promo.subscriptionOverride.expiresAt),
                    })
                  : promo.entitlements.length > 0
                    ? t('account.subscription.billing.promoGrantedEntitlements', {
                        entitlements: promo.entitlements.join(', '),
                      })
                    : t('account.subscription.billing.promoNoGrant');

                return (
                  <li key={`promo-${promo.shortcode}-${promo.redeemedAt}`} className="subscription-billing-history-row">
                    <span className="subscription-billing-history-date">{formatDate(entry.date)}</span>
                    <span className="subscription-billing-history-description">
                      <span className="subscription-billing-history-type">
                        {t('account.subscription.billing.historyTypePromo')}
                      </span>
                      {promoDescription}
                      <span className="subscription-billing-history-grant">{grantDescription}</span>
                    </span>
                    <span className="subscription-billing-history-amount">—</span>
                    <span className="subscription-billing-history-status">
                      {t('account.subscription.billing.historyTypePromo')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
