/**
 * Resolves effective subscriptions and entitlements by merging Stripe-managed
 * billing with admin-granted overrides.
 *
 * Overrides live outside `UserBilling` so Stripe sync never clobbers them.
 * Subscription overrides support an optional expiry; entitlement overrides
 * are always lifetime.
 *
 * PRIVACY: Account-level helpers accept `UserDocument`. Identity-level
 * helpers accept `IdentityDocument`. These types are never interchanged.
 *
 * @module services/billing/resolve-access
 */

import type { SubscriptionTierId } from '@adieuu/shared';
import type { UserDocument, SubscriptionOverride } from '../../models/user';
import type { IdentityDocument } from '../../models/identity';
import type { IdentityContext } from '../../middleware/identity-session';

// ---------------------------------------------------------------------------
// Resolved access type
// ---------------------------------------------------------------------------

export interface ResolvedAccess {
  subscriptions: SubscriptionTierId[];
  entitlements: string[];
  isLifetime: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function filterActiveSubscriptionOverrides(
  overrides: SubscriptionOverride[] | undefined,
): SubscriptionTierId[] {
  if (!overrides?.length) return [];
  const now = new Date();
  return overrides
    .filter((o) => !o.expiresAt || o.expiresAt > now)
    .map((o) => o.tier);
}

function hasLifetimeOverride(
  overrides: SubscriptionOverride[] | undefined,
  entitlementOverrides: string[] | undefined,
): boolean {
  if (entitlementOverrides?.length) return true;
  if (!overrides?.length) return false;
  return overrides.some((o) => !o.expiresAt);
}

// ---------------------------------------------------------------------------
// Account-level resolution
// ---------------------------------------------------------------------------

/**
 * Merges Stripe billing with account-level admin overrides to produce the
 * effective subscriptions, entitlements, and lifetime flag.
 */
export function resolveEffectiveAccess(user: UserDocument): ResolvedAccess {
  const billingTiers = user.billing?.activeSubscriptions ?? [];
  const billingEntitlements = user.billing?.entitlements ?? [];
  const overrideTiers = filterActiveSubscriptionOverrides(user.subscriptionOverrides);
  const overrideEntitlements = user.entitlementOverrides ?? [];

  const subscriptions = [...new Set<SubscriptionTierId>([...billingTiers, ...overrideTiers])];
  const entitlements = [...new Set<string>([...billingEntitlements, ...overrideEntitlements])];

  const isLifetime =
    (user.billing?.isLifetime ?? false) ||
    hasLifetimeOverride(user.subscriptionOverrides, user.entitlementOverrides);

  return { subscriptions, entitlements, isLifetime };
}

// ---------------------------------------------------------------------------
// Identity-level resolution
// ---------------------------------------------------------------------------

/**
 * Returns the identity's own override additions (already filtered for expiry).
 * These are merged into the session-derived arrays at the middleware layer.
 */
export function resolveIdentityOverrides(
  identity: IdentityDocument,
): { subscriptions: SubscriptionTierId[]; entitlements: string[] } {
  return {
    subscriptions: filterActiveSubscriptionOverrides(identity.subscriptionOverrides),
    entitlements: identity.entitlementOverrides ?? [],
  };
}

// ---------------------------------------------------------------------------
// Pure access-check helpers
// ---------------------------------------------------------------------------

/** Whether the resolved account-level access includes a given tier. */
export function hasSubscription(
  resolved: ResolvedAccess,
  tier: SubscriptionTierId,
): boolean {
  return resolved.subscriptions.includes(tier);
}

/** Whether the resolved account-level access includes a given entitlement. */
export function hasEntitlement(
  resolved: ResolvedAccess,
  entitlement: string,
): boolean {
  return resolved.entitlements.includes(entitlement);
}

/** Whether the identity context includes a given subscription tier. */
export function identityHasSubscription(
  ctx: IdentityContext,
  tier: SubscriptionTierId,
): boolean {
  return ctx.subscriptions.includes(tier);
}

/** Whether the identity context includes a given entitlement. */
export function identityHasEntitlement(
  ctx: IdentityContext,
  entitlement: string,
): boolean {
  return ctx.entitlements.includes(entitlement);
}
