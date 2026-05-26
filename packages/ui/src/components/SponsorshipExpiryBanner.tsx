/**
 * Sidebar banner that warns when a sponsored subscription is nearing expiry.
 *
 * Shown when the user has a `gifted` entitlement and a SubscriptionOverride
 * expiring within 7 days. Dismissible per session.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { Icon } from '../icons/Icon';

const EXPIRY_WARNING_DAYS = 7;

export function SponsorshipExpiryBanner() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const entitlements = session?.entitlements ?? [];
  if (!entitlements.includes('gifted')) return null;

  // sponsoredExpiry is not on SessionInfo; we use the subscription page's
  // derived state for now. This banner reads from auth session data when
  // available from a future session enhancement. For now, this component
  // will be wired with a prop or context from the subscription status.
  // Placeholder: check nothing to render until that data is provided.
  // This will be connected when the subscription status is surfaced on session.

  return null;
}

export interface SponsorshipExpiryBannerControlledProps {
  expiryDate: string;
}

/**
 * Controlled version that receives the expiry date as a prop.
 * Used where the subscription status is already loaded.
 */
export function SponsorshipExpiryBannerControlled({
  expiryDate,
}: SponsorshipExpiryBannerControlledProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const expiry = new Date(expiryDate);
  const now = new Date();
  const daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysRemaining > EXPIRY_WARNING_DAYS || daysRemaining < 0) return null;

  return (
    <div className="sponsorship-expiry-banner" role="alert">
      <div className="sponsorship-expiry-banner-content">
        <Icon name="clock" size="xs" />
        <span>
          {t('sponsorship.sidebar.expiryBanner', { date: expiry.toLocaleDateString() })}
          {' '}
          <Link to="/account/subscription" className="sponsorship-expiry-banner-link">
            {t('sponsorship.sidebar.expiryAction')}
          </Link>
        </span>
      </div>
      <button
        type="button"
        className="sponsorship-expiry-banner-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        <Icon name="x" size="xs" />
      </button>
    </div>
  );
}
