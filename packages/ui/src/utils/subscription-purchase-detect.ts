import type { SubscriptionStatus } from '@adieuu/shared';

function fingerprint(s: SubscriptionStatus): string {
  return JSON.stringify({
    tiers: [...s.activeSubscriptions].sort(),
    ent: [...s.entitlements].sort(),
    life: s.isLifetime,
    st: s.status,
    hc: s.hasStripeCustomer,
  });
}

/**
 * Returns true when subscription billing summary changed in a way that
 * typically indicates checkout or portal activity has applied (webhook landed).
 */
export function subscriptionPurchaseApplied(
  before: SubscriptionStatus,
  after: SubscriptionStatus,
): boolean {
  return fingerprint(before) !== fingerprint(after);
}
