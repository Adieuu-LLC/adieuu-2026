/**
 * Sponsor checkout modal.
 *
 * Allows a sponsor to pick a plan and optionally reveal their identity
 * before redirecting to Stripe for payment.
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import {
  createApiClient,
  type SponsorshipDirectoryEntry,
  type PurchasableProductId,
  PURCHASABLE_PRODUCT_IDS,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { Icon } from '../../icons/Icon';
import { LegalAgreementNotice } from '../../components/LegalAgreementNotice';
import { useToast } from '../../components/Toast';
import { openCheckoutOrPortalUrl } from '../../utils/open-checkout-url';
import { usePlatformCapabilities } from '../../config';

const LIFETIME_PRODUCTS: ReadonlySet<string> = new Set(['vanguard', 'founder']);

export interface SponsorCheckoutModalProps {
  open: boolean;
  entry: SponsorshipDirectoryEntry;
  onClose: () => void;
}

export function SponsorCheckoutModal({ open, entry, onClose }: SponsorCheckoutModalProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const { openExternal } = usePlatformCapabilities();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const toast = useToast();

  const [product, setProduct] = useState<PurchasableProductId>(
    entry.preferredProduct ?? 'access',
  );
  const [revealIdentity, setRevealIdentity] = useState(false);
  const [sponsorFirstName, setSponsorFirstName] = useState('');
  const [sponsorLastInitial, setSponsorLastInitial] = useState('');
  const [loading, setLoading] = useState(false);

  const isLifetime = LIFETIME_PRODUCTS.has(product);

  async function handleCheckout() {
    if (loading) return;
    setLoading(true);

    try {
      const res = await api.sponsorship.createCheckout({
        requestId: entry.id,
        product,
        revealIdentity,
        sponsorFirstName: revealIdentity ? sponsorFirstName.trim() : undefined,
        sponsorLastInitial: revealIdentity ? sponsorLastInitial.trim().charAt(0) : undefined,
      });

      if (res.success && res.data?.url) {
        await openCheckoutOrPortalUrl(res.data.url, openExternal);
        onClose();
      } else {
        const code = (res as any).error?.code; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (code === 'SELF_SPONSOR') {
          toast.error(t('sponsorship.errors.selfSponsor'));
        } else if (code === 'REQUEST_UNAVAILABLE') {
          toast.error(t('sponsorship.errors.requestNotFound'));
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

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose(); }} closeOnInteractOutside={!loading}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="checkout-modal-content">
            <div className="checkout-modal-header">
              <Dialog.Title className="checkout-modal-title">
                {t('sponsorship.checkout.heading', { name: `${entry.firstName} ${entry.lastInitial}.` })}
              </Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <button
                  type="button"
                  className="checkout-modal-close-btn"
                  aria-label="Close"
                >
                  <Icon name="x" size="sm" />
                </button>
              </Dialog.CloseTrigger>
            </div>

            <div className="checkout-modal-body">
              <p className="sponsorship-checkout-description">
                {t('sponsorship.checkout.description', { name: `${entry.firstName} ${entry.lastInitial}.` })}
              </p>

              <label className="sponsorship-form-label">
                {t('sponsorship.checkout.planLabel')}
                <select
                  className="sponsorship-form-select"
                  value={product}
                  onChange={(e) => setProduct(e.target.value as PurchasableProductId)}
                >
                  {PURCHASABLE_PRODUCT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {t(`account.subscription.tiers.${id}.name`)}
                    </option>
                  ))}
                </select>
              </label>

              <p className="sponsorship-checkout-note">
                {isLifetime
                  ? t('sponsorship.checkout.lifetimeNote')
                  : t('sponsorship.checkout.annualNote')}
              </p>

              <div className="sponsorship-checkout-reveal">
                <label className="sponsorship-checkout-reveal-toggle">
                  <input
                    type="checkbox"
                    checked={revealIdentity}
                    onChange={(e) => setRevealIdentity(e.target.checked)}
                  />
                  <span>{t('sponsorship.checkout.revealLabel')}</span>
                </label>
                <p className="sponsorship-checkout-reveal-hint">
                  {t('sponsorship.checkout.revealHint')}
                </p>

                {revealIdentity && (
                  <div className="sponsorship-form-row">
                    <label className="sponsorship-form-label">
                      {t('sponsorship.checkout.revealFirstNameLabel')}
                      <input
                        type="text"
                        className="sponsorship-form-input"
                        value={sponsorFirstName}
                        onChange={(e) => setSponsorFirstName(e.target.value)}
                        maxLength={50}
                      />
                    </label>
                    <label className="sponsorship-form-label sponsorship-form-label--short">
                      {t('sponsorship.checkout.revealLastInitialLabel')}
                      <input
                        type="text"
                        className="sponsorship-form-input"
                        value={sponsorLastInitial}
                        onChange={(e) => setSponsorLastInitial(e.target.value.slice(0, 1))}
                        maxLength={1}
                      />
                    </label>
                  </div>
                )}
              </div>

              <Button
                variant="primary"
                className="checkout-modal-stripe-btn"
                onClick={handleCheckout}
                disabled={loading}
              >
                {loading ? <Spinner size="sm" /> : t('sponsorship.checkout.checkoutButton')}
              </Button>

              <LegalAgreementNotice variant="compact" className="checkout-modal-legal-notice" />
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
