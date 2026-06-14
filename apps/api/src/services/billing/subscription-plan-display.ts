/**
 * Subscription plan display metadata for the account subscription UI.
 *
 * Separates lifetime *purchases/overrides* from entitlement-gated lifetime access
 * flags used elsewhere in {@link resolveEffectiveAccess}.
 */

import type { UserDocument } from '../../models/user';

export type SubscriptionPlanBadge = 'lifetime' | 'expiring' | 'annual';

export interface SubscriptionPlanDisplay {
  /** True only for lifetime purchases or subscription overrides without expiry. */
  isLifetime: boolean;
  planBadge: SubscriptionPlanBadge;
  planExpiresAt: Date | null;
}

function earliestActiveOverrideExpiry(user: UserDocument): Date | null {
  const now = new Date();
  const expiries = (user.subscriptionOverrides ?? [])
    .filter((o) => o.expiresAt && o.expiresAt > now)
    .map((o) => o.expiresAt!);
  if (!expiries.length) return null;
  return new Date(Math.min(...expiries.map((d) => d.getTime())));
}

/** Lifetime subscription purchase or admin override with no expiry. */
export function isLifetimeSubscription(user: UserDocument): boolean {
  if (user.billing?.isLifetime) return true;
  return (user.subscriptionOverrides ?? []).some((o) => !o.expiresAt);
}

export function resolvePlanExpiresAt(user: UserDocument): Date | null {
  if (isLifetimeSubscription(user)) return null;

  const overrideExpiry = earliestActiveOverrideExpiry(user);
  if (overrideExpiry) return overrideExpiry;

  if (user.billing?.currentPeriodEnd && !user.billing.isLifetime) {
    return user.billing.currentPeriodEnd;
  }

  return null;
}

export function resolvePlanBadge(user: UserDocument): SubscriptionPlanBadge {
  if (isLifetimeSubscription(user)) return 'lifetime';

  const now = new Date();
  const hasTimedOverride = (user.subscriptionOverrides ?? []).some(
    (o) => o.expiresAt && o.expiresAt > now,
  );
  if (hasTimedOverride) return 'expiring';
  if (user.billing?.status === 'trialing') return 'expiring';

  return 'annual';
}

export function resolveSubscriptionPlanDisplay(user: UserDocument): SubscriptionPlanDisplay {
  return {
    isLifetime: isLifetimeSubscription(user),
    planBadge: resolvePlanBadge(user),
    planExpiresAt: resolvePlanExpiresAt(user),
  };
}
