/**
 * Free-tier detection helper.
 *
 * Extracted to its own module to avoid mock contamination in Bun tests
 * when the alias-gate module is mocked wholesale.
 */

import type { SubscriptionTierId } from '@adieuu/shared';
import type { UserDocument } from '../../models/user';

/**
 * Returns true when the user's effective access is free-tier only: has an
 * active free subscription, no paid subscription, no lifetime purchase, and
 * no subscription overrides granting a paid tier. Users with admin-granted
 * overrides or entitlements are NOT considered free-tier. Users with no
 * billing at all are NOT considered free-tier (pre-subscription state).
 */
export function isFreeTierOnly(user: UserDocument): boolean {
  const billing = user.billing;
  if (!billing) return false;

  const billingTiers = billing.activeSubscriptions ?? [];
  if (billingTiers.length === 0) return false;
  if (!billingTiers.includes('free' as SubscriptionTierId)) return false;

  const hasPaidBilling = billingTiers.some((t: SubscriptionTierId) => t !== 'free');
  if (hasPaidBilling) return false;
  if (billing.isLifetime) return false;

  const overrides = user.subscriptionOverrides;
  if (overrides?.length) {
    const now = new Date();
    const hasActiveOverride = overrides.some(
      (o) => o.tier !== 'free' && (!o.expiresAt || o.expiresAt > now),
    );
    if (hasActiveOverride) return false;
  }

  if (user.entitlementOverrides?.length) return false;

  return true;
}
