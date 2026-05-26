import { useMemo } from 'react';
import { Dialog, Portal, Accordion } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import type { PurchasableProductId, SubscriptionCatalogPricesMap } from '@adieuu/shared';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import { Icon } from '../../../icons/Icon';

export interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: PurchasableProductId | null;
  catalogPrices: SubscriptionCatalogPricesMap | null;
  onCheckout: (product: PurchasableProductId) => void;
  loading: boolean;
}

const LIFETIME_PRODUCTS: ReadonlySet<string> = new Set(['vanguard', 'founder']);

export function CheckoutModal({
  open,
  onOpenChange,
  product,
  catalogPrices,
  onCheckout,
  loading,
}: CheckoutModalProps) {
  const { t } = useTranslation();

  const usdFormatter = useMemo(
    () => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }),
    [],
  );

  const priceEntry = product ? catalogPrices?.[product] : undefined;
  const isLifetime = product ? LIFETIME_PRODUCTS.has(product) : false;

  const annualAmount = priceEntry
    ? usdFormatter.format(priceEntry.unitAmountUsdCents / 100)
    : null;

  const monthlyAmount =
    priceEntry && !isLifetime
      ? usdFormatter.format(priceEntry.unitAmountUsdCents / 100 / 12)
      : null;

  const tierName = product
    ? t(`account.subscription.tiers.${product}.name`)
    : '';

  const handleCheckout = () => {
    if (product) onCheckout(product);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => onOpenChange(e.open)}
      closeOnInteractOutside={!loading}
    >
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="checkout-modal-content">
            <div className="checkout-modal-header">
              <Dialog.Title className="checkout-modal-title">
                {t('account.subscription.checkoutModal.title', { tier: tierName })}
              </Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <button
                  type="button"
                  className="checkout-modal-close-btn"
                  aria-label={t('account.subscription.checkoutModal.close')}
                >
                  <Icon name="x" size="sm" />
                </button>
              </Dialog.CloseTrigger>
            </div>

            <div className="checkout-modal-body">
              {annualAmount && (
                <div className="checkout-modal-pricing">
                  <div className="checkout-modal-price-primary">
                    {isLifetime
                      ? t('account.subscription.checkoutModal.lifetimePrice', { amount: annualAmount })
                      : t('account.subscription.checkoutModal.annualPrice', { amount: annualAmount })}
                  </div>
                  {monthlyAmount && (
                    <div className="checkout-modal-price-monthly">
                      {t('account.subscription.checkoutModal.monthlyEquivalent', { amount: monthlyAmount })}
                    </div>
                  )}
                </div>
              )}

              <div className="checkout-modal-due-today">
                <span className="checkout-modal-due-label">
                  {t('account.subscription.checkoutModal.dueToday')}
                </span>
                <span className="checkout-modal-due-amount">
                  {annualAmount ?? '—'}
                </span>
              </div>

              <Button
                variant="primary"
                className="checkout-modal-stripe-btn"
                onClick={handleCheckout}
                disabled={loading || !product}
              >
                {loading ? <Spinner size="sm" /> : t('account.subscription.checkoutModal.checkoutWithStripe')}
              </Button>

              <Accordion.Root collapsible className="checkout-modal-accordion">
                <Accordion.Item value="cash">
                  <Accordion.ItemTrigger className="checkout-modal-accordion-trigger">
                    <span>{t('account.subscription.checkoutModal.cashTitle')}</span>
                    <Accordion.ItemIndicator className="checkout-modal-accordion-indicator">
                      <Icon name="chevronDown" size="xs" />
                    </Accordion.ItemIndicator>
                  </Accordion.ItemTrigger>
                  <Accordion.ItemContent className="checkout-modal-accordion-content">
                    <p>{t('account.subscription.checkoutModal.cashBody')}</p>
                    <address className="checkout-modal-cash-address">
                      {t('account.subscription.checkoutModal.cashAddress')}
                    </address>
                  </Accordion.ItemContent>
                </Accordion.Item>
              </Accordion.Root>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
